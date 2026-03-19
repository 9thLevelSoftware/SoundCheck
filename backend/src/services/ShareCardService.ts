/**
 * ShareCardService -- Server-side share card image generation pipeline.
 *
 * Uses Satori to render JSX-like elements to SVG, then @resvg/resvg-js
 * to rasterize SVGs to PNG. Generated images are uploaded to R2 and
 * accessible via public URL.
 *
 * Generates two variants per card:
 *   - OG (1200x630) for Open Graph / Twitter link previews
 *   - Stories (1080x1920) for Instagram/Snapchat Stories sharing
 *
 * Graceful degradation: If R2 is not configured, logs a warning and
 * returns empty strings. Sharing features degrade gracefully rather
 * than throwing.
 *
 * Phase 10: Viral Growth Engine
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs';
import path from 'path';
import { r2Service } from './R2Service';
import { checkinCardOG, checkinCardStories, CheckinCardData } from '../templates/share-cards/checkin-card';
import { badgeCardOG, badgeCardStories, BadgeCardData } from '../templates/share-cards/badge-card';
import { wrappedSummaryCardOG, wrappedSummaryCardStories, WrappedSummaryData } from '../templates/share-cards/wrapped-summary-card';
import { wrappedStatCardOG, wrappedStatCardStories, WrappedStatData } from '../templates/share-cards/wrapped-stat-card';
import logger from '../utils/logger';

// ============================================
// Font loading (once at module level)
// ============================================

let fontData: Buffer;
try {
  fontData = fs.readFileSync(path.join(__dirname, '../fonts/Inter-Bold.ttf'));
} catch {
  logger.warn('ShareCardService: Inter-Bold.ttf not found, card generation will fail');
  fontData = Buffer.alloc(0);
}

// ============================================
// ShareCardService
// ============================================

export class ShareCardService {
  /**
   * Generate check-in share card images in both variants.
   *
   * @param checkinId - Used for the R2 object key (content-addressable)
   * @param data - Check-in data to render on the card
   * @returns Public URLs for OG and Stories variants (empty strings if R2 not configured)
   */
  async generateCheckinCard(
    checkinId: string,
    data: CheckinCardData
  ): Promise<{ ogUrl: string; storiesUrl: string }> {
<<<<<<< HEAD
    if (!r2Service.isReady) {
      logger.warn('ShareCardService: R2 not configured, returning placeholder URLs');
      return { ogUrl: '', storiesUrl: '' };
=======
    if (!r2Service.configured) {
      const err = new Error('Share card generation unavailable: storage not configured');
      (err as any).statusCode = 503;
      throw err;
>>>>>>> worktree-agent-ac41ef45
    }

    const ts = Date.now();
    const ogKey = `cards/checkin/${checkinId}-${ts}-og.png`;
    const storiesKey = `cards/checkin/${checkinId}-${ts}-stories.png`;

    const [ogUrl, storiesUrl] = await Promise.all([
      this.renderAndUpload(checkinCardOG(data), 1200, 630, ogKey),
      this.renderAndUpload(checkinCardStories(data), 1080, 1920, storiesKey),
    ]);

    return { ogUrl, storiesUrl };
  }

  /**
   * Generate badge unlock share card images in both variants.
   *
   * @param badgeAwardId - user_badges row ID, used for R2 object key
   * @param data - Badge data to render on the card
   * @returns Public URLs for OG and Stories variants (empty strings if R2 not configured)
   */
  async generateBadgeCard(
    badgeAwardId: string,
    data: BadgeCardData
  ): Promise<{ ogUrl: string; storiesUrl: string }> {
<<<<<<< HEAD
    if (!r2Service.isReady) {
      logger.warn('ShareCardService: R2 not configured, returning placeholder URLs');
      return { ogUrl: '', storiesUrl: '' };
=======
    if (!r2Service.configured) {
      const err = new Error('Share card generation unavailable: storage not configured');
      (err as any).statusCode = 503;
      throw err;
>>>>>>> worktree-agent-ac41ef45
    }

    const ts = Date.now();
    const ogKey = `cards/badge/${badgeAwardId}-${ts}-og.png`;
    const storiesKey = `cards/badge/${badgeAwardId}-${ts}-stories.png`;

    const [ogUrl, storiesUrl] = await Promise.all([
      this.renderAndUpload(badgeCardOG(data), 1200, 630, ogKey),
      this.renderAndUpload(badgeCardStories(data), 1080, 1920, storiesKey),
    ]);

    return { ogUrl, storiesUrl };
  }

  /**
   * Generate Wrapped summary share card images in both variants.
   */
  async generateWrappedCard(
    userId: string,
    year: number,
    data: WrappedSummaryData
  ): Promise<{ ogUrl: string; storiesUrl: string }> {
<<<<<<< HEAD
    if (!r2Service.isReady) {
      logger.warn('ShareCardService: R2 not configured, returning placeholder URLs');
      return { ogUrl: '', storiesUrl: '' };
=======
    if (!r2Service.configured) {
      const err = new Error('Share card generation unavailable: storage not configured');
      (err as any).statusCode = 503;
      throw err;
>>>>>>> worktree-agent-ac41ef45
    }
    const ts = Date.now();
    const ogKey = `cards/wrapped/${userId}-${year}-summary-${ts}-og.png`;
    const storiesKey = `cards/wrapped/${userId}-${year}-summary-${ts}-stories.png`;
    const [ogUrl, storiesUrl] = await Promise.all([
      this.renderAndUpload(wrappedSummaryCardOG(data), 1200, 630, ogKey),
      this.renderAndUpload(wrappedSummaryCardStories(data), 1080, 1920, storiesKey),
    ]);
    return { ogUrl, storiesUrl };
  }

  /**
   * Generate Wrapped per-stat share card images in both variants.
   */
  async generateWrappedStatCard(
    userId: string,
    year: number,
    data: WrappedStatData
  ): Promise<{ ogUrl: string; storiesUrl: string }> {
<<<<<<< HEAD
    if (!r2Service.isReady) {
      logger.warn('ShareCardService: R2 not configured, returning placeholder URLs');
      return { ogUrl: '', storiesUrl: '' };
=======
    if (!r2Service.configured) {
      const err = new Error('Share card generation unavailable: storage not configured');
      (err as any).statusCode = 503;
      throw err;
>>>>>>> worktree-agent-ac41ef45
    }
    const ts = Date.now();
    const ogKey = `cards/wrapped/${userId}-${year}-${data.statType}-${ts}-og.png`;
    const storiesKey = `cards/wrapped/${userId}-${year}-${data.statType}-${ts}-stories.png`;
    const [ogUrl, storiesUrl] = await Promise.all([
      this.renderAndUpload(wrappedStatCardOG(data), 1200, 630, ogKey),
      this.renderAndUpload(wrappedStatCardStories(data), 1080, 1920, storiesKey),
    ]);
    return { ogUrl, storiesUrl };
  }

  /**
   * Render a Satori element to PNG and upload to R2.
   *
   * Pipeline: Satori JSX -> SVG string -> Resvg rasterization -> PNG buffer -> R2 upload
   *
   * @param element - Satori-compatible element object
   * @param width - Image width in pixels
   * @param height - Image height in pixels
   * @param key - R2 object key for upload
   * @returns Public URL of the uploaded PNG
   */
  private async renderAndUpload(
    element: any,
    width: number,
    height: number,
    key: string
  ): Promise<string> {
    // Convert Node Buffer to ArrayBuffer for satori
    // Use Uint8Array.from to ensure a clean ArrayBuffer copy
    const fontUint8 = new Uint8Array(fontData);
    const fontArrayBuffer: ArrayBuffer = fontUint8.buffer;

    // Satori: element -> SVG string
    const svg = await satori(element, {
      width,
      height,
      fonts: [
        {
          name: 'Inter',
          data: fontArrayBuffer,
          weight: 700,
          style: 'normal' as const,
        },
      ],
    });

    // Resvg: SVG string -> PNG buffer
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: 'width' as const,
        value: width,
      },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // Upload to R2
    const publicUrl = await r2Service.uploadBuffer(
      Buffer.from(pngBuffer),
      key,
      'image/png'
    );

    return publicUrl;
  }
}
