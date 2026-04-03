import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { AuthUtils } from '../../utils/auth';
import { UserService } from '../../services/UserService';

// Mock dependencies
jest.mock('../../services/UserService');
jest.mock('../../utils/auth', () => ({
  AuthUtils: {
    verifyToken: jest.fn(),
    extractTokenFromHeader: jest.fn(),
  },
}));

/**
 * Tests for authenticated uploads route
 *
 * Security requirement: Uploaded files should only be accessible to authenticated users.
 * This prevents unauthorized enumeration or scraping of user profile images.
 */
describe('Uploads Route', () => {
  let app: express.Express;
  let mockUserService: jest.Mocked<UserService>;
  const mockAuthUtils = AuthUtils as jest.Mocked<typeof AuthUtils>;

  const testUploadDir = path.join(__dirname, '../../../uploads/profiles');
  const testFilename = 'test-image.jpg';
  const testFilePath = path.join(testUploadDir, testFilename);

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    isVerified: true,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create test uploads directory and file if they don't exist
    if (!fs.existsSync(testUploadDir)) {
      fs.mkdirSync(testUploadDir, { recursive: true });
    }

    // Create a test file
    fs.writeFileSync(testFilePath, 'test image content');

    // Setup Express app with uploads route
    app = express();
    app.use(express.json());

    // Import and use the uploads route
    const uploadsRoutes = (await import('../../routes/uploadsRoutes')).default;
    app.use('/api/uploads', uploadsRoutes);

    // Setup mock user service
    mockUserService = new UserService() as jest.Mocked<UserService>;
  });

  afterEach(() => {
    // Cleanup test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  describe('GET /api/uploads/profiles/:filename', () => {
    it('should return 401 for unauthenticated access to uploads', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue(null);

      const response = await request(app).get(`/api/uploads/profiles/${testFilename}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should return 401 for invalid token', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue('invalid-token');
      mockAuthUtils.verifyToken.mockReturnValue(null);

      const response = await request(app)
        .get(`/api/uploads/profiles/${testFilename}`)
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });

    it('should return file for authenticated users', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue('valid-token');
      mockAuthUtils.verifyToken.mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });

      // Mock UserService.findById
      const userServiceMock = UserService as jest.MockedClass<typeof UserService>;
      userServiceMock.prototype.findById.mockResolvedValue(mockUser as any);

      const response = await request(app)
        .get(`/api/uploads/profiles/${testFilename}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      // Check the response body contains the file content (could be text or buffer)
      const content = response.text || response.body?.toString();
      expect(content).toContain('test image content');
    });

    it('should return 404 for non-existent file', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue('valid-token');
      mockAuthUtils.verifyToken.mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });

      const userServiceMock = UserService as jest.MockedClass<typeof UserService>;
      userServiceMock.prototype.findById.mockResolvedValue(mockUser as any);

      const response = await request(app)
        .get('/api/uploads/profiles/non-existent.jpg')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('File not found');
    });

    it('should prevent directory traversal attacks', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue('valid-token');
      mockAuthUtils.verifyToken.mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });

      const userServiceMock = UserService as jest.MockedClass<typeof UserService>;
      userServiceMock.prototype.findById.mockResolvedValue(mockUser as any);

      // Attempt directory traversal
      const response = await request(app)
        .get('/api/uploads/profiles/../../../package.json')
        .set('Authorization', 'Bearer valid-token');

      // Should either return 404 (file not found in profiles dir) or sanitize the path
      expect(response.status).toBe(404);
    });

    it('should return 401 for inactive user', async () => {
      mockAuthUtils.extractTokenFromHeader.mockReturnValue('valid-token');
      mockAuthUtils.verifyToken.mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        username: 'testuser',
      });

      const userServiceMock = UserService as jest.MockedClass<typeof UserService>;
      userServiceMock.prototype.findById.mockResolvedValue({
        ...mockUser,
        isActive: false,
      } as any);

      const response = await request(app)
        .get(`/api/uploads/profiles/${testFilename}`)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });
  });
});
