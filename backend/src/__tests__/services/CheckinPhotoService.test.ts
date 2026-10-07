import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Database from '../../config/database';
import { r2Service } from '../../services/R2Service';
import { CheckinPhotoService } from '../../services/checkin/CheckinPhotoService';

jest.mock('../../config/database');
jest.mock('../../services/R2Service', () => ({
  ALLOWED_IMAGE_TYPES: {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
  },
  MAX_UPLOAD_FILE_SIZE_BYTES: 10 * 1024 * 1024,
  r2Service: {
    getPresignedUploadUrl: jest.fn(),
    headObject: jest.fn(),
  },
}));
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockDb = {
  query: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('CheckinPhotoService', () => {
  const checkinId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = '550e8400-e29b-41d4-a716-446655440001';
  const photoKeys = [`checkins/${checkinId}/one.jpg`, `checkins/${checkinId}/two.jpg`];
  const mockR2Service = r2Service as jest.Mocked<typeof r2Service>;

  let service: CheckinPhotoService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.R2_PUBLIC_URL = 'https://cdn.example.com';
    service = new CheckinPhotoService();
  });

  it('counts unexpired pending uploads before issuing new signed URLs', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ user_id: userId, image_urls: ['https://old.example.com/photo.jpg'] }],
      })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rowCount: 2 });
    mockR2Service.getPresignedUploadUrl
      .mockResolvedValueOnce({
        uploadUrl: 'https://upload.example.com/one',
        objectKey: photoKeys[0],
        publicUrl: `https://cdn.example.com/${photoKeys[0]}`,
      })
      .mockResolvedValueOnce({
        uploadUrl: 'https://upload.example.com/two',
        objectKey: photoKeys[1],
        publicUrl: `https://cdn.example.com/${photoKeys[1]}`,
      });

    const result = await service.requestPhotoUploadUrls(
      checkinId,
      userId,
      ['image/jpeg', 'image/jpeg'],
      [100, 100]
    );

    expect(result.map((item) => item.objectKey)).toEqual(photoKeys);
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("created_at < NOW() - INTERVAL '15 minutes'"),
      [checkinId, userId]
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('SELECT COUNT(*)::int AS count'),
      [checkinId, userId]
    );
  });

  it('rejects an oversize content length before signing an upload URL', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ user_id: userId, image_urls: [] }],
    });

    await expect(
      service.requestPhotoUploadUrls(checkinId, userId, ['image/jpeg'], [10 * 1024 * 1024 + 1])
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockR2Service.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('passes each declared content length through to the presigner', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: userId, image_urls: [] }] })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rowCount: 1 });
    mockR2Service.getPresignedUploadUrl.mockResolvedValueOnce({
      uploadUrl: 'https://upload.example.com/one',
      objectKey: photoKeys[0],
      publicUrl: `https://cdn.example.com/${photoKeys[0]}`,
    });

    await service.requestPhotoUploadUrls(checkinId, userId, ['image/jpeg'], [2048]);

    expect(mockR2Service.getPresignedUploadUrl).toHaveBeenCalledWith(
      'image/jpeg',
      `checkins/${checkinId}`,
      2048
    );
  });

  it('rejects new signed URLs when attached plus pending plus requested photos exceed the cap', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ user_id: userId, image_urls: ['https://old.example.com/photo.jpg'] }],
      })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ count: 2 }] });

    await expect(
      service.requestPhotoUploadUrls(checkinId, userId, ['image/jpeg', 'image/png'], [100, 100])
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(mockR2Service.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects signed URL requests for missing check-ins and non-owners', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      service.requestPhotoUploadUrls(checkinId, userId, ['image/jpeg'], [100])
    ).rejects.toMatchObject({
      message: 'Check-in not found',
      statusCode: 404,
    });

    mockDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'another-user', image_urls: [] }],
    });

    await expect(
      service.requestPhotoUploadUrls(checkinId, userId, ['image/jpeg'], [100])
    ).rejects.toMatchObject({
      message: 'Unauthorized to modify this check-in',
      statusCode: 403,
    });
    expect(mockR2Service.getPresignedUploadUrl).not.toHaveBeenCalled();
  });

  it('HEADs all pending keys before storing URLs and deleting pending rows', async () => {
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ user_id: userId, image_urls: ['https://old.example.com/photo.jpg'] }],
      })
      .mockResolvedValueOnce({ rows: photoKeys.map((object_key) => ({ object_key })) })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 2 });
    mockR2Service.headObject.mockResolvedValue({
      exists: true,
      contentLength: 100,
      contentType: 'image/jpeg',
    });

    const result = await service.addPhotos(checkinId, userId, photoKeys);

    expect(mockR2Service.headObject).toHaveBeenCalledTimes(2);
    expect(mockR2Service.headObject).toHaveBeenNthCalledWith(1, photoKeys[0]);
    expect(mockR2Service.headObject).toHaveBeenNthCalledWith(2, photoKeys[1]);
    expect(result).toEqual([
      'https://old.example.com/photo.jpg',
      `https://cdn.example.com/${photoKeys[0]}`,
      `https://cdn.example.com/${photoKeys[1]}`,
    ]);
    expect(mockDb.query).toHaveBeenNthCalledWith(
      3,
      'UPDATE checkins SET image_urls = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [result, checkinId]
    );
    expect(mockDb.query).toHaveBeenNthCalledWith(
      4,
      `DELETE FROM pending_photo_uploads WHERE checkin_id = $1 AND object_key = ANY($2::text[])`,
      [checkinId, photoKeys]
    );
  });

  it('rejects missing R2 objects without updating image URLs or deleting pending rows', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: userId, image_urls: [] }] })
      .mockResolvedValueOnce({ rows: photoKeys.map((object_key) => ({ object_key })) });
    mockR2Service.headObject
      .mockResolvedValueOnce({ exists: true, contentLength: 100, contentType: 'image/jpeg' })
      .mockResolvedValueOnce({ exists: false });

    await expect(service.addPhotos(checkinId, userId, photoKeys)).rejects.toMatchObject({
      statusCode: 409,
    });

    expect(mockDb.query).toHaveBeenCalledTimes(2);
    expect(mockDb.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE checkins'),
      expect.anything()
    );
    expect(mockDb.query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM pending_photo_uploads'),
      expect.anything()
    );
  });

  it('surfaces transient R2 errors as retryable server-side failures without DB mutation', async () => {
    const providerError = Object.assign(new Error('R2 unavailable'), { statusCode: 503 });
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: userId, image_urls: [] }] })
      .mockResolvedValueOnce({ rows: photoKeys.map((object_key) => ({ object_key })) });
    mockR2Service.headObject.mockRejectedValueOnce(providerError);

    await expect(service.addPhotos(checkinId, userId, photoKeys)).rejects.toMatchObject({
      message: 'R2 unavailable',
      statusCode: 503,
    });

    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid pending keys before HEAD checks', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: userId, image_urls: [] }] })
      .mockResolvedValueOnce({ rows: [{ object_key: photoKeys[0] }] });

    await expect(service.addPhotos(checkinId, userId, photoKeys)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mockR2Service.headObject).not.toHaveBeenCalled();
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it('rejects uploaded objects with unsigned or mismatched content type metadata', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: userId, image_urls: [] }] })
      .mockResolvedValueOnce({ rows: [{ object_key: photoKeys[0] }] });
    mockR2Service.headObject.mockResolvedValueOnce({
      exists: true,
      contentLength: 100,
      contentType: 'text/plain',
    });

    await expect(service.addPhotos(checkinId, userId, [photoKeys[0]])).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mockDb.query).toHaveBeenCalledTimes(2);
    expect(mockDb.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE checkins'),
      expect.anything()
    );
  });

  it('rejects uploaded objects larger than the configured photo size limit', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: userId, image_urls: [] }] })
      .mockResolvedValueOnce({ rows: [{ object_key: photoKeys[0] }] });
    mockR2Service.headObject.mockResolvedValueOnce({
      exists: true,
      contentLength: 10 * 1024 * 1024 + 1,
      contentType: 'image/jpeg',
    });

    await expect(service.addPhotos(checkinId, userId, [photoKeys[0]])).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it('rejects uploaded objects whose extension does not match the signed image type', async () => {
    const mismatchedKey = `checkins/${checkinId}/renamed.png`;
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: userId, image_urls: [] }] })
      .mockResolvedValueOnce({ rows: [{ object_key: mismatchedKey }] });
    mockR2Service.headObject.mockResolvedValueOnce({
      exists: true,
      contentLength: 100,
      contentType: 'image/jpeg; charset=binary',
    });

    await expect(service.addPhotos(checkinId, userId, [mismatchedKey])).rejects.toMatchObject({
      message: 'One or more uploaded photos have an invalid type or size',
      statusCode: 400,
    });
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it('does not attach photos when existing and newly confirmed URLs exceed the cap', async () => {
    const existingUrls = Array.from(
      { length: service.MAX_PHOTOS_PER_CHECKIN },
      (_, index) => `https://cdn.example.com/existing-${index}.jpg`
    );
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ user_id: userId, image_urls: existingUrls }] })
      .mockResolvedValueOnce({ rows: [{ object_key: photoKeys[0] }] });
    mockR2Service.headObject.mockResolvedValueOnce({
      exists: true,
      contentLength: 100,
      contentType: 'image/jpeg',
    });

    await expect(service.addPhotos(checkinId, userId, [photoKeys[0]])).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockDb.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE checkins'),
      expect.anything()
    );
  });

  it('returns stored photos and degrades to an empty list for missing rows or database errors', async () => {
    const stored = ['https://cdn.example.com/one.jpg'];
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ image_urls: stored }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.getPhotos(checkinId)).resolves.toEqual(stored);
    await expect(service.getPhotos('missing')).resolves.toEqual([]);
    await expect(service.getPhotos(checkinId)).resolves.toEqual([]);
  });

  it('removes only selected photos for the check-in owner', async () => {
    const keepUrl = 'https://cdn.example.com/keep.jpg';
    const removeUrl = 'https://cdn.example.com/remove.jpg';
    mockDb.query
      .mockResolvedValueOnce({
        rows: [{ user_id: userId, image_urls: [keepUrl, removeUrl] }],
      })
      .mockResolvedValueOnce({ rowCount: 1 });

    await expect(service.deletePhotos(checkinId, userId, [removeUrl])).resolves.toEqual([keepUrl]);
    expect(mockDb.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE checkins SET image_urls = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [[keepUrl], checkinId]
    );
  });

  it('rejects photo deletion for missing check-ins and non-owners', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    await expect(service.deletePhotos(checkinId, userId, [])).rejects.toMatchObject({
      statusCode: 404,
    });

    mockDb.query.mockResolvedValueOnce({
      rows: [{ user_id: 'another-user', image_urls: [] }],
    });

    await expect(service.deletePhotos(checkinId, userId, [])).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('reports remaining photo slots without returning a negative value', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ image_urls: ['one.jpg'] }] })
      .mockResolvedValueOnce({
        rows: [{ image_urls: ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg'] }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('database unavailable'));

    await expect(service.getRemainingPhotoSlots(checkinId)).resolves.toBe(3);
    await expect(service.getRemainingPhotoSlots(checkinId)).resolves.toBe(0);
    await expect(service.getRemainingPhotoSlots('missing')).resolves.toBe(0);
    await expect(service.getRemainingPhotoSlots(checkinId)).resolves.toBe(0);
  });
});
