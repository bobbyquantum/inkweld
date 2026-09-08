import { Injectable } from '@angular/core';
import { type CloudProvider } from '@services/core/storage-context.service';

/** Stored OAuth tokens for one provider account */
export interface CloudTokenSet {
  provider: CloudProvider;
  accountId: string;
  accessToken: string;
  /** Present for providers that issue refresh tokens to PKCE clients */
  refreshToken?: string;
  /** Epoch milliseconds when the access token expires */
  expiresAt: number;
}

const STORAGE_PREFIX = 'inkweld-cloud-token:';

/**
 * Persists provider OAuth tokens in localStorage, keyed by storage config id
 * so each connected account keeps its own credentials.
 *
 * Tokens are scoped to the app folder only (Dropbox "App folder" access,
 * Google `drive.file`), so a leaked token exposes Inkweld's own files and
 * nothing else in the user's account.
 */
@Injectable({
  providedIn: 'root',
})
export class CloudTokenStoreService {
  get(configId: string): CloudTokenSet | null {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + configId);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<CloudTokenSet>;
      if (
        typeof parsed.accessToken !== 'string' ||
        typeof parsed.accountId !== 'string' ||
        typeof parsed.provider !== 'string' ||
        typeof parsed.expiresAt !== 'number'
      ) {
        return null;
      }
      return parsed as CloudTokenSet;
    } catch {
      return null;
    }
  }

  set(configId: string, tokens: CloudTokenSet): void {
    localStorage.setItem(STORAGE_PREFIX + configId, JSON.stringify(tokens));
  }

  clear(configId: string): void {
    localStorage.removeItem(STORAGE_PREFIX + configId);
  }

  has(configId: string): boolean {
    return this.get(configId) !== null;
  }

  /** True when the access token is missing or expires within `skewMs` */
  isExpired(tokens: CloudTokenSet, skewMs = 60_000): boolean {
    return tokens.expiresAt - skewMs <= Date.now();
  }
}
