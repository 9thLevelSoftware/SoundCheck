/**
 * SubscriptionController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import crypto from 'crypto';
import { SubscriptionService } from '../services/SubscriptionService';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError } from '../utils/errors';
import logger from '../utils/logger';

export class SubscriptionController {
  private subscriptionService = new SubscriptionService();

  /**
   * POST /api/subscription/webhook -- RevenueCat webhook handler
   * No auth middleware (RevenueCat calls this) -- validates Authorization header manually.
   */
  handleWebhook = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // 1. Validate Authorization header
    const webhookAuth = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!webhookAuth) {
      logger.error('SubscriptionController: REVENUECAT_WEBHOOK_AUTH not configured');
      res.status(200).json({ message: 'Webhook not configured' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    // SEC-016/CFR-018: Use timing-safe comparison to prevent timing attacks
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(webhookAuth);
    if (
      tokenBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(tokenBuf, expectedBuf)
    ) {
      logger.warn('SubscriptionController: Invalid webhook authorization');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // 2. Extract event from payload
    const event = req.body?.event;
    if (!event || !event.id || !event.type) {
      res.status(200).json({ message: 'Invalid payload, skipping' });
      return;
    }

    // 3. Process event
    const result = await this.subscriptionService.processWebhookEvent({
      id: event.id,
      type: event.type,
      app_user_id: event.app_user_id,
    });

    // API-031: Use canonical ApiResponse format for webhook responses
    res.status(200).json({ success: true, data: { message: result.reason } });
  });

  /**
   * GET /api/subscription/status -- Current user's subscription status
   */
  getStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // CFR-017: Guard non-null assertion; API-032: Use explicit status
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const status = await this.subscriptionService.getSubscriptionStatus(userId);
    res.status(200).json({ success: true, data: status });
  });
}
