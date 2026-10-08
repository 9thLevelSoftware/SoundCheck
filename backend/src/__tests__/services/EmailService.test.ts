import { EmailService } from '../../services/EmailService';
import { logInfo, logWarn, logError } from '../../utils/logger';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

// Mock Resend - create mock function outside
const mockResendSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend,
    },
  })),
}));

function signupLogText(): string {
  return JSON.stringify([
    (logInfo as jest.Mock).mock.calls,
    (logWarn as jest.Mock).mock.calls,
    (logError as jest.Mock).mock.calls,
  ]);
}

describe('EmailService', () => {
  let emailService: EmailService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    mockResendSend.mockReset();
    // Reset process.env to clean state
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_ADDRESS;
    delete process.env.PASSWORD_RESET_BASE_URL;
    delete process.env.WEB_BASE_URL;
    delete process.env.BASE_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize with Resend when API key is set', () => {
      process.env.RESEND_API_KEY = 'test-api-key';

      // Need to re-require to get fresh instance with new env
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { EmailService: EmailServiceWithEnv } = require('../../services/EmailService');
        const service = new EmailServiceWithEnv();

        expect(service.isConfigured()).toBe(true);
        expect(logInfo).toHaveBeenCalledWith('EmailService initialized with Resend');
      });
    });

    it('should gracefully degrade when RESEND_API_KEY is not set', () => {
      // Ensure no API key
      delete process.env.RESEND_API_KEY;

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { EmailService: EmailServiceNoEnv } = require('../../services/EmailService');
        const service = new EmailServiceNoEnv();

        expect(service.isConfigured()).toBe(false);
        expect(logWarn).toHaveBeenCalledWith(
          'RESEND_API_KEY not set - EmailService disabled. Password reset emails will not be sent.'
        );
      });
    });

    it('should use custom from address when RESEND_FROM_ADDRESS is set', () => {
      process.env.RESEND_API_KEY = 'test-api-key';
      process.env.RESEND_FROM_ADDRESS = 'Custom Sender <custom@example.com>';

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { EmailService: EmailServiceWithFrom } = require('../../services/EmailService');
        const service = new EmailServiceWithFrom();

        expect(service.isConfigured()).toBe(true);
      });
    });

    it('should use default from address when RESEND_FROM_ADDRESS is not set', () => {
      process.env.RESEND_API_KEY = 'test-api-key';
      delete process.env.RESEND_FROM_ADDRESS;

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { EmailService: EmailServiceDefaultFrom } = require('../../services/EmailService');
        const service = new EmailServiceDefaultFrom();

        expect(service.isConfigured()).toBe(true);
      });
    });
  });

  describe('isConfigured', () => {
    it('should return true when Resend is configured', () => {
      process.env.RESEND_API_KEY = 'test-api-key';

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { EmailService } = require('../../services/EmailService');
        const service = new EmailService();

        expect(service.isConfigured()).toBe(true);
      });
    });

    it('should return false when Resend is not configured', () => {
      delete process.env.RESEND_API_KEY;

      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { EmailService } = require('../../services/EmailService');
        const service = new EmailService();

        expect(service.isConfigured()).toBe(false);
      });
    });
  });

  describe('sendPasswordResetEmail', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 'test-api-key';
      process.env.RESEND_FROM_ADDRESS = 'SoundCheck <noreply@example.com>';
      process.env.PASSWORD_RESET_BASE_URL = 'https://soundcheck.app';

      // Create service with mocked Resend for these tests
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Resend } = require('resend');
      Resend.mockImplementation(() => ({
        emails: {
          send: mockResendSend,
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EmailService } = require('../../services/EmailService');
      emailService = new EmailService();
    });

    it('should send password reset email with correct parameters', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      const to = 'user@example.com';
      const token = 'reset-token-123';

      await emailService.sendPasswordResetEmail(to, token);

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'SoundCheck <noreply@example.com>',
          to: [to],
          subject: 'Reset your SoundCheck password',
        })
      );
    });

    it('should include branded HTML template with SoundCheck branding', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      await emailService.sendPasswordResetEmail('user@example.com', 'token-456');

      const callArgs = mockResendSend.mock.calls[0][0];
      const html = callArgs.html;

      expect(html).toContain('SoundCheck');
      expect(html).toContain('#CCFF00'); // Brand color (neon green)
      expect(html).toContain('#0D0F11'); // Dark background
      // Subject is set on email, not in HTML body - HTML has "Password Reset" as heading
      expect(html).toContain('Password Reset');
    });

    it('should construct a verified HTTPS reset URL with encoded token', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      const token = 'my-secret-token-abc123';
      await emailService.sendPasswordResetEmail('user@example.com', token);

      const callArgs = mockResendSend.mock.calls[0][0];
      expect(callArgs.html).toContain(`https://soundcheck.app/reset-password?token=${token}`);
      expect(callArgs.html).not.toContain('soundcheck://reset-password');
    });

    it('should log success when email is sent', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      await emailService.sendPasswordResetEmail('user@example.com', 'token-789');

      expect(logInfo).toHaveBeenCalledWith('Password reset email sent', { to: 'user@example.com' });
    });

    it('should handle Resend API errors and throw', async () => {
      mockResendSend.mockResolvedValueOnce({ error: { message: 'Invalid API key' } });

      await expect(
        emailService.sendPasswordResetEmail('user@example.com', 'token-xyz')
      ).rejects.toThrow('Failed to send reset email: Invalid API key');

      expect(logError).toHaveBeenCalledWith(
        'Failed to send password reset email via Resend',
        expect.objectContaining({ to: 'user@example.com', error: 'Invalid API key' })
      );
    });

    it('should handle network/connection errors', async () => {
      const networkError = new Error('Network timeout');
      mockResendSend.mockRejectedValueOnce(networkError);

      await expect(
        emailService.sendPasswordResetEmail('user@example.com', 'token-xyz')
      ).rejects.toThrow('Network timeout');

      expect(logError).toHaveBeenCalledWith(
        'Error sending password reset email',
        expect.objectContaining({ to: 'user@example.com', error: networkError })
      );
    });

    it('should return early and log warning when service is not configured', async () => {
      // Create service without API key
      delete process.env.RESEND_API_KEY;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EmailService } = require('../../services/EmailService');
      const service = new EmailService();

      // Clear constructor logs
      jest.clearAllMocks();

      await service.sendPasswordResetEmail('user@example.com', 'token-123');

      expect(mockResendSend).not.toHaveBeenCalled();
      expect(logWarn).toHaveBeenCalledWith(
        'EmailService not configured - skipping password reset email to user@example.com'
      );
    });

    it('should handle multiple recipient emails safely', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      await emailService.sendPasswordResetEmail('multiple+tag@example.com', 'token-123');

      const callArgs = mockResendSend.mock.calls[0][0];
      expect(callArgs.to).toEqual(['multiple+tag@example.com']);
    });

    it('should include expiration message in email body', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      await emailService.sendPasswordResetEmail('user@example.com', 'token-123');

      const callArgs = mockResendSend.mock.calls[0][0];
      expect(callArgs.html).toContain('expires in 1 hour');
      expect(callArgs.html).toContain('1 hour');
    });

    it('should include security disclaimer for unsolicited requests', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      await emailService.sendPasswordResetEmail('user@example.com', 'token-123');

      const callArgs = mockResendSend.mock.calls[0][0];
      expect(callArgs.html).toContain("If you didn't request this");
      expect(callArgs.html).toContain('safely ignore');
    });

    it('should generate valid HTML structure', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      await emailService.sendPasswordResetEmail('user@example.com', 'token-123');

      const callArgs = mockResendSend.mock.calls[0][0];
      const html = callArgs.html;

      expect(html).toMatch(/<!DOCTYPE html>/);
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<body');
      expect(html).toContain('</body>');
    });

    it('should handle tokens with special characters', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      // Token with special characters
      const token = 'token<with>&"chars';
      await emailService.sendPasswordResetEmail('user@example.com', token);

      const callArgs = mockResendSend.mock.calls[0][0];
      expect(callArgs.html).toContain(
        'https://soundcheck.app/reset-password?token=token%3Cwith%3E%26%22chars'
      );
      expect(callArgs.html).not.toContain(token);
    });
  });

  describe('Template Rendering', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 'test-api-key';
      process.env.RESEND_FROM_ADDRESS = 'SoundCheck <noreply@example.com>';
      process.env.PASSWORD_RESET_BASE_URL = 'https://soundcheck.app';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Resend } = require('resend');
      Resend.mockImplementation(() => ({
        emails: {
          send: mockResendSend,
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EmailService } = require('../../services/EmailService');
      emailService = new EmailService();
    });

    it('should render template with various email formats', async () => {
      const testEmails = [
        'simple@example.com',
        'name.surname@example.com',
        'user+tag@example.com',
        'user-name@sub.example.co.uk',
      ];

      for (const email of testEmails) {
        mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });
        await emailService.sendPasswordResetEmail(email, 'token-123');

        const callArgs = mockResendSend.mock.calls[mockResendSend.mock.calls.length - 1][0];
        expect(callArgs.to).toEqual([email]);
        expect(callArgs.html).toContain('SoundCheck');
      }
    });

    it('should render template with various token formats', async () => {
      const testTokens = [
        'short',
        'a'.repeat(64),
        'token-with-dashes',
        'token_with_underscores',
        'TokenWithMixedCase123',
      ];

      for (const token of testTokens) {
        mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });
        await emailService.sendPasswordResetEmail('user@example.com', token);

        const callArgs = mockResendSend.mock.calls[mockResendSend.mock.calls.length - 1][0];
        expect(callArgs.html).toContain(`token=${token}`);
      }
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.RESEND_API_KEY = 'test-api-key';
      process.env.RESEND_FROM_ADDRESS = 'SoundCheck <noreply@example.com>';
      process.env.PASSWORD_RESET_BASE_URL = 'https://soundcheck.app';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Resend } = require('resend');
      Resend.mockImplementation(() => ({
        emails: {
          send: mockResendSend,
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EmailService } = require('../../services/EmailService');
      emailService = new EmailService();
    });

    it('should handle 429 rate limit errors', async () => {
      mockResendSend.mockResolvedValueOnce({ error: { message: 'Rate limit exceeded' } });

      await expect(
        emailService.sendPasswordResetEmail('user@example.com', 'token-123')
      ).rejects.toThrow('Failed to send reset email: Rate limit exceeded');
    });

    it('should handle 401 authentication errors', async () => {
      mockResendSend.mockResolvedValueOnce({ error: { message: 'Unauthorized' } });

      await expect(
        emailService.sendPasswordResetEmail('user@example.com', 'token-123')
      ).rejects.toThrow('Failed to send reset email: Unauthorized');
    });

    it('should not throw for successful send (no error in response)', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-123' } });

      await expect(
        emailService.sendPasswordResetEmail('user@example.com', 'token-123')
      ).resolves.not.toThrow();
    });

    it('should preserve error chain for debugging', async () => {
      const originalError = new Error('Connection refused');
      mockResendSend.mockRejectedValueOnce(originalError);

      let caughtError: Error | null = null;
      try {
        await emailService.sendPasswordResetEmail('user@example.com', 'token-123');
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError).toBe(originalError);
    });
  });

  describe('signup emails', () => {
    const unavailable = "We couldn't send the confirmation email. Try again later.";

    beforeEach(() => {
      process.env.RESEND_API_KEY = 'test-api-key';
      process.env.RESEND_FROM_ADDRESS = 'SoundCheck <noreply@example.com>';
      process.env.PASSWORD_RESET_BASE_URL = 'https://soundcheck.app';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Resend } = require('resend');
      Resend.mockImplementation(() => ({
        emails: { send: mockResendSend },
      }));

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EmailService: FreshEmailService } = require('../../services/EmailService');
      emailService = new FreshEmailService();
    });

    it('sends a short welcome email and does not log the address', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-1' } });

      await emailService.sendSignupWelcomeEmail('new@example.com');

      const payload = mockResendSend.mock.calls[0][0];
      expect(payload.subject).toBe('Your SoundCheck account is ready');
      expect(payload.html).toContain('Sign in with the password you just chose');
      expect(payload.to).toEqual(['new@example.com']);
      expect(signupLogText()).not.toContain('new@example.com');
    });

    it('sends the existing-account notice with a reset link and does not log the address', async () => {
      mockResendSend.mockResolvedValueOnce({ data: { id: 'email-2' } });

      await emailService.sendSignupExistingAccountEmail('taken@example.com', 'reset-token');

      const payload = mockResendSend.mock.calls[0][0];
      expect(payload.subject).toBe('Someone tried to create a SoundCheck account');
      expect(payload.html).toContain(
        'Someone tried to create an account with this email. If it was you, sign in or reset your password.'
      );
      expect(payload.html).toContain('https://soundcheck.app/reset-password?token=reset-token');
      expect(signupLogText()).not.toContain('taken@example.com');
    });

    it('fails both signup emails the same way when mail is not configured', async () => {
      delete process.env.RESEND_API_KEY;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { EmailService: UnconfiguredEmailService } = require('../../services/EmailService');
      const unconfigured = new UnconfiguredEmailService();

      await expect(unconfigured.sendSignupWelcomeEmail('a@example.com')).rejects.toMatchObject({
        statusCode: 503,
        message: unavailable,
      });
      await expect(
        unconfigured.sendSignupExistingAccountEmail('b@example.com', 'token')
      ).rejects.toMatchObject({
        statusCode: 503,
        message: unavailable,
      });
      expect(mockResendSend).not.toHaveBeenCalled();
      const logged = signupLogText();
      expect(logged).not.toContain('a@example.com');
      expect(logged).not.toContain('b@example.com');
    });
  });
});
