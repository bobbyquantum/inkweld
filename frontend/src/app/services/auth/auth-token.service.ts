import { inject, Injectable } from '@angular/core';

import { StorageContextService } from '../core/storage-context.service';

/**
 * Service for managing JWT authentication tokens.
 *
 * Tokens are stored per-server using the storage context prefix.
 * This allows users to be logged into multiple servers simultaneously,
 * and automatically use the correct token when switching profiles.
 *
 * Storage key format: `{prefix}auth_token`
 * - Local mode: `local:auth_token`
 * - Server mode: `srv:{hash}:auth_token`
 */
@Injectable({
  providedIn: 'root',
})
export class AuthTokenService {
  private readonly TOKEN_KEY = 'auth_token';
  private storageContext = inject(StorageContextService);

  /**
   * Get the prefixed token key for current context
   */
  private getTokenKey(): string {
    return this.storageContext.prefixKey(this.TOKEN_KEY);
  }

  /**
   * Store authentication token for current server context
   */
  setToken(token: string): void {
    localStorage.setItem(this.getTokenKey(), token);
  }

  /**
   * Retrieve authentication token for current server context
   */
  getToken(): string | null {
    return localStorage.getItem(this.getTokenKey());
  }

  /**
   * Remove authentication token for current server context
   */
  clearToken(): void {
    localStorage.removeItem(this.getTokenKey());
  }

  /**
   * Check if user is authenticated (has valid token) in current context
   */
  hasToken(): boolean {
    return this.getToken() !== null;
  }

  /**
   * Get token for a specific configuration (used during profile switching)
   */
  getTokenForConfig(configId: string): string | null {
    const prefix = this.storageContext.getPrefixForConfig(configId);
    return localStorage.getItem(`${prefix}${this.TOKEN_KEY}`);
  }

  /**
   * Check if a specific configuration has a stored token
   */
  hasTokenForConfig(configId: string): boolean {
    return this.getTokenForConfig(configId) !== null;
  }

  /**
   * Clear token for a specific configuration
   */
  clearTokenForConfig(configId: string): void {
    const prefix = this.storageContext.getPrefixForConfig(configId);
    localStorage.removeItem(`${prefix}${this.TOKEN_KEY}`);
  }
}
