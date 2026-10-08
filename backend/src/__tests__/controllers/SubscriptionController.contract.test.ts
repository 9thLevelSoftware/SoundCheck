import express from 'express';
import request from 'supertest';
import { SubscriptionController } from '../../controllers/SubscriptionController';

describe('SubscriptionController RevenueCat webhook contract', () => {
  const subscriptionService = {
    processWebhookEvent: jest.fn(),
    getSubscriptionStatus: jest.fn(),
  };
  const originalWebhookAuth = process.env.REVENUECAT_WEBHOOK_AUTH;

  const createApp = () => {
    const controller = new SubscriptionController({ subscriptionService });
    const app = express();
    app.use(express.json());
    app.post('/webhook', controller.handleWebhook);
    app.use(
      (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ error: error.message });
      }
    );
    return app;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REVENUECAT_WEBHOOK_AUTH = 'revenuecat-test-secret';
  });

  afterAll(() => {
    if (originalWebhookAuth === undefined) {
      delete process.env.REVENUECAT_WEBHOOK_AUTH;
    } else {
      process.env.REVENUECAT_WEBHOOK_AUTH = originalWebhookAuth;
    }
  });

  it('acknowledges without processing when webhook authentication is not configured', async () => {
    delete process.env.REVENUECAT_WEBHOOK_AUTH;

    const response = await request(createApp())
      .post('/webhook')
      .send({
        event: { id: 'event-1', type: 'INITIAL_PURCHASE' },
      });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ success: false, error: 'Webhook not configured' });
    expect(subscriptionService.processWebhookEvent).not.toHaveBeenCalled();
  });

  it('acknowledges an invalid authorization token without processing', async () => {
    const response = await request(createApp())
      .post('/webhook')
      .set('Authorization', 'Bearer revenuecat-wrong-token')
      .send({ event: { id: 'event-2', type: 'INITIAL_PURCHASE' } });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ success: false, error: 'Unauthorized' });
    expect(subscriptionService.processWebhookEvent).not.toHaveBeenCalled();
  });

  it('acknowledges malformed payloads without processing or triggering retries', async () => {
    const response = await request(createApp())
      .post('/webhook')
      .set('Authorization', 'Bearer revenuecat-test-secret')
      .send({ event: { id: 'event-3' } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Invalid payload, skipping' });
    expect(subscriptionService.processWebhookEvent).not.toHaveBeenCalled();
  });

  it('maps a valid RevenueCat envelope and returns the canonical response', async () => {
    subscriptionService.processWebhookEvent.mockResolvedValue({
      processed: true,
      reason: 'OK',
    });

    const response = await request(createApp())
      .post('/webhook')
      .set('Authorization', 'Bearer revenuecat-test-secret')
      .send({
        event: {
          id: 'event-4',
          type: 'RENEWAL',
          app_user_id: 'user-4',
          entitlement_id: 'pro',
          environment: 'PRODUCTION',
          expiration_at_ms: 1_800_000_000_000,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { message: 'OK' },
    });
    expect(subscriptionService.processWebhookEvent).toHaveBeenCalledWith({
      id: 'event-4',
      type: 'RENEWAL',
      app_user_id: 'user-4',
      entitlement_ids: ['pro'],
      environment: 'PRODUCTION',
      expiration_at_ms: 1_800_000_000_000,
    });
  });

  it('surfaces processing failures so provider retries remain available', async () => {
    subscriptionService.processWebhookEvent.mockRejectedValue(new Error('database timeout'));

    const response = await request(createApp())
      .post('/webhook')
      .set('Authorization', 'Bearer revenuecat-test-secret')
      .send({
        event: {
          id: 'event-5',
          type: 'INITIAL_PURCHASE',
          app_user_id: 'user-5',
          entitlement_ids: ['pro'],
        },
      });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'database timeout' });
  });
});
