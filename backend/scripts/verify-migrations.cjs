/* global URL, __dirname, process, setTimeout */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { Client } = require('pg');

const { deployMigrations } = require('../dist/scripts/migrateDeploy.js');

const databaseUrl = process.env.PHASE30_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('PHASE30_DATABASE_URL is required');
}

const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = parsedDatabaseUrl.pathname.replace(/^\//, '');
if (
  !['localhost', '127.0.0.1', 'host.docker.internal'].includes(parsedDatabaseUrl.hostname) ||
  (!databaseName.includes('phase30') &&
    !(process.env.CI === 'true' && databaseName === 'soundcheck_ci'))
) {
  throw new Error(
    'Migration verification is restricted to a local phase30 database or the soundcheck_ci CI service'
  );
}

const bootstrapDir = path.resolve(__dirname, '../dist/bootstrap-migrations');
const migrationsDir = path.resolve(__dirname, '../dist/migrations');
const NORMAL_MIGRATION_COUNT = 65;

function createClient(applicationName) {
  return new Client({
    connectionString: databaseUrl,
    ssl: false,
    application_name: applicationName,
  });
}

async function withClient(applicationName, operation) {
  const client = createClient(applicationName);
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function resetSchema() {
  await withClient('phase30-reset', async (client) => {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
  });
}

async function deploy(applicationName, directories = {}) {
  return withClient(applicationName, (client) =>
    deployMigrations({
      client,
      bootstrapDir: directories.bootstrapDir ?? bootstrapDir,
      migrationsDir: directories.migrationsDir ?? migrationsDir,
    })
  );
}

async function migrationCounts() {
  return withClient('phase30-counts', async (client) => {
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM pgmigrations_bootstrap) AS bootstrap_count,
        (SELECT COUNT(*)::int FROM pgmigrations) AS migration_count
    `);
    return result.rows[0];
  });
}

async function verifyEmptyDatabase() {
  await resetSchema();
  await deploy('phase30-empty');

  const counts = await migrationCounts();
  assert.equal(counts.bootstrap_count, 1);
  assert.equal(counts.migration_count, NORMAL_MIGRATION_COUNT);
  await withClient('phase30-empty-check', async (client) => {
    const result = await client.query(
      "SELECT to_regclass('public.users') AS users, to_regclass('public.device_tokens') AS device_tokens"
    );
    assert.equal(result.rows[0].users, 'users');
    assert.equal(result.rows[0].device_tokens, 'device_tokens');
  });
  process.stdout.write('Migration integration: empty database passed\n');
}

async function verifyExistingHistoryUpgrade() {
  await withClient('phase30-existing-setup', async (client) => {
    await client.query('CREATE TABLE phase30_existing_marker (id integer PRIMARY KEY)');
    await client.query('INSERT INTO phase30_existing_marker (id) VALUES (1)');
    await client.query('DROP TABLE pgmigrations_bootstrap');
  });

  await deploy('phase30-existing');

  const counts = await migrationCounts();
  assert.equal(counts.bootstrap_count, 1);
  assert.equal(counts.migration_count, NORMAL_MIGRATION_COUNT);
  await withClient('phase30-existing-check', async (client) => {
    const result = await client.query('SELECT COUNT(*)::int AS count FROM phase30_existing_marker');
    assert.equal(result.rows[0].count, 1);
  });
  process.stdout.write('Migration integration: existing history upgrade passed\n');
}

async function verifyRollbackAndReupgrade() {
  const { runner } = await import('node-pg-migrate');
  await withClient('phase30-rollback-fixture', async (client) => {
    const venue = await client.query(
      "INSERT INTO venues (name) VALUES ('Rollback Venue') RETURNING id"
    );
    const user = await client.query(
      "INSERT INTO users (email, password_hash, username) VALUES ('rollback@example.test', 'hash', 'rollback-user') RETURNING id"
    );
    await client.query(
      `INSERT INTO events
         (venue_id, event_date, event_name, created_by_user_id, source, status)
       VALUES ($1, DATE '2026-08-24', 'Replacement Pair (cancelled)', $2, 'user_created', 'cancelled'),
              ($1, DATE '2026-08-24', 'Replacement Pair (active)', $2, 'user_created', 'active')`,
      [venue.rows[0].id, user.rows[0].id]
    );

    const duplicates = await client.query(
      `SELECT venue_id, event_date, event_name, created_by_user_id, COUNT(*)::int AS count
       FROM events
       WHERE source = 'user_created'
       GROUP BY venue_id, event_date, event_name, created_by_user_id
       HAVING COUNT(*) > 1`
    );
    assert.equal(duplicates.rowCount, 0);
  });
  await withClient('phase30-rollback', async (client) => {
    await runner({
      dbClient: client,
      dir: migrationsDir,
      direction: 'down',
      count: 1,
      migrationsTable: 'pgmigrations',
    });
  });

  let counts = await migrationCounts();
  assert.equal(counts.migration_count, NORMAL_MIGRATION_COUNT - 1);

  await deploy('phase30-reupgrade');
  counts = await migrationCounts();
  assert.equal(counts.bootstrap_count, 1);
  assert.equal(counts.migration_count, NORMAL_MIGRATION_COUNT);
  process.stdout.write('Migration integration: rollback and re-upgrade passed\n');
}

async function verifyConcurrentDeploys() {
  await resetSchema();
  await Promise.all([deploy('phase30-concurrent-a'), deploy('phase30-concurrent-b')]);

  const counts = await migrationCounts();
  assert.equal(counts.bootstrap_count, 1);
  assert.equal(counts.migration_count, NORMAL_MIGRATION_COUNT);
  process.stdout.write('Migration integration: concurrent deploys passed\n');
}

async function waitForSleepingMigration(adminClient) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await adminClient.query(`
      SELECT pid
      FROM pg_stat_activity
      WHERE application_name = 'phase30-interrupted'
        AND state = 'active'
        AND query LIKE '%pg_sleep%'
    `);
    if (result.rows[0]) {
      return result.rows[0].pid;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the interruptible migration');
}

async function verifyInterruptedRecovery() {
  await resetSchema();
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'soundcheck-phase30-migrations-'));
  const temporaryBootstrap = path.join(temporaryRoot, 'bootstrap');
  const temporaryMigrations = path.join(temporaryRoot, 'migrations');
  fs.mkdirSync(temporaryBootstrap);
  fs.mkdirSync(temporaryMigrations);
  fs.writeFileSync(
    path.join(temporaryBootstrap, '000_interruptible.js'),
    `
exports.up = (pgm) => {
  pgm.sql('CREATE TABLE interrupted_bootstrap (id integer PRIMARY KEY)');
  pgm.sql("SELECT pg_sleep(CASE WHEN current_setting('application_name') = 'phase30-interrupted' THEN 30 ELSE 0 END)");
};
exports.down = () => {};
`
  );
  fs.writeFileSync(
    path.join(temporaryMigrations, '001_after_recovery.js'),
    `
exports.up = (pgm) => pgm.sql('CREATE TABLE recovered_migration (id integer PRIMARY KEY)');
exports.down = (pgm) => pgm.sql('DROP TABLE recovered_migration');
`
  );

  try {
    const interruptedClient = createClient('phase30-interrupted');
    const adminClient = createClient('phase30-interrupt-admin');
    interruptedClient.on('error', () => {
      // pg_terminate_backend emits both a rejected query and a client error.
      // The rejection below is the recovery behavior this test asserts.
    });
    await interruptedClient.connect();
    await adminClient.connect();
    const interruptedDeploy = deployMigrations({
      client: interruptedClient,
      bootstrapDir: temporaryBootstrap,
      migrationsDir: temporaryMigrations,
    });
    const interruptedPid = await waitForSleepingMigration(adminClient);
    await adminClient.query('SELECT pg_terminate_backend($1)', [interruptedPid]);
    await assert.rejects(interruptedDeploy);
    await interruptedClient.end().catch(() => undefined);
    await adminClient.end();

    await withClient('phase30-interrupted-check', async (client) => {
      const result = await client.query(
        "SELECT to_regclass('public.interrupted_bootstrap') AS interrupted"
      );
      assert.equal(result.rows[0].interrupted, null);
    });

    await deploy('phase30-recovery', {
      bootstrapDir: temporaryBootstrap,
      migrationsDir: temporaryMigrations,
    });
    await withClient('phase30-recovery-check', async (client) => {
      const result = await client.query(`
        SELECT
          to_regclass('public.interrupted_bootstrap') AS bootstrap_table,
          to_regclass('public.recovered_migration') AS migration_table,
          (SELECT COUNT(*)::int FROM pgmigrations_bootstrap) AS bootstrap_count,
          (SELECT COUNT(*)::int FROM pgmigrations) AS migration_count
      `);
      assert.equal(result.rows[0].bootstrap_table, 'interrupted_bootstrap');
      assert.equal(result.rows[0].migration_table, 'recovered_migration');
      assert.equal(result.rows[0].bootstrap_count, 1);
      assert.equal(result.rows[0].migration_count, 1);
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }

  process.stdout.write('Migration integration: interrupted recovery passed\n');
}

async function main() {
  await verifyEmptyDatabase();
  await verifyExistingHistoryUpgrade();
  await verifyRollbackAndReupgrade();
  await verifyConcurrentDeploys();
  await verifyInterruptedRecovery();
  process.stdout.write('Migration integration: 5/5 scenarios passed\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
