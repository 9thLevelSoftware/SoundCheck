// Mock dependencies before imports
const mockProcessPendingDeletions = jest.fn();
const mockDbQuery = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({
      query: mockDbQuery,
    })),
  },
}));

jest.mock('../../services/DataRetentionService', () => ({
  DataRetentionService: jest.fn().mockImplementation(() => ({
    processPendingDeletions: mockProcessPendingDeletions,
  })),
}));

jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: mockLoggerInfo,
    error: mockLoggerError,
    warn: mockLoggerWarn,
    debug: jest.fn(),
  },
}));

// Mock process.exit to prevent test from exiting
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});

describe('retentionJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset module cache to get fresh imports
    jest.resetModules();

    // Re-setup mocks after reset
    jest.mock('../../config/database', () => ({
      __esModule: true,
      default: {
        getInstance: jest.fn(() => ({
          query: mockDbQuery,
        })),
      },
    }));

    jest.mock('../../services/DataRetentionService', () => ({
      DataRetentionService: jest.fn().mockImplementation(() => ({
        processPendingDeletions: mockProcessPendingDeletions,
      })),
    }));
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  describe('runRetentionJob', () => {
    it('should be importable as a module', async () => {
      const { runRetentionJob } = await import('../../scripts/retentionJob');
      expect(runRetentionJob).toBeDefined();
      expect(typeof runRetentionJob).toBe('function');
    });

    it('should call processPendingDeletions', async () => {
      mockProcessPendingDeletions.mockResolvedValue({
        processed: 2,
        succeeded: 2,
        failed: 0,
        errors: [],
      });

      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 5 }) // Consent records
        .mockResolvedValueOnce({ rowCount: 10 }) // Notifications
        .mockResolvedValueOnce({ rowCount: 3 }); // Refresh tokens

      const { runRetentionJob } = await import('../../scripts/retentionJob');
      await runRetentionJob();

      expect(mockProcessPendingDeletions).toHaveBeenCalledTimes(1);
    });

    it('should clean up old consent records', async () => {
      mockProcessPendingDeletions.mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      });

      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 15 }) // Consent records
        .mockResolvedValueOnce({ rowCount: 0 }) // Notifications
        .mockResolvedValueOnce({ rowCount: 0 }); // Refresh tokens

      const { runRetentionJob } = await import('../../scripts/retentionJob');
      await runRetentionJob();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_consents')
      );
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '2 years'")
      );
    });

    it('should clean up old notifications', async () => {
      mockProcessPendingDeletions.mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      });

      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 0 }) // Consent records
        .mockResolvedValueOnce({ rowCount: 25 }) // Notifications
        .mockResolvedValueOnce({ rowCount: 0 }); // Refresh tokens

      const { runRetentionJob } = await import('../../scripts/retentionJob');
      await runRetentionJob();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM notifications')
      );
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '90 days'")
      );
    });

    it('should clean up expired refresh tokens', async () => {
      mockProcessPendingDeletions.mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      });

      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 0 }) // Consent records
        .mockResolvedValueOnce({ rowCount: 0 }) // Notifications
        .mockResolvedValueOnce({ rowCount: 8 }); // Refresh tokens

      const { runRetentionJob } = await import('../../scripts/retentionJob');
      await runRetentionJob();

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM refresh_tokens')
      );
      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '7 days'")
      );
    });

    it('should call process.exit(1) on error', async () => {
      mockProcessPendingDeletions.mockRejectedValue(
        new Error('Database connection failed')
      );

      const { runRetentionJob } = await import('../../scripts/retentionJob');

      await expect(runRetentionJob()).rejects.toThrow('process.exit(1)');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should log deletion errors from processPendingDeletions', async () => {
      mockProcessPendingDeletions.mockResolvedValue({
        processed: 2,
        succeeded: 1,
        failed: 1,
        errors: [{ userId: 'user-123', error: 'User not found' }],
      });

      mockDbQuery
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 0 });

      const { runRetentionJob } = await import('../../scripts/retentionJob');
      await runRetentionJob();

      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('user-123'),
        expect.objectContaining({ userId: 'user-123' })
      );
    });

    it('should complete all cleanup operations in order', async () => {
      mockProcessPendingDeletions.mockResolvedValue({
        processed: 1,
        succeeded: 1,
        failed: 0,
        errors: [],
      });

      const callOrder: string[] = [];

      mockDbQuery.mockImplementation((query: string) => {
        if (query.includes('user_consents')) {
          callOrder.push('consents');
        } else if (query.includes('notifications')) {
          callOrder.push('notifications');
        } else if (query.includes('refresh_tokens')) {
          callOrder.push('tokens');
        }
        return Promise.resolve({ rowCount: 0 });
      });

      const { runRetentionJob } = await import('../../scripts/retentionJob');
      await runRetentionJob();

      // Verify the order of operations
      expect(callOrder).toEqual(['consents', 'notifications', 'tokens']);
    });
  });

  describe('retention policy compliance', () => {
    it('should retain consent records for at least 2 years', async () => {
      mockProcessPendingDeletions.mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      });

      mockDbQuery.mockResolvedValue({ rowCount: 0 });

      const { runRetentionJob } = await import('../../scripts/retentionJob');
      await runRetentionJob();

      // Verify the query uses 2 years interval
      const consentQuery = mockDbQuery.mock.calls.find(
        (call: any[]) => call[0].includes('user_consents')
      );
      expect(consentQuery).toBeDefined();
      expect(consentQuery[0]).toContain("INTERVAL '2 years'");
    });

    it('should retain notifications for 90 days', async () => {
      mockProcessPendingDeletions.mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      });

      mockDbQuery.mockResolvedValue({ rowCount: 0 });

      const { runRetentionJob } = await import('../../scripts/retentionJob');
      await runRetentionJob();

      // Verify the query uses 90 days interval
      const notificationQuery = mockDbQuery.mock.calls.find(
        (call: any[]) => call[0].includes('notifications')
      );
      expect(notificationQuery).toBeDefined();
      expect(notificationQuery[0]).toContain("INTERVAL '90 days'");
    });

    it('should keep expired tokens for 7 days before deletion', async () => {
      mockProcessPendingDeletions.mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        errors: [],
      });

      mockDbQuery.mockResolvedValue({ rowCount: 0 });

      const { runRetentionJob } = await import('../../scripts/retentionJob');
      await runRetentionJob();

      // Verify the query uses 7 days interval
      const tokenQuery = mockDbQuery.mock.calls.find(
        (call: any[]) => call[0].includes('refresh_tokens')
      );
      expect(tokenQuery).toBeDefined();
      expect(tokenQuery[0]).toContain("INTERVAL '7 days'");
    });
  });
});
