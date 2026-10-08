export type OverallHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface WebhookAuthHealth {
  configured: boolean;
  status: 'healthy' | 'misconfigured';
}

/**
 * RevenueCat will not update premium state when the webhook secret is missing.
 * Surface that to operators without turning a config gap into a process crash.
 */
export function revenueCatWebhookHealth(
  env: { REVENUECAT_WEBHOOK_AUTH?: string } = process.env
): WebhookAuthHealth {
  const secret = env.REVENUECAT_WEBHOOK_AUTH;
  const configured = typeof secret === 'string' && secret.trim().length > 0;
  return {
    configured,
    status: configured ? 'healthy' : 'misconfigured',
  };
}

/**
 * HTTP 503 is reserved for Postgres being down. A missing webhook secret
 * degrades the payload while the process stays up so Railway does not restart-loop.
 */
export function resolveOverallHealth(input: {
  databaseHealthy: boolean;
  redisFeaturesHealthy: boolean;
  poolExhausted: boolean;
  webhookConfigured: boolean;
}): { status: OverallHealthStatus; httpStatus: number } {
  const status: OverallHealthStatus = !input.databaseHealthy
    ? 'unhealthy'
    : !input.redisFeaturesHealthy || input.poolExhausted || !input.webhookConfigured
      ? 'degraded'
      : 'healthy';

  return {
    status,
    httpStatus: input.databaseHealthy ? 200 : 503,
  };
}
