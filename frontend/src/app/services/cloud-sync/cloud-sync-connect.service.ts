import { inject, Injectable } from '@angular/core';
import {
  CLOUD_MANIFEST_PATH,
  type CloudManifest,
  createCloudManifest,
  parseCloudManifest,
} from '@models/cloud-manifest';
import { LoggerService } from '@services/core/logger.service';
import { SetupService } from '@services/core/setup.service';
import {
  buildCloudConfigId,
  type CloudProvider,
  getCloudProviderDisplayName,
  type ServerConfig,
} from '@services/core/storage-context.service';

import { CloudSyncConfigService } from './cloud-sync-config.service';
import {
  type CloudTokenSet,
  CloudTokenStoreService,
} from './cloud-token-store.service';
import {
  buildDropboxAuthorizeUrl,
  exchangeDropboxCode,
  getDropboxCurrentAccount,
  refreshDropboxToken,
} from './dropbox/dropbox-api';
import { DropboxRemoteStore } from './dropbox/dropbox-remote-store';
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce';
import {
  RemoteAuthError,
  RemoteFileNotFoundError,
  type RemoteStore,
} from './remote-store.interface';

/** sessionStorage key for the in-flight PKCE handshake */
const PENDING_AUTH_KEY = 'inkweld-cloud-sync-pending-auth';

/** sessionStorage key for a connected account awaiting profile setup */
const PENDING_CONNECTION_KEY = 'inkweld-cloud-sync-pending-connection';

interface PendingAuth {
  provider: CloudProvider;
  codeVerifier: string;
  state: string;
  redirectUri: string;
  startedAt: number;
}

/**
 * A provider account that has completed OAuth but does not yet have a
 * manifest, so the user still has to pick a profile before we can configure
 * the app. Survives the redirect back to the setup page via sessionStorage.
 */
export interface PendingCloudConnection {
  provider: CloudProvider;
  accountId: string;
  accountLabel: string;
  /** Suggested profile values from the provider account */
  suggestedName: string;
  suggestedUsername: string;
}

/** Result of completing the OAuth redirect */
export type CloudCallbackResult =
  | {
      kind: 'configured';
      config: ServerConfig;
      manifest: CloudManifest;
    }
  | {
      kind: 'needs-profile';
      pending: PendingCloudConnection;
    };

/** Where a provider must redirect back to. Must match the registered URI exactly. */
export function buildCloudCallbackRedirectUri(provider: CloudProvider): string {
  return `${globalThis.location.origin}/cloud-sync/callback/${provider}`;
}

/**
 * Drives connecting a cloud provider account to Inkweld:
 *
 * 1. `beginAuthorization` starts PKCE and redirects to the provider
 * 2. `completeAuthorization` runs on the callback route: exchanges the code,
 *    identifies the account, and looks for an existing manifest
 * 3. Either the manifest's profile is adopted and the app is configured, or
 *    the caller collects a profile and calls `finishNewConnection`
 *
 * Also hands out an authenticated {@link RemoteStore} for a configured cloud
 * profile, refreshing tokens as needed.
 */
@Injectable({
  providedIn: 'root',
})
export class CloudSyncConnectService {
  private readonly config = inject(CloudSyncConfigService);
  private readonly tokens = inject(CloudTokenStoreService);
  private readonly setupService = inject(SetupService);
  private readonly logger = inject(LoggerService);

  /** Start the OAuth flow. Navigates away; nothing runs after this resolves. */
  async beginAuthorization(provider: CloudProvider): Promise<void> {
    const appKey = this.config.getAppKey(provider);
    if (!appKey) {
      throw new Error(
        `${getCloudProviderDisplayName(provider)} is not configured for this build`
      );
    }
    const codeVerifier = generateCodeVerifier();
    const state = generateState();
    const redirectUri = buildCloudCallbackRedirectUri(provider);
    const pending: PendingAuth = {
      provider,
      codeVerifier,
      state,
      redirectUri,
      startedAt: Date.now(),
    };
    sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(pending));

