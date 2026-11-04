import { DOCUMENT, inject, Injectable } from '@angular/core';
import { appOrigin } from '@utils/app-base';
import { isUrlOnServer, serverAddress } from '@utils/server-address';

import { environment } from '../../../environments/environment';
import {
  type ServerConfig,
  StorageContextService,
} from '../core/storage-context.service';

/** The localStorage keys of one profile's token */
interface TokenKeys {
  /** The token itself */
  token: string;
  /** {@link serverAddress} of the server the token was stored for */
  server: string;
}

/**
 * Service for managing JWT authentication tokens.
 *
 * Tokens are stored per-server using the storage context prefix.
 * This allows users to be logged into multiple servers simultaneously,
 * and automatically use the correct token when switching profiles.
 *
 * Storage key format: `{prefix}auth_token`
 * - Local mode: `local:auth_token`
 * - Server mode: `srv:{configId}:auth_token`, plus the address of the
 *   profile's server in `srv:{configId}:auth_token_server`
 *
 * A token is only ever sent to the server of the profile it belongs to:
 * anything that sends it (the HTTP interceptor, `fetch` calls with an
 * `Authorization` header, WebSocket sign-in) asks {@link getTokenForUrl}
 * with the URL it is about to contact. A server profile's token is only
 * read back while the profile's server is the one it was stored for.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthTokenService {
  private readonly TOKEN_KEY = 'auth_token';
  private readonly TOKEN_SERVER_KEY = 'auth_token_server';
  private readonly storageContext = inject(StorageContextService);
  private readonly document = inject(DOCUMENT);

  /**
   * Get the prefixed token key for current context
   */
  private getTokenKey(): string {
    return this.storageContext.prefixKey(this.TOKEN_KEY);
  }

  /** The keys of the active profile's token */
  private activeKeys(): TokenKeys {
    return {
      token: this.getTokenKey(),
      server: this.storageContext.prefixKey(this.TOKEN_SERVER_KEY),
    };
  }

  /** The keys of a given profile's token */
  private keysForConfig(configId: string): TokenKeys {
    const prefix = this.storageContext.getPrefixForConfig(configId);
    return {
      token: `${prefix}${this.TOKEN_KEY}`,
      server: `${prefix}${this.TOKEN_SERVER_KEY}`,
    };
  }

  /**
   * Store authentication token for current server context
   */
  setToken(token: string): void {
    this.writeToken(
      this.activeKeys(),
      token,
      this.storageContext.getActiveConfig()
    );
  }

  /**
   * Retrieve authentication token for current server context
   */
  getToken(): string | null {
    return this.readToken(
      this.activeKeys(),
      this.storageContext.getActiveConfig()
    );
  }

  /**
   * The active profile's token, to send to `url`. Null unless `url` is on
   * the active profile's server (see {@link isActiveServerUrl}), so the
   * session never reaches another server: one being added in the profile
   * manager, another profile's server, or any third-party URL.
   */
  getTokenForUrl(url: string): string | null {
    return this.isActiveServerUrl(url) ? this.getToken() : null;
  }

  /**
   * True when `url` (absolute, or relative to the page's base URL) points
   * into the active profile's server: the same origin (`ws:` / `wss:` count
   * as `http:` / `https:`) and, when the server is served under a path
   * prefix (Home Assistant ingress, a reverse proxy), a path inside that
   * prefix. Always false for Browser and Cloud Sync profiles, which have no
   * server.
   */
  isActiveServerUrl(url: string): boolean {
    const serverUrl = this.serverUrlOf(this.storageContext.getActiveConfig());
    return !!serverUrl && isUrlOnServer(url, serverUrl, this.document.baseURI);
  }

  /**
   * URL of a server profile's server; null for other profiles. A server
   * profile without a stored address talks to what the API client falls
   * back to: the build's `apiUrl`, or without one (Docker, native binary)
   * the server that served this page, at its origin and base href.
   */
  private serverUrlOf(config: ServerConfig | null | undefined): string | null {
    if (config?.type !== 'server') return null;
    return (
      config.serverUrl || environment.apiUrl || appOrigin(this.document) || null
    );
  }

  /** {@link serverAddress} of a server profile's server; null otherwise */
  private serverAddressOf(
    config: ServerConfig | null | undefined
  ): string | null {
    const serverUrl = this.serverUrlOf(config);
    return serverUrl === null ? null : serverAddress(serverUrl);
  }

  /**
   * Read a profile's token. A server profile only gets back a token stored
   * for its own server: tabs can disagree about which server an id belongs
   * to (a tab still showing a profile that another tab removed, after the
   * id went to a new profile there). A token stored before tokens recorded
   * their server came from the profile's server, and is marked as such.
   */
  private readToken(
    keys: TokenKeys,
    config: ServerConfig | null | undefined
  ): string | null {
    const token = localStorage.getItem(keys.token);
    const address = this.serverAddressOf(config);
    if (token === null || address === null) return token;
    const storedFor = localStorage.getItem(keys.server);
    if (storedFor === null) {
      localStorage.setItem(keys.server, address);
      return token;
    }
    return storedFor === address ? token : null;
  }

  /** Store a profile's token along with the address of its server */
  private writeToken(
    keys: TokenKeys,
    token: string,
    config: ServerConfig | null | undefined
  ): void {
    this.storeToken(keys, token, this.serverAddressOf(config));
  }

  /**
   * Write a token and the address it was stored for. The old token goes
   * first and the new one is written last, so another tab reading in between
   * never finds a token next to an address it was not stored for.
   */
  private storeToken(
    keys: TokenKeys,
    token: string,
    address: string | null
  ): void {
    localStorage.removeItem(keys.token);
    if (address === null) {
      localStorage.removeItem(keys.server);
    } else {
      localStorage.setItem(keys.server, address);
    }
    localStorage.setItem(keys.token, token);
  }

  private removeToken(keys: TokenKeys): void {
    localStorage.removeItem(keys.token);
    localStorage.removeItem(keys.server);
  }

  /**
   * Remove authentication token for current server context
   */
  clearToken(): void {
    this.removeToken(this.activeKeys());
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
    return this.readToken(
      this.keysForConfig(configId),
      this.storageContext.getConfigById(configId)
    );
  }

  /**
   * Check if a specific configuration has a stored token
   */
  hasTokenForConfig(configId: string): boolean {
    return this.getTokenForConfig(configId) !== null;
  }

  /**
   * Store a token for a specific configuration (used to put back a session
   * that a sign-in on that profile replaced)
   */
  setTokenForConfig(configId: string, token: string): void {
    this.writeToken(
      this.keysForConfig(configId),
      token,
      this.storageContext.getConfigById(configId)
    );
  }

  /**
   * Clear token for a specific configuration
   */
  clearTokenForConfig(configId: string): void {
    this.removeToken(this.keysForConfig(configId));
  }

  /**
   * Carry a token from one configuration to another, e.g. when a login on a
   * shared server profile is split off into its own profile of the same
   * server. The token keeps the server it was stored for.
   */
  moveToken(fromConfigId: string, toConfigId: string): void {
    const from = this.keysForConfig(fromConfigId);
    const token = localStorage.getItem(from.token);
    const storedFor =
      localStorage.getItem(from.server) ??
      this.serverAddressOf(this.storageContext.getConfigById(fromConfigId));
    this.removeToken(from);
    if (token === null) return;
    this.storeToken(this.keysForConfig(toConfigId), token, storedFor);
  }
}
