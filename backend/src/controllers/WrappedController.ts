/**
 * WrappedController - Refactored with asyncHandler pattern
 * Standardized async error handling by wrapping all methods with asyncHandler
 * Replaces manual try-catch with automatic error forwarding
 */

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { WrappedService } from '../services/WrappedService';
import { ShareCardService } from '../services/ShareCardService';
import { WrappedSummaryData } from '../templates/share-cards/wrapped-summary-card';
import { WrappedStatData } from '../templates/share-cards/wrapped-stat-card';
import { isValidUUID, escapeHtml } from '../utils/validationSchemas';
import { asyncHandler } from '../utils/asyncHandler';
import { UnauthorizedError, BadRequestError } from '../utils/errors';

export class WrappedController {
  private wrappedService = new WrappedService();
  private shareCardService = new ShareCardService();

  getWrapped = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // CFR-017: Guard against missing user from auth middleware
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 2020 || year > new Date().getFullYear()) {
      throw new BadRequestError('Invalid year');
    }
    const stats = await this.wrappedService.getWrappedStats(userId, year);
    res.status(200).json({ success: true, data: stats });
  });

  getWrappedDetail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 2020 || year > new Date().getFullYear()) {
      throw new BadRequestError('Invalid year');
    }
    const stats = await this.wrappedService.getWrappedDetailStats(userId, year);
    res.status(200).json({ success: true, data: stats });
  });

  generateSummaryCard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const username = req.user?.username;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const year = parseInt(req.params.year, 10);
    if (isNaN(year)) {
      throw new BadRequestError('Invalid year');
    }

    const stats = await this.wrappedService.getWrappedStats(userId, year);
    if (!stats.meetsThreshold) {
      throw new BadRequestError('Not enough check-ins for Wrapped');
    }

    const cardData: WrappedSummaryData = {
      username: username || 'unknown',
      year,
      totalShows: stats.totalShows,
      uniqueBands: stats.uniqueBands,
      uniqueVenues: stats.uniqueVenues,
      topGenre: stats.topGenre || 'Unknown',
      topArtist: stats.topArtistName || 'Unknown',
    };

    const urls = await this.shareCardService.generateWrappedCard(userId, year, cardData);
    res.status(200).json({ success: true, data: urls });
  });

  generateStatCard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.id;
    const username = req.user?.username;
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }
    const year = parseInt(req.params.year, 10);
    const statType = req.params.statType as 'top-artist' | 'top-venue' | 'top-genre';

    if (!['top-artist', 'top-venue', 'top-genre'].includes(statType)) {
      throw new BadRequestError('Invalid stat type');
    }

    const stats = await this.wrappedService.getWrappedStats(userId, year);
    if (!stats.meetsThreshold) {
      throw new BadRequestError('Not enough check-ins for Wrapped');
    }

    let statLabel: string, statValue: string, statDetail: string;
    switch (statType) {
      case 'top-artist':
        statLabel = '#1 Artist';
        statValue = stats.topArtistName || 'Unknown';
        statDetail = `Seen ${stats.topArtistTimesSeen} times`;
        break;
      case 'top-venue':
        statLabel = '#1 Venue';
        statValue = stats.homeVenueName || 'Unknown';
        statDetail = `Visited ${stats.homeVenueVisits} times`;
        break;
      case 'top-genre':
        statLabel = '#1 Genre';
        statValue = stats.topGenre || 'Unknown';
        statDetail = `${stats.topGenrePercentage}% of your shows`;
        break;
    }

    const cardData: WrappedStatData = {
      username: username || 'unknown',
      year,
      statType,
      statLabel,
      statValue,
      statDetail,
    };

    const urls = await this.shareCardService.generateWrappedStatCard(userId, year, cardData);
    res.status(200).json({ success: true, data: urls });
  });

  renderWrappedLanding = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { userId, year } = req.params;

    // API-027: Validate UUID and year to prevent injection
    if (!isValidUUID(userId)) {
      res.status(400).send('<html><body><h1>Invalid user ID</h1></body></html>');
      return;
    }
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2020 || yearNum > new Date().getFullYear() + 1) {
      res.status(400).send('<html><body><h1>Invalid year</h1></body></html>');
      return;
    }

    const templatePath = path.join(__dirname, '../templates/share-cards/landing-page.html');
    let html = fs.readFileSync(templatePath, 'utf-8');

    // API-027: Apply escapeHtml() to all user-influenced values
    const safeUserId = escapeHtml(userId);
    const safeYear = escapeHtml(year);
    const safeBaseUrl = escapeHtml(process.env.BASE_URL || '');

    html = html
      .replace(/\{\{TITLE\}\}/g, `SoundCheck Wrapped ${safeYear}`)
      .replace(/\{\{DESCRIPTION\}\}/g, `Check out my ${safeYear} concert stats on SoundCheck!`)
      .replace(/\{\{IMAGE_URL\}\}/g, '')
      .replace(/\{\{PAGE_URL\}\}/g, `${safeBaseUrl}/wrapped/${safeUserId}/${safeYear}`)
      .replace(/\{\{APP_STORE_URL\}\}/g, escapeHtml(process.env.APP_STORE_URL || '#'))
      .replace(/\{\{PLAY_STORE_URL\}\}/g, escapeHtml(process.env.PLAY_STORE_URL || '#'));

    res.type('html').send(html);
  });
}
