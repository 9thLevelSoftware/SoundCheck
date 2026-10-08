import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import logger from '../utils/logger';

// ============================================
// Types
// ============================================

interface PresignedUploadResult {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
}

export interface R2ObjectMetadata {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
}

type R2ProviderError = Error & {
  name?: string;
  Code?: string;
  code?: string;
  $metadata?: {
    httpStatusCode?: number;
  };
  statusCode?: number;
};

// ============================================
// Allowed content types for photo uploads
// ============================================

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// ============================================
// R2Service -- Cloudflare R2 presigned URL generation
// ============================================

export class R2Service {
  private s3: S3Client | null = null;
  private bucket: string;
  private publicUrl: string;
  private isConfigured: boolean;

  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME || 'soundcheck-photos';
    this.publicUrl = process.env.R2_PUBLIC_URL || '';

    // Only configure if all required credentials are present
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    this.isConfigured = !!(accountId && accessKeyId && secretAccessKey);

    if (this.isConfigured) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: accessKeyId || '',
          secretAccessKey: secretAccessKey || '',
        },
      });
    } else {
      logger.warn('R2Service: Missing R2 credentials, photo uploads disabled');
    }
  }

  /**
   * Generate a presigned upload URL for direct client-to-R2 upload.
   * The client PUTs the file directly to R2 -- never proxied through Railway.
   *
   * @param contentType - MIME type of the image (must be image/*)
   * @param prefix - Object key prefix (default: 'checkins')
   * @returns { uploadUrl, objectKey, publicUrl }
   */
  async getPresignedUploadUrl(
    contentType: string,
    prefix: string = 'checkins',
    contentLength?: number
  ): Promise<PresignedUploadResult> {
    if (!this.isConfigured || !this.s3) {
      throw new Error('Photo uploads not configured');
    }

    if (
      contentLength === undefined ||
      !Number.isInteger(contentLength) ||
      contentLength <= 0 ||
      contentLength > MAX_UPLOAD_FILE_SIZE_BYTES
    ) {
      throw new Error(
        `Content length must be an integer between 1 and ${MAX_UPLOAD_FILE_SIZE_BYTES} bytes (10MB)`
      );
    }

    // Validate content type
    const ext = ALLOWED_IMAGE_TYPES[contentType];
    if (!ext) {
      throw new Error(
        `Unsupported content type: ${contentType}. Allowed: ${Object.keys(ALLOWED_IMAGE_TYPES).join(', ')}`
      );
    }

    // Generate unique object key
    const randomId = crypto.randomBytes(16).toString('hex');
    const objectKey = `${prefix}/${randomId}.${ext}`;

    // Generate presigned PUT URL with 10-minute expiry
    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: 600 }
    );

    return {
      uploadUrl,
      objectKey,
      publicUrl: `${this.publicUrl}/${objectKey}`,
    };
  }

  /**
   * Upload a buffer directly to R2 (for server-generated content like share card images).
   *
   * @param buffer - The file content as a Buffer
   * @param key - R2 object key (e.g., 'cards/checkin/abc-og.png')
   * @param contentType - MIME type (e.g., 'image/png')
   * @returns Public URL of the uploaded object
   */
  async uploadBuffer(buffer: Buffer, key: string, contentType: string): Promise<string> {
    if (!this.isConfigured || !this.s3) {
      throw new Error('R2 is not configured');
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    return this.getPublicUrl(key);
  }

  getPublicUrl(objectKey: string): string {
    return `${this.publicUrl}/${objectKey}`;
  }

  /**
   * Delete an object from R2 (e.g., when a photo is removed from a check-in).
   * Silently returns if R2 is not configured.
   */
  async deleteObject(objectKey: string): Promise<void> {
    if (!this.isConfigured || !this.s3) {
      return;
    }

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      })
    );
  }

  /**
   * Fetch object metadata from R2 without downloading the object body.
   */
  async headObject(objectKey: string): Promise<R2ObjectMetadata> {
    if (!this.isConfigured || !this.s3) {
      throw new Error('R2 is not configured');
    }

    try {
      const result = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        })
      );

      return {
        exists: true,
        contentLength: result.ContentLength,
        contentType: result.ContentType,
      };
    } catch (error) {
      const providerError = error as R2ProviderError;
      const statusCode = providerError.$metadata?.httpStatusCode ?? providerError.statusCode;
      const errorCode = providerError.Code ?? providerError.code ?? providerError.name;

      if (statusCode === 404 || errorCode === 'NotFound' || errorCode === 'NoSuchKey') {
        return { exists: false };
      }

      logger.error('R2Service: Failed to HEAD object', {
        objectKey,
        statusCode,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error) {
        providerError.statusCode = statusCode && statusCode >= 500 ? statusCode : 502;
      }

      throw error;
    }
  }

  /**
   * Check if an R2 object exists.
   */
  async objectExists(objectKey: string): Promise<boolean> {
    const metadata = await this.headObject(objectKey);
    return metadata.exists;
  }

  /**
   * Check if R2 is configured and ready for photo uploads.
   * CFR-BE-006: Renamed from 'configured' to 'isReady' to distinguish from internal isConfigured field.
   */
  get isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * @deprecated Use isReady instead. Kept for backward compatibility.
   */
  get configured(): boolean {
    return this.isConfigured;
  }
}

// Singleton instance
export const r2Service = new R2Service();
