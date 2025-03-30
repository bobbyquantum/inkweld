import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { CSRFService } from '@inkweld/index';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';

/**
 * Response type for CSRF token endpoint
 */
interface CsrfTokenResponse {
  token: string;
}

/**
 * Service responsible for CSRF token management.
 * This service handles fetching and providing CSRF tokens for API requests.
 * Uses both cookie-based tokens and stored tokens for maximum compatibility.
 */
@Injectable({
  providedIn: 'root',
})
export class XsrfService {
  private readonly csrfService = inject(CSRFService);
  private readonly document = inject(DOCUMENT);

  private csrfToken = '';
  private readonly apiUrl = environment.apiUrl || '';
  private lastRefreshTime = 0;
  private readonly tokenRefreshThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor() {
    // Try to initialize token from cookie on service creation
    this.initFromCookie();
  }

  /**
   * Fetches a new CSRF token from the server
   */
  async refreshToken(): Promise<string> {
    try {
      console.log('Refreshing CSRF token from server');

      // Use the generated CSRFService to get the token
      const response = (await firstValueFrom(
        this.csrfService.csrfControllerGetCsrfToken()
      )) as CsrfTokenResponse;

      if (!response || !response.token || typeof response.token !== 'string') {
        throw new Error('Invalid token format received from server');
      }

      this.csrfToken = response.token;
      this.lastRefreshTime = Date.now();
      console.log('Successfully refreshed CSRF token');

      return this.csrfToken;
    } catch (error) {
      console.error('Failed to fetch CSRF token:', error);

      // Try to get token from cookie as fallback
      const cookieToken = this.getTokenFromCookie();
      if (cookieToken) {
        console.log('Using CSRF token from cookie as fallback');
        this.csrfToken = cookieToken;
        return cookieToken;
      }

      return '';
    }
  }

  /**
   * Gets the current CSRF token or fetches a new one if none exists or is expired
   */
  async getToken(): Promise<string> {
    // If we have no token or it's expired, refresh it
    if (!this.csrfToken || this.isTokenExpired()) {
      return this.refreshToken();
    }
    return this.csrfToken;
  }

  /**
   * Returns the current CSRF token synchronously (may be null if not fetched yet)
   */
  getXsrfToken(): string {
    // Try to get from cookie first (double-submit cookie pattern)
    const cookieToken = this.getTokenFromCookie();
    if (cookieToken) {
      // If cookie token exists but is different from stored token, update stored token
      if (this.csrfToken !== cookieToken) {
        console.log('Updating stored token from cookie');
        this.csrfToken = cookieToken;
      }
      return cookieToken;
    }

    // Fall back to stored token
    return this.csrfToken;
  }

  /**
   * Helper method to check if token is expired
   */
  private isTokenExpired(): boolean {
    return Date.now() - this.lastRefreshTime > this.tokenRefreshThreshold;
  }

  /**
   * Helper method to get token from cookie
   */
  private getTokenFromCookie(): string {
    const value = `; ${this.document.cookie}`;
    const parts = value.split(`; XSRF-TOKEN=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || '';
    }
    return '';
  }

  /**
   * Initialize token from cookie if available
   */
  private initFromCookie(): void {
    const cookieToken = this.getTokenFromCookie();
    if (cookieToken) {
      console.log('Initialized CSRF token from cookie');
      this.csrfToken = cookieToken;
      this.lastRefreshTime = Date.now();
    }
  }
}