    const codeChallenge = await computeCodeChallenge(codeVerifier);
    const url = this.buildAuthorizeUrl(provider, {
      appKey,
      redirectUri,
      codeChallenge,
      state,
    });
    this.logger.info(
      'CloudSync',
      `Redirecting to ${provider} for authorization`
    );
    globalThis.location.assign(url);
  }

  /**
   * Handle the provider redirect. Validates state, exchanges the code, and
   * decides whether the account already has an Inkweld folder.
   */
  async completeAuthorization(
    provider: CloudProvider,
    code: string,
    state: string
  ): Promise<CloudCallbackResult> {
    const pending = this.takePendingAuth();
    if (pending?.provider !== provider) {
      throw new Error('No authorization in progress. Please start again.');
    }
    if (pending.state !== state) {
      throw new Error('Authorization state mismatch. Please start again.');
    }

    const appKey = this.config.getAppKey(provider);
    const tokenSet = await this.exchangeCode(provider, {
      appKey,
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    });

    const account = await this.describeAccount(provider, tokenSet.accessToken);
    const accountTokens: CloudTokenSet = { ...tokenSet, accountId: account.id };
    const configId = buildCloudConfigId(provider, account.id);
    this.tokens.set(configId, accountTokens);

    const store = this.createStore(provider, configId);
    const manifest = await this.readManifest(store);

    if (manifest) {
      // Second device: the folder is the account. Adopt its profile.
      const config = this.setupService.configureCloudMode({
        provider,
        accountId: account.id,
        accountLabel: account.label,
        userProfile: { ...manifest.profile },
      });
      this.logger.info(
        'CloudSync',
        `Connected ${provider} account with existing manifest (${manifest.projects.length} projects)`
      );
      return { kind: 'configured', config, manifest };
    }

    const pendingConnection: PendingCloudConnection = {
      provider,
      accountId: account.id,
      accountLabel: account.label,
      suggestedName: account.displayName,
      suggestedUsername: suggestUsername(account.displayName, account.label),
    };
    sessionStorage.setItem(
      PENDING_CONNECTION_KEY,
      JSON.stringify(pendingConnection)
    );
    return { kind: 'needs-profile', pending: pendingConnection };
  }

  /** The account awaiting profile setup, if the user is mid-flow */
  getPendingConnection(): PendingCloudConnection | null {
    try {
      const raw = sessionStorage.getItem(PENDING_CONNECTION_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as PendingCloudConnection;
    } catch {
      return null;
    }
  }

  /** Abandon a pending connection (user went back) */
  clearPendingConnection(): void {
    sessionStorage.removeItem(PENDING_CONNECTION_KEY);
  }

  /**
   * First device: write the manifest with the chosen profile and configure
   * the app for cloud sync mode.
   */
  async finishNewConnection(
    pending: PendingCloudConnection,
    profile: { name: string; username: string }
  ): Promise<ServerConfig> {
    const configId = buildCloudConfigId(pending.provider, pending.accountId);
    const store = this.createStore(pending.provider, configId);
    const manifest = createCloudManifest(
      { provider: pending.provider, accountId: pending.accountId },
      profile
    );
    await store.put(CLOUD_MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    const config = this.setupService.configureCloudMode({
      provider: pending.provider,
      accountId: pending.accountId,
      accountLabel: pending.accountLabel,
      userProfile: profile,
    });
    this.clearPendingConnection();
    this.logger.info(
      'CloudSync',
      `Created manifest and configured ${pending.provider} cloud sync`
    );
    return config;
  }

  /** Whether a cloud config still has usable credentials */
  hasCredentials(configId: string): boolean {
    return this.tokens.has(configId);
  }

  /** Forget credentials for a config (disconnect) */
  disconnect(configId: string): void {
    this.tokens.clear(configId);
  }

  /** Authenticated store for a cloud config. Tokens refresh on demand. */
  createStore(provider: CloudProvider, configId: string): RemoteStore {
    switch (provider) {
      case 'dropbox':
        return new DropboxRemoteStore(() =>
          this.getValidAccessToken(provider, configId)
        );
      default:
        throw new Error(
          `${getCloudProviderDisplayName(provider)} is not supported yet`
        );
    }
  }

  /** Read the manifest, treating "missing" and "unreadable" as null */
  async readManifest(store: RemoteStore): Promise<CloudManifest | null> {
    try {
      const file = await store.get(CLOUD_MANIFEST_PATH);
      const text = new TextDecoder().decode(file.content);
      const manifest = parseCloudManifest(text);
      if (!manifest) {
        this.logger.warn(
          'CloudSync',
          'Manifest exists but could not be parsed; treating as absent'
        );
      }
      return manifest;
    } catch (error) {
      if (error instanceof RemoteFileNotFoundError) return null;
      throw error;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Provider-specific pieces. Add a case per provider as adapters land.
  // ───────────────────────────────────────────────────────────────────────────

  private buildAuthorizeUrl(
    provider: CloudProvider,
    params: {
      appKey: string;
      redirectUri: string;
      codeChallenge: string;
      state: string;
    }
  ): string {
    switch (provider) {
      case 'dropbox':
        return buildDropboxAuthorizeUrl(params);
      default:
        throw new Error(
          `${getCloudProviderDisplayName(provider)} is not supported yet`
        );
    }
  }

  private async exchangeCode(
    provider: CloudProvider,
    params: {
      appKey: string;
      code: string;
      codeVerifier: string;
      redirectUri: string;
    }
  ): Promise<Omit<CloudTokenSet, 'accountId'>> {
    switch (provider) {
      case 'dropbox': {
        const response = await exchangeDropboxCode(params);
        return {
          provider,
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
          expiresAt: Date.now() + response.expires_in * 1000,
        };
      }
      default:
        throw new Error(
          `${getCloudProviderDisplayName(provider)} is not supported yet`
        );
    }
  }

  private async describeAccount(
    provider: CloudProvider,
    accessToken: string
  ): Promise<{ id: string; label: string; displayName: string }> {
    switch (provider) {
      case 'dropbox': {
        const account = await getDropboxCurrentAccount(accessToken);
        return {
          id: account.account_id,
          label: account.email,
          displayName: account.name.display_name,
        };
      }
      default:
        throw new Error(
          `${getCloudProviderDisplayName(provider)} is not supported yet`
        );
    }
  }

  private async getValidAccessToken(
    provider: CloudProvider,
    configId: string
  ): Promise<string> {
    const tokens = this.tokens.get(configId);
    if (!tokens) throw new RemoteAuthError('Cloud storage is not connected');
    if (!this.tokens.isExpired(tokens)) return tokens.accessToken;
    if (!tokens.refreshToken) {
      throw new RemoteAuthError();
    }

    switch (provider) {
      case 'dropbox': {
        const appKey = this.config.getAppKey(provider);
        const response = await refreshDropboxToken({
          appKey,
          refreshToken: tokens.refreshToken,
        });
        const refreshed: CloudTokenSet = {
          ...tokens,
          accessToken: response.access_token,
          expiresAt: Date.now() + response.expires_in * 1000,
        };
        this.tokens.set(configId, refreshed);
        return refreshed.accessToken;
      }
      default:
        throw new RemoteAuthError();
    }
  }

  private takePendingAuth(): PendingAuth | null {
    try {
      const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
      sessionStorage.removeItem(PENDING_AUTH_KEY);
      if (!raw) return null;
      const pending = JSON.parse(raw) as PendingAuth;
      // Ten minutes is plenty for a consent screen; anything older is stale.
      if (Date.now() - pending.startedAt > 10 * 60 * 1000) return null;
      return pending;
    } catch {
      return null;
    }
  }
}

/**
 * Derive a URL-safe username suggestion from what the provider tells us.
 * Falls back to the email local-part, then a generic default.
 */
export function suggestUsername(displayName: string, email: string): string {
  const fromName = slugifyUsername(displayName);
  if (fromName.length >= 3) return fromName;
  const fromEmail = slugifyUsername(email.split('@')[0] ?? '');
  if (fromEmail.length >= 3) return fromEmail;
  return 'writer';
}

function slugifyUsername(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .join('-')
    .slice(0, 32);
}
