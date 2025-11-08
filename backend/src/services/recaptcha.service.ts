interface RecaptchaVerifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

export class RecaptchaService {
  private readonly secretKey: string | undefined;
  private readonly enabled: boolean;

  constructor() {
    this.secretKey = process.env.RECAPTCHA_SECRET_KEY;
    this.enabled = process.env.RECAPTCHA_ENABLED?.toLowerCase() === 'true';
  }

  /**
   * Verify a reCAPTCHA token with Google's API
   */
  async verify(token: string, remoteIp?: string): Promise<boolean> {
    // Skip verification in test mode
    if (process.env.NODE_ENV === 'test') {
      return true;
    }

    // If reCAPTCHA is not enabled, always return true
    if (!this.enabled || !this.secretKey) {
      return true;
    }

    if (!token) {
      return false;
    }

    try {
      const params = new URLSearchParams({
        secret: this.secretKey,
        response: token,
        ...(remoteIp && { remoteip: remoteIp }),
      });

      const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const data = (await response.json()) as RecaptchaVerifyResponse;

      if (!data.success) {
        console.error('reCAPTCHA verification failed:', data['error-codes']);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error verifying reCAPTCHA:', error);
      return false;
    }
  }

  /**
   * Check if reCAPTCHA is enabled
   */
  isEnabled(): boolean {
    // Always disabled in test mode
    if (process.env.NODE_ENV === 'test') {
      return false;
    }
    return this.enabled && !!this.secretKey;
  }
}

// Singleton instance
export const recaptchaService = new RecaptchaService();
