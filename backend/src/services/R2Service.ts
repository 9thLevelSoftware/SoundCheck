import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

// ============================================
// Types
// ============================================

interface PresignedUploadResult {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
}

// ============================================
// Allowed content types for photo uploads
// ============================================

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

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
      console.warn('R2Service: Missing R2 credentials, photo uploads disabled');
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
    prefix: string = 'checkins'
  ): Promise<PresignedUploadResult> {
    if (!this.isConfigured || !this.s3) {
      throw new Error('Photo uploads not configured');
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
   * Check if R2 is configured and photo uploads are available.
   */
  get configured(): boolean {
    return this.isConfigured;
  }
}

// Singleton instance
export const r2Service = new R2Service();
