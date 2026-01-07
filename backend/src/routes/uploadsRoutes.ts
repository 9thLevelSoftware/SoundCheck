import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse } from '../types';

const router = Router();

/**
 * Serve uploaded profile images with authentication
 *
 * Security: This route requires authentication to prevent unauthorized
 * enumeration or scraping of user profile images.
 *
 * @route GET /api/uploads/profiles/:filename
 * @security JWT
 */
router.get('/profiles/:filename', authenticateToken, (req: Request, res: Response) => {
  const filename = req.params.filename;

  // Sanitize filename to prevent directory traversal attacks
  // path.basename strips directory components, preventing ../../../etc/passwd attacks
  const sanitizedFilename = path.basename(filename);

  // Construct the full file path
  const filePath = path.join(__dirname, '../../uploads/profiles', sanitizedFilename);

  // Verify the resolved path is still within the uploads directory
  const uploadsDir = path.resolve(__dirname, '../../uploads/profiles');
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(uploadsDir)) {
    const response: ApiResponse = {
      success: false,
      error: 'Invalid file path',
    };
    return res.status(400).json(response);
  }

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    const response: ApiResponse = {
      success: false,
      error: 'File not found',
    };
    return res.status(404).json(response);
  }

  // Send the file
  res.sendFile(resolvedPath);
});

export default router;
