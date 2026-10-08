import { Router, Request, Response } from 'express';
import { routeParam } from '../utils/requestParams';
import path from 'path';
import fs from 'fs';
import { ApiResponse } from '../types';

const router = Router();

/**
 * Serve uploaded profile images.
 *
 * Profile URLs are embedded on public profiles and the mobile image loader
 * does not attach a JWT. Filenames are random (`profile-<16 hex>`), and
 * path traversal is rejected below.
 *
 * @route GET /api/uploads/profiles/:filename
 */
router.get('/profiles/:filename', (req: Request, res: Response) => {
  const filename = routeParam(req, 'filename');

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

  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(resolvedPath);
});

export default router;
