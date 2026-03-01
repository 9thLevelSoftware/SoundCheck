import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { WrappedService } from '../services/WrappedService';
import { ShareCardService } from '../services/ShareCardService';
import { WrappedSummaryData } from '../templates/share-cards/wrapped-summary-card';
import { WrappedStatData } from '../templates/share-cards/wrapped-stat-card';
import logger from '../utils/logger';

export class WrappedController {
  private wrappedService = new WrappedService();
  private shareCardService = new ShareCardService();

  getWrapped = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const year = parseInt(req.params.year, 10);
      if (isNaN(year) || year < 2020 || year > new Date().getFullYear()) {
        res.status(400).json({ success: false, error: 'Invalid year' });
        return;
      }
      const stats = await this.wrappedService.getWrappedStats(userId, year);
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('WrappedController.getWrapped error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Failed to generate Wrapped stats' });
    }
  };

  getWrappedDetail = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const year = parseInt(req.params.year, 10);
      if (isNaN(year) || year < 2020 || year > new Date().getFullYear()) {
        res.status(400).json({ success: false, error: 'Invalid year' });
        return;
      }
      const stats = await this.wrappedService.getWrappedDetailStats(userId, year);
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('WrappedController.getWrappedDetail error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Failed to generate Wrapped detail stats' });
    }
  };

  generateSummaryCard = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const year = parseInt(req.params.year, 10);
      if (isNaN(year)) { res.status(400).json({ success: false, error: 'Invalid year' }); return; }

      const stats = await this.wrappedService.getWrappedStats(userId, year);
      if (!stats.meetsThreshold) {
        res.status(400).json({ success: false, error: 'Not enough check-ins for Wrapped' });
        return;
      }

      const cardData: WrappedSummaryData = {
        username: req.user!.username,
        year,
        totalShows: stats.totalShows,
        uniqueBands: stats.uniqueBands,
        uniqueVenues: stats.uniqueVenues,
        topGenre: stats.topGenre || 'Unknown',
        topArtist: stats.topArtistName || 'Unknown',
      };

      const urls = await this.shareCardService.generateWrappedCard(userId, year, cardData);
      res.json({ success: true, data: urls });
    } catch (error) {
      logger.error('WrappedController.generateSummaryCard error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Failed to generate Wrapped card' });
    }
  };

  generateStatCard = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const year = parseInt(req.params.year, 10);
      const statType = req.params.statType as 'top-artist' | 'top-venue' | 'top-genre';

      if (!['top-artist', 'top-venue', 'top-genre'].includes(statType)) {
        res.status(400).json({ success: false, error: 'Invalid stat type' });
        return;
      }

      const stats = await this.wrappedService.getWrappedStats(userId, year);
      if (!stats.meetsThreshold) {
        res.status(400).json({ success: false, error: 'Not enough check-ins for Wrapped' });
        return;
      }

      let statLabel: string, statValue: string, statDetail: string;
      switch (statType) {
        case 'top-artist':
          statLabel = '#1 Artist'; statValue = stats.topArtistName || 'Unknown';
          statDetail = `Seen ${stats.topArtistTimesSeen} times`;
          break;
        case 'top-venue':
          statLabel = '#1 Venue'; statValue = stats.homeVenueName || 'Unknown';
          statDetail = `Visited ${stats.homeVenueVisits} times`;
          break;
        case 'top-genre':
          statLabel = '#1 Genre'; statValue = stats.topGenre || 'Unknown';
          statDetail = `${stats.topGenrePercentage}% of your shows`;
          break;
      }

      const cardData: WrappedStatData = {
        username: req.user!.username, year, statType, statLabel, statValue, statDetail,
      };

      const urls = await this.shareCardService.generateWrappedStatCard(userId, year, cardData);
      res.json({ success: true, data: urls });
    } catch (error) {
      logger.error('WrappedController.generateStatCard error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).json({ success: false, error: 'Failed to generate stat card' });
    }
  };

  renderWrappedLanding = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, year } = req.params;
      const templatePath = path.join(__dirname, '../templates/share-cards/landing-page.html');
      let html = fs.readFileSync(templatePath, 'utf-8');

      html = html.replace(/\{\{TITLE\}\}/g, `SoundCheck Wrapped ${year}`)
                 .replace(/\{\{DESCRIPTION\}\}/g, `Check out my ${year} concert stats on SoundCheck!`)
                 .replace(/\{\{IMAGE_URL\}\}/g, '')
                 .replace(/\{\{PAGE_URL\}\}/g, `${process.env.BASE_URL || ''}/wrapped/${userId}/${year}`)
                 .replace(/\{\{APP_STORE_URL\}\}/g, process.env.APP_STORE_URL || '#')
                 .replace(/\{\{PLAY_STORE_URL\}\}/g, process.env.PLAY_STORE_URL || '#');

      res.type('html').send(html);
    } catch (error) {
      logger.error('WrappedController.renderWrappedLanding error', { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
      res.status(500).send('Server error');
    }
  };
}
