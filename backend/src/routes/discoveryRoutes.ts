import { Router } from 'express';
import { DiscoveryController } from '../controllers/DiscoveryController';
import { UserDiscoveryController } from '../controllers/UserDiscoveryController';
import { authenticateToken } from '../middleware/auth';
import { createPerUserRateLimit, RateLimitPresets } from '../middleware/perUserRateLimit';

const router = Router();
const discoveryController = new DiscoveryController();
const userDiscoveryController = new UserDiscoveryController();

// All discovery endpoints require authentication and per-user rate limiting
// to protect third-party API keys (setlist.fm, MusicBrainz)

// Search venues from setlist.fm
router.get('/venues', authenticateToken, createPerUserRateLimit(RateLimitPresets.read), discoveryController.searchVenues);

// Search setlists (concerts/events) from setlist.fm
router.get('/setlists', authenticateToken, createPerUserRateLimit(RateLimitPresets.read), discoveryController.searchSetlists);

// Search bands from MusicBrainz
router.get('/bands', authenticateToken, createPerUserRateLimit(RateLimitPresets.read), discoveryController.searchBands);

// Search bands by genre from MusicBrainz
router.get('/bands/genre', authenticateToken, createPerUserRateLimit(RateLimitPresets.read), discoveryController.searchBandsByGenre);

// User discovery: follow suggestions (Phase 17)
router.get(
  '/users/suggestions',
  authenticateToken,
  createPerUserRateLimit(RateLimitPresets.read),
  userDiscoveryController.getSuggestions
);

export default router;
