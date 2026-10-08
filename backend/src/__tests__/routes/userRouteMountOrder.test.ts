import fs from 'fs';
import path from 'path';
import express from 'express';
import request from 'supertest';

/**
 * Production mounts these three routers on /api/users. userRoutes ends with
 * GET /:username, so export and consents must be mounted first or Express
 * treats those path segments as usernames.
 */
function userSurfaceMounts(source: string): Array<{ mountPath: string; routerName: string }> {
  const pattern =
    /app\.use\('(\/api\/users(?:\/consents)?)',\s*(userRoutes|dataExportRoutes|consentRoutes)\)/g;
  return [...source.matchAll(pattern)].map((match) => ({
    mountPath: match[1],
    routerName: match[2],
  }));
}

describe('user route mount order', () => {
  const indexSource = fs.readFileSync(path.resolve(__dirname, '../../index.ts'), 'utf8');

  it('serves export and consents instead of the username catch-all', async () => {
    const mounts = userSurfaceMounts(indexSource);
    const app = express();
    const userRoutes = express.Router();
    userRoutes.get('/:username', (_req, res) => {
      res.status(404).json({ success: false, error: 'User not found' });
    });
    const dataExportRoutes = express.Router();
    dataExportRoutes.get('/export', (_req, res) => {
      res.status(401).json({ success: false, error: 'Access token required' });
    });
    const consentRoutes = express.Router();
    consentRoutes.get('/', (_req, res) => {
      res.status(401).json({ success: false, error: 'Access token required' });
    });
    const routers: Record<string, express.Router> = {
      userRoutes,
      dataExportRoutes,
      consentRoutes,
    };

    for (const mount of mounts) {
      app.use(mount.mountPath, routers[mount.routerName]);
    }

    const exportResponse = await request(app).get('/api/users/export');
    const consentResponse = await request(app).get('/api/users/consents');
    const profileResponse = await request(app).get('/api/users/alice');

    expect(exportResponse.status).toBe(401);
    expect(exportResponse.body.error).toBe('Access token required');
    expect(consentResponse.status).toBe(401);
    expect(consentResponse.body.error).toBe('Access token required');
    expect(profileResponse.status).toBe(404);
    expect(profileResponse.body.error).toBe('User not found');
  });
});
