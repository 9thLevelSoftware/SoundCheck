/**
 * ImageModerationService - Cloud Vision SafeSearch Wrapper
 *
 * Scans images via Google Cloud Vision SafeSearch API to detect
 * adult, violent, or racy content. Uses graceful degradation:
 * if @google-cloud/vision is not installed or credentials are
 * missing, returns a safe (unflagged) result instead of crashing.
 *
 * Flag thresholds:
 * - adult/violence: LIKELY or VERY_LIKELY
 * - racy: VERY_LIKELY only (concerts have suggestive but not explicit content)
 *
 * Phase 9: Trust & Safety Foundation
 */

import { logInfo, logWarn, logError } from '../utils/logger';

export interface SafeSearchResult {
  isFlagged: boolean;
  annotations: {
    adult: string;
    violence: string;
    racy: string;
    spoof: string;
    medical: string;
  };
  flagReasons: string[];
}

// Safe default result when Vision API is not configured
const SAFE_DEFAULT: SafeSearchResult = {
  isFlagged: false,
  annotations: {
    adult: 'UNKNOWN',
    violence: 'UNKNOWN',
    racy: 'UNKNOWN',
    spoof: 'UNKNOWN',
    medical: 'UNKNOWN',
  },
  flagReasons: [],
};

export class ImageModerationService {
  private client: any = null;
  private configured: boolean = false;

  constructor() {
    try {
      // Dynamic import to handle missing @google-cloud/vision gracefully
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const vision = require('@google-cloud/vision');
      this.client = new vision.ImageAnnotatorClient();
      this.configured = true;
      logInfo('ImageModerationService: Cloud Vision SafeSearch configured');
    } catch (error: any) {
      logWarn('ImageModerationService: Cloud Vision not configured. Image scanning disabled.', {
        error: error.message,
      });
      this.configured = false;
    }
  }

  /**
   * Scan an image URL for inappropriate content via SafeSearch.
   *
   * Returns { isFlagged, annotations, flagReasons }.
   * If Vision API is not configured, returns a safe default (unflagged).
   */
  async scanImage(imageUrl: string): Promise<SafeSearchResult> {
    if (!this.configured || !this.client) {
      logWarn('ImageModerationService: scanImage skipped (not configured)', { imageUrl });
      return { ...SAFE_DEFAULT };
    }

    try {
      const [result] = await this.client.safeSearchDetection(imageUrl);
      const annotations = result.safeSearchAnnotation;

      if (!annotations) {
        logWarn('ImageModerationService: No SafeSearch annotations returned', { imageUrl });
        return { ...SAFE_DEFAULT };
      }

      const flagReasons: string[] = [];

      // Flag if LIKELY or VERY_LIKELY for adult/violence (high risk)
      const highRiskCategories = ['adult', 'violence'];
      for (const cat of highRiskCategories) {
        const likelihood = (annotations as any)[cat];
        if (likelihood === 'LIKELY' || likelihood === 'VERY_LIKELY') {
          flagReasons.push(`${cat}: ${likelihood}`);
        }
      }

      // Flag if VERY_LIKELY only for racy (concerts have suggestive but not explicit content)
      const mediumRiskCategories = ['racy'];
      for (const cat of mediumRiskCategories) {
        const likelihood = (annotations as any)[cat];
        if (likelihood === 'VERY_LIKELY') {
          flagReasons.push(`${cat}: ${likelihood}`);
        }
      }

      const scanResult: SafeSearchResult = {
        isFlagged: flagReasons.length > 0,
        annotations: {
          adult: annotations.adult || 'UNKNOWN',
          violence: annotations.violence || 'UNKNOWN',
          racy: annotations.racy || 'UNKNOWN',
          spoof: annotations.spoof || 'UNKNOWN',
          medical: annotations.medical || 'UNKNOWN',
        },
        flagReasons,
      };

      if (scanResult.isFlagged) {
        logWarn('ImageModerationService: Image flagged', {
          imageUrl,
          flagReasons,
        });
      } else {
        logInfo('ImageModerationService: Image passed SafeSearch', { imageUrl });
      }

      return scanResult;
    } catch (error: any) {
      logError('ImageModerationService: SafeSearch scan failed', {
        imageUrl,
        error: error.message,
      });

      // Fail open: don't block content if scanning fails
      return { ...SAFE_DEFAULT };
    }
  }
}
