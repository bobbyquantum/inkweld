import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CaptchaSettings {
  enabled: boolean;
  siteKey?: string;
}

export interface SystemFeatures {
  aiLinting: boolean;
  aiImageGeneration: boolean;
  captcha: CaptchaSettings;
  appMode: 'ONLINE' | 'OFFLINE' | 'BOTH';
  defaultServerName?: string;
  userApprovalRequired: boolean;
}

@Injectable()
export class SystemConfigService {
  private readonly logger = new Logger(SystemConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get the current system features configuration
   * @returns SystemFeatures object indicating which features are enabled
   */
  getSystemFeatures(): SystemFeatures {
    const openaiApiKey = this.configService.get<string>('OPENAI_API_KEY');
    const hasOpenAI = !!openaiApiKey && openaiApiKey.trim().length > 0;

    const captchaSettings = this.getCaptchaSettings();
    const appMode = this.getAppMode();
    const defaultServerName = this.getDefaultServerName();
    const userApprovalRequired = this.getUserApprovalRequired();

    return {
      aiLinting: hasOpenAI,
      aiImageGeneration: hasOpenAI,
      captcha: captchaSettings,
      appMode,
      defaultServerName,
      userApprovalRequired,
    };
  }

  /**
   * Get app mode configuration from environment variables
   */
  getAppMode(): 'ONLINE' | 'OFFLINE' | 'BOTH' {
    const mode = this.configService.get<string>('APP_MODE', 'BOTH').toUpperCase();
    if (mode === 'ONLINE' || mode === 'OFFLINE' || mode === 'BOTH') {
      return mode as 'ONLINE' | 'OFFLINE' | 'BOTH';
    }
    return 'BOTH'; // Default to BOTH if invalid value
  }

  /**
   * Get default server name from environment variables
   */
  getDefaultServerName(): string | undefined {
    const serverName = this.configService.get<string>('DEFAULT_SERVER_NAME');
    return serverName && serverName.trim().length > 0 ? serverName.trim() : undefined;
  }

  /**
   * Get captcha configuration from environment variables
   */
  getCaptchaSettings(): CaptchaSettings {
    const enabled =
      this.configService
        .get<string>('RECAPTCHA_ENABLED', 'false')
        .toLowerCase() === 'true';
    const siteKey = this.configService.get<string>('RECAPTCHA_SITE_KEY');

    return {
      enabled: enabled && !!siteKey,
      siteKey: enabled ? siteKey : undefined,
    };
  }

  /**
   * Verify reCAPTCHA token with Google's API
   */
  async verifyCaptcha(token: string): Promise<boolean> {
    const enabled =
      this.configService
        .get<string>('RECAPTCHA_ENABLED', 'false')
        .toLowerCase() === 'true';
    const secretKey = this.configService.get<string>('RECAPTCHA_SECRET_KEY');

    if (!enabled || !secretKey) {
      return true; // If captcha is disabled, consider it verified
    }

    try {
      const response = await fetch(
        'https://www.google.com/recaptcha/api/siteverify',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            secret: secretKey,
            response: token,
          }),
        },
      );

      const result = await response.json();
      return result.success === true;
    } catch (error) {
      this.logger.error('Failed to verify captcha:', error);
      return false;
    }
  }

  /**
   * Get user approval requirement from environment variables
   */
  getUserApprovalRequired(): boolean {
    return this.configService
      .get<string>('USER_APPROVAL_REQUIRED', 'true')
      .toLowerCase() === 'true';
  }
}
