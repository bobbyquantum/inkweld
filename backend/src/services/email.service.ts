import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { configService } from './config.service';
import { logger } from './logger.service';
import type { DatabaseInstance } from '../types/context';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Email service for sending transactional emails via SMTP (nodemailer).
 *
 * - Checks EMAIL_ENABLED before sending (returns gracefully if disabled)
 * - Creates the nodemailer transport lazily on first use
 * - Invalidates the transport cache when config changes
 * - Logs all send attempts (recipient + success/failure, never body/tokens)
 * - Never throws — always returns a result object
 */
class EmailService {
  private transporter: Transporter | null = null;
  private transporterConfigHash: string | null = null;

  /**
   * Invalidate the cached transporter so a new one is created on next send.
   * Call this when admin email settings change.
   */
  invalidateTransporter(): void {
    this.transporter = null;
    this.transporterConfigHash = null;
  }

  /**
   * Build a hash string from the current config to detect changes.
   */
  private buildConfigHash(
    host: string,
    port: string,
    encryption: string,
    username: string,
    password: string
  ): string {
    return `${host}:${port}:${encryption}:${username}:${password}`;
  }

  /**
   * Get or create a nodemailer transporter using the current email config.
   */
  private async getTransporter(db: DatabaseInstance): Promise<Transporter> {
    const host = (await configService.get(db, 'EMAIL_HOST')).value;
    const port = (await configService.get(db, 'EMAIL_PORT')).value || '587';
    const encryption = (await configService.get(db, 'EMAIL_ENCRYPTION')).value || 'starttls';
    const username = (await configService.get(db, 'EMAIL_USERNAME')).value;
    const password = (await configService.get(db, 'EMAIL_PASSWORD')).value;

    const configHash = this.buildConfigHash(host, port, encryption, username, password);

    // Return cached transporter if config hasn't changed
    if (this.transporter && this.transporterConfigHash === configHash) {
      return this.transporter;
    }

    const portNum = parseInt(port, 10);
    const secure = encryption === 'tls'; // port 465 / implicit TLS

    const transportOptions: nodemailer.TransportOptions & {
      host: string;
      port: number;
      secure: boolean;
      auth?: { user: string; pass: string };
      tls?: { rejectUnauthorized: boolean };
    } = {
      host,
      port: portNum,
      secure,
      tls: {
        rejectUnauthorized: true,
      },
    };

    // Only include auth if credentials are provided
    if (username || password) {
      transportOptions.auth = {
        user: username,
        pass: password,
      };
    }

    // STARTTLS: not secure initially, but upgrade
    if (encryption === 'starttls') {
      transportOptions.secure = false;
      // nodemailer uses STARTTLS by default when secure=false and the server advertises it
    }

    this.transporter = nodemailer.createTransport(transportOptions as nodemailer.TransportOptions);
    this.transporterConfigHash = configHash;
    return this.transporter;
  }

  /**
   * Check if email is enabled in the current configuration.
   */
  async isEnabled(db: DatabaseInstance): Promise<boolean> {
    return configService.getBoolean(db, 'EMAIL_ENABLED');
  }

  /**
   * Send an email. Returns a result object — never throws.
   *
   * If EMAIL_ENABLED is false, returns { success: false, error: 'Email is not configured' }.
   */
  async sendEmail(db: DatabaseInstance, options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      // Skip invalid or placeholder addresses
      if (!options.to || options.to.endsWith('@local') || !options.to.includes('@')) {
        logger.info('Email', 'Email sending skipped — no valid recipient address', {
          to: options.to,
        });
        return { success: false, error: 'No valid recipient email address' };
      }

      // Check if email is enabled
      const enabled = await this.isEnabled(db);
      if (!enabled) {
        logger.info('Email', 'Email sending skipped — email is not enabled', {
          to: options.to,
        });
        return { success: false, error: 'Email is not configured' };
      }

      // Get sender identity
      const fromAddress = (await configService.get(db, 'EMAIL_FROM')).value || 'noreply@localhost';
      const fromName = (await configService.get(db, 'EMAIL_FROM_NAME')).value || 'Inkweld';

      const transporter = await this.getTransporter(db);

      await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      logger.info('Email', `Email sent successfully`, {
        to: options.to,
        subject: options.subject,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown email error';
      logger.error('Email', `Failed to send email`, error, {
        to: options.to,
        subject: options.subject,
      });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send a test email to verify SMTP configuration.
   * Returns detailed error information for the admin UI.
   */
  async sendTestEmail(db: DatabaseInstance, toAddress: string): Promise<SendEmailResult> {
    try {
      const fromAddress = (await configService.get(db, 'EMAIL_FROM')).value || 'noreply@localhost';
      const fromName = (await configService.get(db, 'EMAIL_FROM_NAME')).value || 'Inkweld';

      const transporter = await this.getTransporter(db);

      await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: toAddress,
        subject: 'Inkweld — Test Email',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="margin: 0 0 16px 0; color: #1a1a1a;">Inkweld Test Email</h2>
            <p style="color: #333; line-height: 1.6;">
              This is a test email from your Inkweld instance. If you're reading this, your email configuration is working correctly!
            </p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
            <p style="color: #888; font-size: 12px;">Sent from Inkweld email configuration test.</p>
          </div>
        `,
        text: "Inkweld Test Email\n\nThis is a test email from your Inkweld instance. If you're reading this, your email configuration is working correctly!",
      });

      logger.info('Email', `Test email sent successfully`, { to: toAddress });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown email error';
      logger.error('Email', `Failed to send test email`, error, { to: toAddress });
      return { success: false, error: errorMessage };
    }
  }
}

export const emailService = new EmailService();
