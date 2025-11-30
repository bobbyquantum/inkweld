import { Injectable } from '@angular/core';

/**
 * Service for managing JWT authentication tokens
 */
@Injectable({
  providedIn: 'root',
})
export class AuthTokenService {
  private readonly TOKEN_KEY = 'auth_token';

  /**
   * Store authentication token
   */
  setToken(token: string): void {
    localStorage.setItem(this.TOKEN_KEY, token);
  }

  /**
   * Retrieve authentication token
   */
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Remove authentication token
   */
  clearToken(): void {
    localStorage.removeItem(this.TOKEN_KEY);
  }

  /**
   * Check if user is authenticated (has valid token)
   */
  hasToken(): boolean {
    return this.getToken() !== null;
  }
}
