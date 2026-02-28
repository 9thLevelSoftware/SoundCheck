/**
 * ShareController -- HTTP handlers for share card generation and landing pages.
 *
 * Endpoints:
 *   POST /api/share/checkin/:checkinId  -- Generate card images (authenticated)
 *   POST /api/share/badge/:badgeAwardId -- Generate card images (authenticated)
 *   GET  /share/c/:checkinId            -- Public landing page (no auth)
 *   GET  /share/b/:badgeAwardId         -- Public landing page (no auth)
 *
 * Phase 10: Viral Growth Engine
 */

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { ShareCardService } from '../services/ShareCardService';
import { CheckinService } from '../services/CheckinService';
import { BadgeService } from '../services/BadgeService';
import { ApiResponse } from '../types';
import { logError } from '../utils/logger';

// ============================================
// HTML sanitization
// ============================================

/**
 * Escape user-generated strings for safe HTML template injection.
 * Prevents XSS by replacing dangerous characters with HTML entities.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================
// Landing page template (loaded once)
// ============================================

let landingTemplate: string;
try {
  landingTemplate = fs.readFileSync(
    path.join(__dirname, '../templates/share-cards/landing-page.html'),
    'utf-8'
  );
} catch {
  console.warn('ShareController: landing-page.html template not found');
  landingTemplate = '<html><body><h1>SoundCheck</h1><p>Download the app to view this content.</p></body></html>';
}

// ============================================
// ShareController
// ============================================

export class ShareController {
  private shareCardService: ShareCardService;
  private checkinService: CheckinService;
  private badgeService: BadgeService;

  constructor() {
    this.shareCardService = new ShareCardService();
    this.checkinService = new CheckinService();
    this.badgeService = new BadgeService();
  }

  /**
   * Generate share card images for a check-in.
   * POST /api/share/checkin/:checkinId
   *
   * Requires authentication. Returns OG and Stories image URLs.
   */
  generateCheckinCard = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const { checkinId } = req.params;

      // Fetch full checkin data
      const checkin = await this.checkinService.getCheckinById(checkinId, userId);

      if (!checkin) {
        const response: ApiResponse = { success: false, error: 'Check-in not found' };
        res.status(404).json(response);
        return;
      }

      // Generate cards
      const { ogUrl, storiesUrl } = await this.shareCardService.generateCheckinCard(
        checkinId,
        {
          username: checkin.user?.username || 'unknown',
          bandName: checkin.band?.name || 'Live Show',
          venueName: checkin.venue?.name || 'Unknown Venue',
          venueCity: checkin.venue?.city || '',
          eventDate: checkin.eventDate
            ? new Date(checkin.eventDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : '',
          rating: checkin.rating || 0,
          bandImageUrl: checkin.band?.imageUrl,
        }
      );

      const response: ApiResponse = {
        success: true,
        data: { ogUrl, storiesUrl },
      };
      res.status(200).json(response);
    } catch (error: any) {
      logError('ShareController.generateCheckinCard error', { error: error.message });

      if (error.message === 'Check-in not found') {
        const response: ApiResponse = { success: false, error: 'Check-in not found' };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = { success: false, error: 'Failed to generate share card' };
      res.status(500).json(response);
    }
  };

  /**
   * Generate share card images for a badge unlock.
   * POST /api/share/badge/:badgeAwardId
   *
   * Requires authentication. Returns OG and Stories image URLs.
   */
  generateBadgeCard = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        const response: ApiResponse = { success: false, error: 'Authentication required' };
        res.status(401).json(response);
        return;
      }

      const { badgeAwardId } = req.params;

      // Look up the badge award in user_badges
      const userBadges = await this.badgeService.getUserBadges(userId);
      const award = userBadges.find((ub) => ub.id === badgeAwardId);

      if (!award) {
        const response: ApiResponse = { success: false, error: 'Badge award not found' };
        res.status(404).json(response);
        return;
      }

      const badge = award.badge;
      if (!badge) {
        const response: ApiResponse = { success: false, error: 'Badge data not found' };
        res.status(404).json(response);
        return;
      }

      const { ogUrl, storiesUrl } = await this.shareCardService.generateBadgeCard(
        badgeAwardId,
        {
          username: req.user?.username || 'unknown',
          badgeName: badge.name,
          badgeDescription: badge.description || '',
          badgeCategory: badge.badgeType,
          unlockedAt: new Date(award.earnedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        }
      );

      const response: ApiResponse = {
        success: true,
        data: { ogUrl, storiesUrl },
      };
      res.status(200).json(response);
    } catch (error: any) {
      logError('ShareController.generateBadgeCard error', { error: error.message });

      const response: ApiResponse = { success: false, error: 'Failed to generate share card' };
      res.status(500).json(response);
    }
  };

  /**
   * Render the public landing page for a shared check-in link.
   * GET /share/c/:checkinId
   *
   * No authentication required. Serves HTML with OG meta tags
   * for social platform crawlers, plus store CTAs for human visitors.
   */
  renderCheckinLanding = async (req: Request, res: Response): Promise<void> => {
    try {
      const { checkinId } = req.params;

      // Fetch checkin data (no user context for public page)
      const checkin = await this.checkinService.getCheckinById(checkinId);

      if (!checkin) {
        res.status(404).send('<html><body><h1>Check-in not found</h1></body></html>');
        return;
      }

      const bandName = escapeHtml(checkin.band?.name || 'Live Show');
      const venueName = escapeHtml(checkin.venue?.name || 'Unknown Venue');
      const venueCity = escapeHtml(checkin.venue?.city || '');
      const username = escapeHtml(checkin.user?.username || 'someone');

      const title = `${bandName} at ${venueName}`;
      const description = `@${username} checked in to see ${bandName} at ${venueName}${venueCity ? `, ${venueCity}` : ''}`;

      // Generate card if R2 is available (idempotent -- generates fresh each time for simplicity)
      let imageUrl = '';
      try {
        const cards = await this.shareCardService.generateCheckinCard(
          checkinId,
          {
            username: checkin.user?.username || 'unknown',
            bandName: checkin.band?.name || 'Live Show',
            venueName: checkin.venue?.name || 'Unknown Venue',
            venueCity: checkin.venue?.city || '',
            eventDate: checkin.eventDate
              ? new Date(checkin.eventDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : '',
            rating: checkin.rating || 0,
            bandImageUrl: checkin.band?.imageUrl,
          }
        );
        imageUrl = cards.ogUrl;
      } catch {
        // Card generation failed -- continue without image
      }

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const pageUrl = `${baseUrl}/share/c/${checkinId}`;
      const appStoreUrl = process.env.APP_STORE_URL || '#';
      const playStoreUrl = process.env.PLAY_STORE_URL || '#';

      const html = landingTemplate
        .replace(/\{\{TITLE\}\}/g, title)
        .replace(/\{\{DESCRIPTION\}\}/g, description)
        .replace(/\{\{IMAGE_URL\}\}/g, escapeHtml(imageUrl))
        .replace(/\{\{PAGE_URL\}\}/g, escapeHtml(pageUrl))
        .replace(/\{\{APP_STORE_URL\}\}/g, escapeHtml(appStoreUrl))
        .replace(/\{\{PLAY_STORE_URL\}\}/g, escapeHtml(playStoreUrl))
        .replace(/\{\{CARD_TYPE\}\}/g, 'checkin');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(html);
    } catch (error: any) {
      logError('ShareController.renderCheckinLanding error', { error: error.message });

      if (error.message === 'Check-in not found') {
        res.status(404).send('<html><body><h1>Check-in not found</h1></body></html>');
        return;
      }

      res.status(500).send('<html><body><h1>Something went wrong</h1></body></html>');
    }
  };

  /**
   * Render the public landing page for a shared badge link.
   * GET /share/b/:badgeAwardId
   *
   * No authentication required. Serves HTML with OG meta tags.
   */
  renderBadgeLanding = async (req: Request, res: Response): Promise<void> => {
    try {
      const { badgeAwardId } = req.params;

      // Look up badge award by ID (need a direct query since BadgeService
      // requires userId for getUserBadges)
      // Use a lightweight direct query via the badge service
      const Database = (await import('../config/database')).default;
      const db = Database.getInstance();

      const awardResult = await db.query(
        `SELECT ub.id, ub.user_id, ub.badge_id, ub.earned_at,
                u.username,
                b.name as badge_name, b.description as badge_description,
                b.badge_type, b.color
         FROM user_badges ub
         JOIN users u ON ub.user_id = u.id
         JOIN badges b ON ub.badge_id = b.id
         WHERE ub.id = $1`,
        [badgeAwardId]
      );

      if (awardResult.rows.length === 0) {
        res.status(404).send('<html><body><h1>Badge not found</h1></body></html>');
        return;
      }

      const award = awardResult.rows[0];

      const badgeName = escapeHtml(award.badge_name);
      const badgeDescription = escapeHtml(award.badge_description || '');
      const username = escapeHtml(award.username);

      const title = `${badgeName} Badge Unlocked`;
      const description = `@${username} unlocked the ${badgeName} badge on SoundCheck`;

      // Generate card
      let imageUrl = '';
      try {
        const cards = await this.shareCardService.generateBadgeCard(
          badgeAwardId,
          {
            username: award.username,
            badgeName: award.badge_name,
            badgeDescription: award.badge_description || '',
            badgeCategory: award.badge_type,
            unlockedAt: new Date(award.earned_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
          }
        );
        imageUrl = cards.ogUrl;
      } catch {
        // Card generation failed -- continue without image
      }

      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
      const pageUrl = `${baseUrl}/share/b/${badgeAwardId}`;
      const appStoreUrl = process.env.APP_STORE_URL || '#';
      const playStoreUrl = process.env.PLAY_STORE_URL || '#';

      const html = landingTemplate
        .replace(/\{\{TITLE\}\}/g, title)
        .replace(/\{\{DESCRIPTION\}\}/g, description)
        .replace(/\{\{IMAGE_URL\}\}/g, escapeHtml(imageUrl))
        .replace(/\{\{PAGE_URL\}\}/g, escapeHtml(pageUrl))
        .replace(/\{\{APP_STORE_URL\}\}/g, escapeHtml(appStoreUrl))
        .replace(/\{\{PLAY_STORE_URL\}\}/g, escapeHtml(playStoreUrl))
        .replace(/\{\{CARD_TYPE\}\}/g, 'badge');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(html);
    } catch (error: any) {
      logError('ShareController.renderBadgeLanding error', { error: error.message });
      res.status(500).send('<html><body><h1>Something went wrong</h1></body></html>');
    }
  };
}
