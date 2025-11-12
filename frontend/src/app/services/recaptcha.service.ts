import { inject, Injectable, Renderer2, RendererFactory2 } from '@angular/core';

interface ReCaptchaV2 {
  render(element: HTMLElement | string, options: ReCaptchaV2Options): number;
  execute(widgetId?: number): Promise<void>;
  getResponse(widgetId?: number): string;
  reset(widgetId?: number): void;
}

interface ReCaptchaV2Options {
  sitekey: string;
  callback?: (token: string) => void;
  theme?: 'light' | 'dark';
  size?: 'compact' | 'normal';
}

declare global {
  interface Window {
    grecaptcha: ReCaptchaV2;
  }
}

@Injectable({
  providedIn: 'root',
})
export class RecaptchaService {
  private rendererFactory = inject(RendererFactory2);

  private renderer: Renderer2;
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor() {
    this.renderer = this.rendererFactory.createRenderer(null, null);
  }

  /**
   * Load the Google reCAPTCHA script if not already loaded
   */
  loadRecaptcha(): Promise<void> {
    console.log(
      '[RecaptchaService] loadRecaptcha called, isLoaded:',
      this.isLoaded
    );

    if (this.isLoaded) {
      console.log('[RecaptchaService] reCAPTCHA already loaded');
      return Promise.resolve();
    }

    if (this.loadPromise) {
      console.log('[RecaptchaService] reCAPTCHA load already in progress');
      return this.loadPromise;
    }

    console.log('[RecaptchaService] Starting to load reCAPTCHA script...');
    this.loadPromise = new Promise((resolve, reject) => {
      // Check if script is already loaded
      if (typeof window !== 'undefined' && window.grecaptcha) {
        console.log('[RecaptchaService] window.grecaptcha already exists');
        this.isLoaded = true;
        resolve();
        return;
      }

      // Create script element
      const script = this.renderer.createElement('script') as HTMLScriptElement;
      script.src = 'https://www.google.com/recaptcha/api.js';
      script.async = true;
      script.defer = true;

      script.onload = () => {
        console.log('[RecaptchaService] reCAPTCHA script loaded successfully');
        this.isLoaded = true;
        resolve();
      };

      script.onerror = () => {
        console.error('[RecaptchaService] Failed to load reCAPTCHA script');
        reject(new Error('Failed to load reCAPTCHA script'));
      };

      // Append to head
      const head = document.getElementsByTagName('head')[0];
      this.renderer.appendChild(head, script);
      console.log('[RecaptchaService] reCAPTCHA script element added to DOM');
    });

    return this.loadPromise;
  }

  /**
   * Wait for grecaptcha.render to be available
   */
  private waitForGrecaptchaRender(): Promise<void> {
    return new Promise((resolve, reject) => {
      const maxAttempts = 50; // Wait up to 5 seconds
      let attempts = 0;

      const checkForRender = () => {
        attempts++;

        if (
          typeof window !== 'undefined' &&
          window.grecaptcha &&
          typeof window.grecaptcha.render === 'function'
        ) {
          console.log('[RecaptchaService] grecaptcha.render is now available');
          resolve();
          return;
        }

        if (attempts >= maxAttempts) {
          console.error(
            '[RecaptchaService] Timeout waiting for grecaptcha.render to be available'
          );
          reject(new Error('Timeout waiting for grecaptcha.render'));
          return;
        }

        console.log(
          `[RecaptchaService] Waiting for grecaptcha.render... attempt ${attempts}/${maxAttempts}`
        );
        setTimeout(checkForRender, 100);
      };

      checkForRender();
    });
  }

  /**
   * Render reCAPTCHA widget
   */
  async render(
    element: HTMLElement,
    siteKey: string,
    callback?: (token: string) => void
  ): Promise<number> {
    console.log('[RecaptchaService] render called with siteKey:', siteKey);
    console.log('[RecaptchaService] element:', element);

    await this.loadRecaptcha();

    if (!window.grecaptcha) {
      console.error(
        '[RecaptchaService] window.grecaptcha not available after loading'
      );
      throw new Error('reCAPTCHA not loaded');
    }

    // Wait for grecaptcha.render to be available
    await this.waitForGrecaptchaRender();

    console.log('[RecaptchaService] Calling window.grecaptcha.render...');
    const widgetId = window.grecaptcha.render(element, {
      sitekey: siteKey,
      callback: callback,
    });

    console.log(
      '[RecaptchaService] reCAPTCHA widget rendered with ID:',
      widgetId
    );
    return widgetId;
  }

  /**
   * Execute reCAPTCHA (for invisible reCAPTCHA)
   */
  async execute(widgetId?: number): Promise<void> {
    if (!window.grecaptcha) {
      throw new Error('reCAPTCHA not loaded');
    }

    return window.grecaptcha.execute(widgetId);
  }

  /**
   * Get response token from reCAPTCHA
   */
  getResponse(widgetId?: number): string {
    if (!window.grecaptcha) {
      return '';
    }

    return window.grecaptcha.getResponse(widgetId);
  }

  /**
   * Reset reCAPTCHA widget
   */
  reset(widgetId?: number): void {
    if (!window.grecaptcha) {
      return;
    }

    window.grecaptcha.reset(widgetId);
  }
}
