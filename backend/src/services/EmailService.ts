import { Resend } from 'resend';
import { logInfo, logWarn, logError } from '../utils/logger';

/**
 * EmailService - Resend wrapper for transactional email with graceful degradation.
 *
 * If RESEND_API_KEY is not set, the service logs a warning and degrades gracefully:
 * the app still starts, but password reset emails are not sent.
 */
export class EmailService {
  private resend: Resend | null = null;
  private fromAddress: string;
  private configured: boolean;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logWarn(
        'RESEND_API_KEY not set - EmailService disabled. Password reset emails will not be sent.'
      );
      this.configured = false;
      this.fromAddress = '';
      return;
    }

    this.resend = new Resend(apiKey);
    this.fromAddress = process.env.RESEND_FROM_ADDRESS || 'SoundCheck <noreply@resend.dev>';
    this.configured = true;
    logInfo('EmailService initialized with Resend');
  }

  /**
   * Returns whether Resend is configured and the service can send emails.
   */
  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Send a password reset email with a branded HTML template.
   *
   * If Resend is not configured, logs a warning and returns without throwing.
   */
  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    if (!this.configured || !this.resend) {
      logWarn(`EmailService not configured - skipping password reset email to ${to}`);
      return;
    }

    const resetUrl = `soundcheck://reset-password?token=${resetToken}`;

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: [to],
        subject: 'Reset your SoundCheck password',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0D0F11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0F11;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#161B22;border-radius:12px;padding:40px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <h1 style="color:#CCFF00;margin:0;font-size:28px;">SoundCheck</h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:16px;">
              <h2 style="color:#F0F6FC;margin:0;font-size:20px;">Password Reset</h2>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <p style="color:#8B949E;margin:0;font-size:15px;line-height:1.5;">
                You requested a password reset for your SoundCheck account. Tap the button below to set a new password. This link expires in 1 hour.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background-color:#CCFF00;color:#0D0F11;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">
                Reset Password
              </a>
            </td>
          </tr>
          <tr>
            <td>
              <p style="color:#6E7681;margin:0;font-size:13px;line-height:1.5;">
                If you didn't request this, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      });

      if (error) {
        logError('Failed to send password reset email via Resend', { to, error: error.message });
        throw new Error(`Failed to send reset email: ${error.message}`);
      }

      logInfo('Password reset email sent', { to });
    } catch (err) {
      logError('Error sending password reset email', { to, error: err });
      throw err;
    }
  }
}
