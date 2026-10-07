import { resolveOverallHealth, revenueCatWebhookHealth } from '../../utils/healthStatus';

describe('revenueCat webhook health', () => {
  it('reports a missing webhook secret as misconfigured', () => {
    expect(revenueCatWebhookHealth({})).toEqual({
      configured: false,
      status: 'misconfigured',
    });
    expect(revenueCatWebhookHealth({ REVENUECAT_WEBHOOK_AUTH: '   ' })).toEqual({
      configured: false,
      status: 'misconfigured',
    });
  });

  it('reports a configured webhook secret as healthy', () => {
    expect(revenueCatWebhookHealth({ REVENUECAT_WEBHOOK_AUTH: 'secret' })).toEqual({
      configured: true,
      status: 'healthy',
    });
  });
});

describe('resolveOverallHealth', () => {
  const healthy = {
    databaseHealthy: true,
    redisFeaturesHealthy: true,
    poolExhausted: false,
    webhookConfigured: true,
  };

  it('stays HTTP 200 and degraded when only the webhook secret is missing', () => {
    expect(resolveOverallHealth({ ...healthy, webhookConfigured: false })).toEqual({
      status: 'degraded',
      httpStatus: 200,
    });
  });

  it('returns 503 only when Postgres is down', () => {
    expect(resolveOverallHealth({ ...healthy, databaseHealthy: false })).toEqual({
      status: 'unhealthy',
      httpStatus: 503,
    });
  });
});
