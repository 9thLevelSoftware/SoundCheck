import { Router } from 'express';
import { CheckinController } from '../controllers/CheckinController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const checkinController = new CheckinController();

// All checkin routes require authentication
router.use(authenticateToken);

// Get activity feed
router.get('/feed', checkinController.getActivityFeed);

// Get vibe tags (must be before /:id routes)
router.get('/vibe-tags', checkinController.getVibeTags);

// Get check-ins with filters
router.get('/', checkinController.getCheckins);

// Create a check-in
router.post('/', checkinController.createCheckin);

// Get check-in by ID
router.get('/:id', checkinController.getCheckinById);

// Delete check-in
router.delete('/:id', checkinController.deleteCheckin);

// Toast a check-in
router.post('/:id/toast', checkinController.toastCheckin);

// Untoast a check-in
router.delete('/:id/toast', checkinController.untoastCheckin);

// Get toasts for a check-in
router.get('/:id/toasts', checkinController.getToasts);

// Get comments for a check-in
router.get('/:id/comments', checkinController.getComments);

// Add comment to a check-in
router.post('/:id/comments', checkinController.addComment);

// Delete a comment
router.delete('/:id/comments/:commentId', checkinController.deleteComment);

export default router;
