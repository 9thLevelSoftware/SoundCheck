import {
  ConsentService,
  VALID_PURPOSES,
  ConsentRecord,
  UserConsents,
} from '../../services/ConsentService';
import Database from '../../config/database';

// Mock dependencies
jest.mock('../../config/database');

const mockDb = {
  query: jest.fn(),
};

(Database.getInstance as jest.Mock).mockReturnValue(mockDb);

describe('ConsentService', () => {
  let consentService: ConsentService;

  beforeEach(() => {
    consentService = new ConsentService();
    jest.clearAllMocks();
  });

  describe('VALID_PURPOSES', () => {
    it('should include all required consent purposes', () => {
      expect(VALID_PURPOSES).toContain('location_tracking');
      expect(VALID_PURPOSES).toContain('analytics');
      expect(VALID_PURPOSES).toContain('marketing_emails');
      expect(VALID_PURPOSES).toContain('third_party_sharing');
      expect(VALID_PURPOSES).toContain('personalization');
    });

    it('should have exactly 5 valid purposes', () => {
      expect(VALID_PURPOSES).toHaveLength(5);
    });
  });

  describe('getValidPurposes', () => {
    it('should return all valid purposes', () => {
      const purposes = consentService.getValidPurposes();
      expect(purposes).toEqual(VALID_PURPOSES);
    });
  });

  describe('recordConsent', () => {
    const userId = 'user-123';
    const mockConsentRecord = {
      id: 'consent-1',
      user_id: userId,
      purpose: 'analytics',
      granted: true,
      recorded_at: new Date('2024-06-01T10:00:00Z'),
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
    };

    it('should record consent with metadata', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockConsentRecord] });

      const result = await consentService.recordConsent(userId, 'analytics', true, {
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_consents'),
        [userId, 'analytics', true, '192.168.1.1', 'Mozilla/5.0']
      );
      expect(result.id).toBe('consent-1');
      expect(result.userId).toBe(userId);
      expect(result.purpose).toBe('analytics');
      expect(result.granted).toBe(true);
      expect(result.ipAddress).toBe('192.168.1.1');
      expect(result.userAgent).toBe('Mozilla/5.0');
    });

    it('should record consent without metadata', async () => {
      const recordWithoutMeta = {
        ...mockConsentRecord,
        ip_address: null,
        user_agent: null,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [recordWithoutMeta] });

      const result = await consentService.recordConsent(userId, 'analytics', true);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_consents'),
        [userId, 'analytics', true, null, null]
      );
      expect(result.ipAddress).toBeNull();
      expect(result.userAgent).toBeNull();
    });

    it('should record consent revocation (granted=false)', async () => {
      const revokedRecord = {
        ...mockConsentRecord,
        granted: false,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [revokedRecord] });

      const result = await consentService.recordConsent(userId, 'analytics', false);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_consents'),
        [userId, 'analytics', false, null, null]
      );
      expect(result.granted).toBe(false);
    });

    it('should throw error for invalid purpose', async () => {
      await expect(consentService.recordConsent(userId, 'invalid_purpose', true)).rejects.toThrow(
        'Invalid consent purpose: invalid_purpose'
      );
    });

    it('should throw error mentioning valid purposes', async () => {
      await expect(consentService.recordConsent(userId, 'bad_purpose', true)).rejects.toThrow(
        'Valid purposes are:'
      );
    });

    it('should record consent for each valid purpose', async () => {
      for (const purpose of VALID_PURPOSES) {
        mockDb.query.mockResolvedValueOnce({
          rows: [{ ...mockConsentRecord, purpose }],
        });

        const result = await consentService.recordConsent(userId, purpose, true);
        expect(result.purpose).toBe(purpose);
      }

      expect(mockDb.query).toHaveBeenCalledTimes(5);
    });

    it('should format date as ISO string', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockConsentRecord] });

      const result = await consentService.recordConsent(userId, 'analytics', true);

      expect(result.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('getUserConsents', () => {
    const userId = 'user-123';

    it('should return current consents for all purposes', async () => {
      const mockConsents = [
        { purpose: 'analytics', granted: true, recorded_at: new Date('2024-06-01T10:00:00Z') },
        {
          purpose: 'marketing_emails',
          granted: false,
          recorded_at: new Date('2024-06-02T10:00:00Z'),
        },
        {
          purpose: 'personalization',
          granted: true,
          recorded_at: new Date('2024-06-03T10:00:00Z'),
        },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: mockConsents });

      const result = await consentService.getUserConsents(userId);

      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('DISTINCT ON (purpose)'), [
        userId,
      ]);
      expect(result.analytics).toEqual({
        granted: true,
        recordedAt: expect.any(String),
      });
      expect(result.marketing_emails).toEqual({
        granted: false,
        recordedAt: expect.any(String),
      });
      expect(result.personalization).toEqual({
        granted: true,
        recordedAt: expect.any(String),
      });
    });

    it('should return empty object for user with no consents', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await consentService.getUserConsents(userId);

      expect(result).toEqual({});
    });

    it('should use ORDER BY to get most recent consent per purpose', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await consentService.getUserConsents(userId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY purpose, recorded_at DESC'),
        [userId]
      );
    });
  });

  describe('getConsentHistory', () => {
    const userId = 'user-123';

    it('should return full consent history for a purpose', async () => {
      const mockHistory = [
        {
          id: 'consent-3',
          user_id: userId,
          purpose: 'analytics',
          granted: false,
          recorded_at: new Date('2024-06-03T10:00:00Z'),
          ip_address: '10.0.0.1',
          user_agent: 'Chrome',
        },
        {
          id: 'consent-2',
          user_id: userId,
          purpose: 'analytics',
          granted: true,
          recorded_at: new Date('2024-06-02T10:00:00Z'),
          ip_address: '10.0.0.1',
          user_agent: 'Chrome',
        },
        {
          id: 'consent-1',
          user_id: userId,
          purpose: 'analytics',
          granted: true,
          recorded_at: new Date('2024-06-01T10:00:00Z'),
          ip_address: '192.168.1.1',
          user_agent: 'Firefox',
        },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: mockHistory });

      const result = await consentService.getConsentHistory(userId, 'analytics');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND purpose = $2'),
        [userId, 'analytics']
      );
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('consent-3');
      expect(result[0].granted).toBe(false);
      expect(result[1].granted).toBe(true);
      expect(result[2].granted).toBe(true);
    });

    it('should return empty array for purpose with no history', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await consentService.getConsentHistory(userId, 'analytics');

      expect(result).toEqual([]);
    });

    it('should throw error for invalid purpose', async () => {
      await expect(consentService.getConsentHistory(userId, 'invalid_purpose')).rejects.toThrow(
        'Invalid consent purpose: invalid_purpose'
      );
    });

    it('should order history by recorded_at DESC', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await consentService.getConsentHistory(userId, 'analytics');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY recorded_at DESC'),
        [userId, 'analytics']
      );
    });
  });

  describe('hasConsent', () => {
    const userId = 'user-123';

    it('should return true when user has granted consent', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ granted: true }] });

      const result = await consentService.hasConsent(userId, 'analytics');

      expect(result).toBe(true);
    });

    it('should return false when user has revoked consent', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ granted: false }] });

      const result = await consentService.hasConsent(userId, 'analytics');

      expect(result).toBe(false);
    });

    it('should return false when no consent record exists', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await consentService.hasConsent(userId, 'analytics');

      expect(result).toBe(false);
    });

    it('should throw error for invalid purpose', async () => {
      await expect(consentService.hasConsent(userId, 'invalid_purpose')).rejects.toThrow(
        'Invalid consent purpose: invalid_purpose'
      );
    });

    it('should query with LIMIT 1 to get most recent', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await consentService.hasConsent(userId, 'analytics');

      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT 1'), [
        userId,
        'analytics',
      ]);
    });
  });

  describe('revokeAllConsents', () => {
    const userId = 'user-123';

    it('should revoke all currently granted consents', async () => {
      // Mock getUserConsents to return some granted consents
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { purpose: 'analytics', granted: true, recorded_at: new Date() },
          { purpose: 'marketing_emails', granted: true, recorded_at: new Date() },
          { purpose: 'personalization', granted: false, recorded_at: new Date() },
        ],
      });

      // Mock recordConsent calls for each revocation
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'new-1',
            user_id: userId,
            purpose: 'analytics',
            granted: false,
            recorded_at: new Date(),
            ip_address: null,
            user_agent: null,
          },
        ],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'new-2',
            user_id: userId,
            purpose: 'marketing_emails',
            granted: false,
            recorded_at: new Date(),
            ip_address: null,
            user_agent: null,
          },
        ],
      });

      const result = await consentService.revokeAllConsents(userId);

      // Should have revoked 2 consents (analytics and marketing_emails)
      expect(result).toBe(2);
      // 1 call for getUserConsents + 2 calls for recordConsent (revocations)
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('should return 0 when no consents are granted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { purpose: 'analytics', granted: false, recorded_at: new Date() },
          { purpose: 'marketing_emails', granted: false, recorded_at: new Date() },
        ],
      });

      const result = await consentService.revokeAllConsents(userId);

      expect(result).toBe(0);
      // Only 1 call for getUserConsents, no recordConsent calls
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('should return 0 when user has no consent records', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await consentService.revokeAllConsents(userId);

      expect(result).toBe(0);
    });

    it('should include metadata when revoking', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ purpose: 'analytics', granted: true, recorded_at: new Date() }],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'new-1',
            user_id: userId,
            purpose: 'analytics',
            granted: false,
            recorded_at: new Date(),
            ip_address: '10.0.0.1',
            user_agent: 'Test Agent',
          },
        ],
      });

      await consentService.revokeAllConsents(userId, {
        ipAddress: '10.0.0.1',
        userAgent: 'Test Agent',
      });

      // Verify the second call (recordConsent) includes metadata
      expect(mockDb.query).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        expect.arrayContaining(['10.0.0.1', 'Test Agent'])
      );
    });
  });

  describe('date handling', () => {
    const userId = 'user-123';

    it('should handle Date objects from database', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'consent-1',
            user_id: userId,
            purpose: 'analytics',
            granted: true,
            recorded_at: new Date('2024-06-01T10:00:00Z'),
            ip_address: null,
            user_agent: null,
          },
        ],
      });

      const result = await consentService.recordConsent(userId, 'analytics', true);

      expect(result.recordedAt).toBe('2024-06-01T10:00:00.000Z');
    });

    it('should handle string dates from database', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'consent-1',
            user_id: userId,
            purpose: 'analytics',
            granted: true,
            recorded_at: '2024-06-01T10:00:00.000Z',
            ip_address: null,
            user_agent: null,
          },
        ],
      });

      const result = await consentService.recordConsent(userId, 'analytics', true);

      expect(result.recordedAt).toBe('2024-06-01T10:00:00.000Z');
    });
  });
});
