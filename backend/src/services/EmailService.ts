import { Resend } from 'resend';
import { ServiceUnavailableError } from '../utils/errors';
import { logInfo, logWarn, logError } from '../utils/logger';

/** Same failure for a new signup and an existing address when mail cannot be sent. */
export const SIGNUP_MAIL_UNAVAILABLE_MESSAGE =
  "We couldn't send the confirmation email. Try again later.";

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
  private passwordResetBaseUrl: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      logWarn(
        'RESEND_API_KEY not set - EmailService disabled. Password reset emails will not be sent.'
      );
      this.configured = false;
      this.fromAddress = '';
      this.passwordResetBaseUrl = this.resolvePasswordResetBaseUrl();
      return;
    }

    this.resend = new Resend(apiKey);
    this.fromAddress = process.env.RESEND_FROM_ADDRESS || 'SoundCheck <noreply@resend.dev>';
    this.passwordResetBaseUrl = this.resolvePasswordResetBaseUrl();
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

    const resetUrl = this.buildPasswordResetUrl(resetToken);

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

  /**
   * Welcome mail for an address that just got an account.
   * Does not log the address.
   */
  async sendSignupWelcomeEmail(to: string): Promise<void> {
    await this.sendSignupEmail(
      to,
      'Your SoundCheck account is ready',
      'Welcome to SoundCheck',
      'Your account is ready. Sign in with the password you just chose.'
    );
  }

  /**
   * Notice for an address that already has an account.
   * `resetToken` is null for social-only accounts, which cannot take a password reset.
   * Does not log the address.
   */
  async sendSignupExistingAccountEmail(to: string, resetToken: string | null): Promise<void> {
    const resetUrl = resetToken ? this.buildPasswordResetUrl(resetToken) : null;
    const body = resetUrl
      ? 'Someone tried to create an account with this email. If it was you, sign in or reset your password.'
      : 'Someone tried to create an account with this email. If it was you, sign in with the account you already have.';
    await this.sendSignupEmail(
      to,
      'Someone tried to create a SoundCheck account',
      'Account already in use',
      body,
      resetUrl
    );
  }

  private async sendSignupEmail(
    to: string,
    subject: string,
    heading: string,
    body: string,
    actionHref: string | null = null
  ): Promise<void> {
    if (!this.configured || !this.resend) {
      logWarn('EmailService not configured - signup email not sent');
      throw new ServiceUnavailableError(SIGNUP_MAIL_UNAVAILABLE_MESSAGE);
    }

    const action = actionHref
      ? `<tr><td align="center" style="padding-bottom:24px;"><a href="${actionHref}" style="display:inline-block;padding:14px 32px;background-color:#CCFF00;color:#0D0F11;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">Reset password</a></td></tr>`
      : '';

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: [to],
        subject,
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
          <tr><td align="center" style="padding-bottom:24px;"><h1 style="color:#CCFF00;margin:0;font-size:28px;">SoundCheck</h1></td></tr>
          <tr><td style="padding-bottom:16px;"><h2 style="color:#F0F6FC;margin:0;font-size:20px;">${heading}</h2></td></tr>
          <tr><td style="padding-bottom:24px;"><p style="color:#8B949E;margin:0;font-size:15px;line-height:1.5;">${body}</p></td></tr>
          ${action}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
        `.trim(),
      });

      if (error) {
        logError('Signup email was rejected by the mail provider');
        throw new ServiceUnavailableError(SIGNUP_MAIL_UNAVAILABLE_MESSAGE);
      }

      logInfo('Signup email sent');
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        throw err;
      }
      logError('Signup email failed to send');
      throw new ServiceUnavailableError(SIGNUP_MAIL_UNAVAILABLE_MESSAGE);
    }
  }

  private resolvePasswordResetBaseUrl(): string {
    return (
      process.env.PASSWORD_RESET_BASE_URL ||
      process.env.WEB_BASE_URL ||
      process.env.BASE_URL ||
      'https://soundcheck.app'
    ).replace(/\/+$/, '');
  }

  private buildPasswordResetUrl(resetToken: string): string {
    const resetUrl = new URL('/reset-password', this.passwordResetBaseUrl);
    resetUrl.searchParams.set('token', resetToken);
    return resetUrl.toString();
  }
}
