import { Router } from 'express';
import { WishlistController } from '../controllers/WishlistController';
import { authenticateToken, rateLimit } from '../middleware/auth';

const router = Router();
const wishlistController = new WishlistController();

// Rate limiting to prevent wishlist add/remove spam
const wishlistRateLimit = rateLimit(15 * 60 * 1000, 30); // 30 wishlist actions per 15 minutes

// All wishlist routes require authentication
router.use(authenticateToken);

// Get current user's wishlist
// GET /api/wishlist
router.get('/', wishlistController.getWishlist);

// Check if a band is in wishlist
// GET /api/wishlist/status?bandId=xxx
router.get('/status', wishlistController.getWishlistStatus);

// Add a band to wishlist
// POST /api/wishlist
// Body: { bandId: string, notifyWhenNearby?: boolean }
router.post('/', wishlistRateLimit, wishlistController.addToWishlist);

// Remove from wishlist by band ID (via query parameter)
// DELETE /api/wishlist?bandId=xxx
router.delete('/', wishlistRateLimit, wishlistController.removeFromWishlistByBandId);

// Remove from wishlist by wishlist item ID
// DELETE /api/wishlist/:wishlistId
router.delete('/:wishlistId', wishlistRateLimit, wishlistController.removeFromWishlistById);

// Update notification preference for a wishlisted band
// PATCH /api/wishlist/:bandId/notify
// Body: { notifyWhenNearby: boolean }
router.patch('/:bandId/notify', wishlistController.updateNotificationPreference);

export default router;
