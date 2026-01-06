import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const notificationController = new NotificationController();

// All notification routes require authentication
router.use(authenticateToken);

// Get unread count (must be before /:id routes)
router.get('/unread-count', notificationController.getUnreadCount);

// Mark all as read (must be before /:id routes)
router.post('/read-all', notificationController.markAllAsRead);

// Get notifications with pagination
router.get('/', notificationController.getNotifications);

// Mark single notification as read
router.post('/:id/read', notificationController.markAsRead);

// Delete a notification
router.delete('/:id', notificationController.deleteNotification);

export default router;
