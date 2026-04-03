import { ImageModerationService } from '../../services/ImageModerationService';

// Mock the logger
jest.mock('../../utils/logger', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

// Mock @google-cloud/vision
const mockSafeSearchDetection = jest.fn();

jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
    safeSearchDetection: mockSafeSearchDetection,
  })),
}));

describe('ImageModerationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSafeSearchDetection.mockReset();
  });

  describe('constructor', () => {
    it('should create service instance without errors', () => {
      // Just verify service can be instantiated without throwing
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImageModerationService } = require('../../services/ImageModerationService');
      expect(() => new ImageModerationService()).not.toThrow();
    });

    it('should handle missing @google-cloud/vision package gracefully', () => {
      jest.resetModules();
      jest.doMock('@google-cloud/vision', () => {
        throw new Error('Module not found');
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImageModerationService: FreshService } = require('../../services/ImageModerationService');

      // Should not throw when module is missing
      expect(() => new FreshService()).not.toThrow();

      jest.dontMock('@google-cloud/vision');
    });

    it('should handle missing credentials gracefully', () => {
      jest.resetModules();
      jest.doMock('@google-cloud/vision', () => ({
        ImageAnnotatorClient: jest.fn().mockImplementation(() => {
          throw new Error('Could not load credentials');
        }),
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImageModerationService: FreshService } = require('../../services/ImageModerationService');
      expect(() => new FreshService()).not.toThrow();

      jest.dontMock('@google-cloud/vision');
    });
  });

  describe('scanImage - when configured', () => {
    const createConfiguredService = (): ImageModerationService => {
      jest.resetModules();
      jest.doMock('@google-cloud/vision', () => ({
        ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
          safeSearchDetection: mockSafeSearchDetection,
        })),
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImageModerationService: FreshService } = require('../../services/ImageModerationService');
      return new FreshService();
    };

    it('should return safe result for clean image', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/safe-image.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'VERY_UNLIKELY',
            violence: 'VERY_UNLIKELY',
            racy: 'UNLIKELY',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(false);
      expect(result.flagReasons).toHaveLength(0);
      expect(result.annotations.adult).toBe('VERY_UNLIKELY');
      expect(result.annotations.violence).toBe('VERY_UNLIKELY');
      expect(result.annotations.racy).toBe('UNLIKELY');
    });

    it('should flag image with adult content LIKELY', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/adult-content.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'LIKELY',
            violence: 'VERY_UNLIKELY',
            racy: 'POSSIBLE',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(true);
      expect(result.flagReasons).toContain('adult: LIKELY');
      expect(result.annotations.adult).toBe('LIKELY');
    });

    it('should flag image with adult content VERY_LIKELY', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/explicit-content.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'VERY_LIKELY',
            violence: 'VERY_UNLIKELY',
            racy: 'LIKELY',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(true);
      expect(result.flagReasons).toContain('adult: VERY_LIKELY');
    });

    it('should flag image with violent content LIKELY', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/violent-content.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'UNLIKELY',
            violence: 'LIKELY',
            racy: 'VERY_UNLIKELY',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(true);
      expect(result.flagReasons).toContain('violence: LIKELY');
    });

    it('should flag image with violent content VERY_LIKELY', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/extreme-violence.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'POSSIBLE',
            violence: 'VERY_LIKELY',
            racy: 'UNLIKELY',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(true);
      expect(result.flagReasons).toContain('violence: VERY_LIKELY');
    });

    it('should flag image with racy content VERY_LIKELY', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/racy-content.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'UNLIKELY',
            violence: 'VERY_UNLIKELY',
            racy: 'VERY_LIKELY',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(true);
      expect(result.flagReasons).toContain('racy: VERY_LIKELY');
    });

    it('should NOT flag image with racy content only LIKELY (threshold is VERY_LIKELY)', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/suggestive-content.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'POSSIBLE',
            violence: 'VERY_UNLIKELY',
            racy: 'LIKELY',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(false);
      expect(result.flagReasons).toHaveLength(0);
    });

    it('should flag image with multiple violations', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/multi-violation.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'VERY_LIKELY',
            violence: 'LIKELY',
            racy: 'VERY_LIKELY',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(true);
      expect(result.flagReasons).toHaveLength(3);
      expect(result.flagReasons).toContain('adult: VERY_LIKELY');
      expect(result.flagReasons).toContain('violence: LIKELY');
      expect(result.flagReasons).toContain('racy: VERY_LIKELY');
    });

    it('should handle borderline adult content (POSSIBLE - not flagged)', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/borderline.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'POSSIBLE',
            violence: 'VERY_UNLIKELY',
            racy: 'POSSIBLE',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(false);
      expect(result.flagReasons).toHaveLength(0);
    });

    it('should handle borderline violence content (POSSIBLE - not flagged)', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/borderline-violence.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'VERY_UNLIKELY',
            violence: 'POSSIBLE',
            racy: 'UNLIKELY',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(false);
    });

    it('should handle UNKNOWN likelihood values', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/unknown.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'UNKNOWN',
            violence: 'UNKNOWN',
            racy: 'UNKNOWN',
            spoof: 'UNKNOWN',
            medical: 'UNKNOWN',
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(false);
      expect(result.annotations.adult).toBe('UNKNOWN');
    });

    it('should handle missing annotations (no safeSearchAnnotation)', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/no-annotations.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([{}]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(false);
      expect(result.annotations.adult).toBe('UNKNOWN');
    });

    it('should handle API errors with fail-open behavior', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/api-error.jpg';

      mockSafeSearchDetection.mockRejectedValueOnce(new Error('Vision API quota exceeded'));

      const result = await service.scanImage(imageUrl);

      // Fail open: not flagged when API fails
      expect(result.isFlagged).toBe(false);
      expect(result.annotations.adult).toBe('UNKNOWN');
    });

    it('should handle network errors with fail-open behavior', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/network-error.jpg';

      mockSafeSearchDetection.mockRejectedValueOnce(new Error('ETIMEDOUT'));

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(false);
    });

    it('should handle empty annotation fields', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://example.com/partial-annotations.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'VERY_UNLIKELY',
            // violence, racy, etc. are missing
          },
        },
      ]);

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(false);
      expect(result.annotations.adult).toBe('VERY_UNLIKELY');
      expect(result.annotations.violence).toBe('UNKNOWN');
    });
  });

  describe('scanImage - when not configured', () => {
    it('should return safe default when Vision API not configured', async () => {
      // Create service with vision that throws error (not configured)
      jest.resetModules();
      jest.doMock('@google-cloud/vision', () => {
        throw new Error('Module not found');
      });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImageModerationService: FreshService } = require('../../services/ImageModerationService');
      const service = new FreshService();
      const imageUrl = 'https://example.com/test.jpg';

      const result = await service.scanImage(imageUrl);

      expect(result.isFlagged).toBe(false);
      expect(result.annotations).toEqual({
        adult: 'UNKNOWN',
        violence: 'UNKNOWN',
        racy: 'UNKNOWN',
        spoof: 'UNKNOWN',
        medical: 'UNKNOWN',
      });
      expect(result.flagReasons).toHaveLength(0);

      jest.dontMock('@google-cloud/vision');
    });
  });

  describe('Safety Thresholds', () => {
    const createConfiguredService = (): ImageModerationService => {
      jest.resetModules();
      jest.doMock('@google-cloud/vision', () => ({
        ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
          safeSearchDetection: mockSafeSearchDetection,
        })),
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImageModerationService: FreshService } = require('../../services/ImageModerationService');
      return new FreshService();
    };

    it('should reject images with adult content likelihood > 0.5 (LIKELY or VERY_LIKELY)', async () => {
      const service = createConfiguredService();
      const testCases = [
        { adult: 'LIKELY', shouldFlag: true },
        { adult: 'VERY_LIKELY', shouldFlag: true },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        mockSafeSearchDetection.mockResolvedValueOnce([
          {
            safeSearchAnnotation: {
              adult: testCase.adult,
              violence: 'VERY_UNLIKELY',
              racy: 'VERY_UNLIKELY',
              spoof: 'VERY_UNLIKELY',
              medical: 'VERY_UNLIKELY',
            },
          },
        ]);

        const result = await service.scanImage('https://example.com/test.jpg');
        expect(result.isFlagged).toBe(testCase.shouldFlag);
      }
    });

    it('should approve borderline adult content (POSSIBLE) for human review consideration', async () => {
      const service = createConfiguredService();

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'POSSIBLE',
            violence: 'VERY_UNLIKELY',
            racy: 'LIKELY', // Still under VERY_LIKELY threshold
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage('https://example.com/borderline.jpg');

      // POSSIBLE adult content is not auto-rejected (would need human review in production)
      expect(result.isFlagged).toBe(false);
    });

    it('should handle API failures gracefully with fail-open', async () => {
      const service = createConfiguredService();

      mockSafeSearchDetection.mockRejectedValueOnce(new Error('Internal server error'));

      const result = await service.scanImage('https://example.com/error.jpg');

      // Fail open: when API is down, don't block content
      // In production, this should queue for manual review
      expect(result.isFlagged).toBe(false);
      expect(result.annotations.adult).toBe('UNKNOWN');
    });

    it('should require VERY_LIKELY for racy content (concerts have suggestive but not explicit)', async () => {
      const service = createConfiguredService();
      const testCases = [
        { racy: 'LIKELY', shouldFlag: false },
        { racy: 'POSSIBLE', shouldFlag: false },
        { racy: 'VERY_LIKELY', shouldFlag: true },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();
        mockSafeSearchDetection.mockResolvedValueOnce([
          {
            safeSearchAnnotation: {
              adult: 'VERY_UNLIKELY',
              violence: 'VERY_UNLIKELY',
              racy: testCase.racy,
              spoof: 'VERY_UNLIKELY',
              medical: 'VERY_UNLIKELY',
            },
          },
        ]);

        const result = await service.scanImage('https://example.com/test.jpg');
        expect(result.isFlagged).toBe(testCase.shouldFlag);
      }
    });
  });

  describe('Likelihood Levels', () => {
    const createConfiguredService = (): ImageModerationService => {
      jest.resetModules();
      jest.doMock('@google-cloud/vision', () => ({
        ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
          safeSearchDetection: mockSafeSearchDetection,
        })),
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImageModerationService: FreshService } = require('../../services/ImageModerationService');
      return new FreshService();
    };

    it('should handle all Google Vision likelihood levels correctly', async () => {
      const service = createConfiguredService();
      const likelihoods = [
        'VERY_UNLIKELY',
        'UNLIKELY',
        'POSSIBLE',
        'LIKELY',
        'VERY_LIKELY',
        'UNKNOWN',
      ];

      for (const likelihood of likelihoods) {
        jest.clearAllMocks();
        mockSafeSearchDetection.mockResolvedValueOnce([
          {
            safeSearchAnnotation: {
              adult: likelihood,
              violence: 'VERY_UNLIKELY',
              racy: 'VERY_UNLIKELY',
              spoof: 'VERY_UNLIKELY',
              medical: 'VERY_UNLIKELY',
            },
          },
        ]);

        const result = await service.scanImage('https://example.com/test.jpg');

        // Only LIKELY and VERY_LIKELY should flag
        const shouldFlag = likelihood === 'LIKELY' || likelihood === 'VERY_LIKELY';
        expect(result.isFlagged).toBe(shouldFlag);
        expect(result.annotations.adult).toBe(likelihood);
      }
    });
  });

  describe('Image URL Handling', () => {
    const createConfiguredService = (): ImageModerationService => {
      jest.resetModules();
      jest.doMock('@google-cloud/vision', () => ({
        ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
          safeSearchDetection: mockSafeSearchDetection,
        })),
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImageModerationService: FreshService } = require('../../services/ImageModerationService');
      return new FreshService();
    };

    it('should pass image URL to Vision API', async () => {
      const service = createConfiguredService();
      const imageUrl = 'https://r2.cloudflarestorage.com/bucket/photo.jpg';

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'VERY_UNLIKELY',
            violence: 'VERY_UNLIKELY',
            racy: 'VERY_UNLIKELY',
            spoof: 'VERY_UNLIKELY',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      await service.scanImage(imageUrl);

      expect(mockSafeSearchDetection).toHaveBeenCalledWith(imageUrl);
    });

    it('should handle various URL formats', async () => {
      const service = createConfiguredService();
      const urls = [
        'https://example.com/image.png',
        'https://cdn.example.com/path/to/image.webp',
        'https://storage.example.com/bucket/image.jpeg?token=abc123',
        'https://example.com/image.jpg#fragment',
      ];

      for (const url of urls) {
        jest.clearAllMocks();
        mockSafeSearchDetection.mockResolvedValueOnce([
          {
            safeSearchAnnotation: {
              adult: 'VERY_UNLIKELY',
              violence: 'VERY_UNLIKELY',
              racy: 'VERY_UNLIKELY',
              spoof: 'VERY_UNLIKELY',
              medical: 'VERY_UNLIKELY',
            },
          },
        ]);

        await service.scanImage(url);
        expect(mockSafeSearchDetection).toHaveBeenCalledWith(url);
      }
    });
  });

  describe('Return Value Structure', () => {
    const createConfiguredService = (): ImageModerationService => {
      jest.resetModules();
      jest.doMock('@google-cloud/vision', () => ({
        ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
          safeSearchDetection: mockSafeSearchDetection,
        })),
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ImageModerationService: FreshService } = require('../../services/ImageModerationService');
      return new FreshService();
    };

    it('should return correct SafeSearchResult structure', async () => {
      const service = createConfiguredService();

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'LIKELY',
            violence: 'VERY_UNLIKELY',
            racy: 'VERY_LIKELY',
            spoof: 'POSSIBLE',
            medical: 'VERY_UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage('https://example.com/test.jpg');

      expect(result).toHaveProperty('isFlagged');
      expect(result).toHaveProperty('annotations');
      expect(result).toHaveProperty('flagReasons');
      expect(result.annotations).toHaveProperty('adult');
      expect(result.annotations).toHaveProperty('violence');
      expect(result.annotations).toHaveProperty('racy');
      expect(result.annotations).toHaveProperty('spoof');
      expect(result.annotations).toHaveProperty('medical');
      expect(Array.isArray(result.flagReasons)).toBe(true);
      expect(typeof result.isFlagged).toBe('boolean');
    });

    it('should preserve original annotations in result', async () => {
      const service = createConfiguredService();

      mockSafeSearchDetection.mockResolvedValueOnce([
        {
          safeSearchAnnotation: {
            adult: 'VERY_LIKELY',
            violence: 'LIKELY',
            racy: 'VERY_UNLIKELY',
            spoof: 'POSSIBLE',
            medical: 'UNLIKELY',
          },
        },
      ]);

      const result = await service.scanImage('https://example.com/test.jpg');

      expect(result.annotations.adult).toBe('VERY_LIKELY');
      expect(result.annotations.violence).toBe('LIKELY');
      expect(result.annotations.racy).toBe('VERY_UNLIKELY');
      expect(result.annotations.spoof).toBe('POSSIBLE');
      expect(result.annotations.medical).toBe('UNLIKELY');
    });
  });
});
