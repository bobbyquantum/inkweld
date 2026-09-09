import { inject, Injectable } from '@angular/core';
import {
  CLOUD_MANIFEST_PATH,
  type CloudManifest,
  type CloudManifestProfile,
  createCloudManifest,
  findManifestProfile,
  manifestProjectsFor,
  parseCloudManifest,
  withManifestProfile,
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
  NEVER_EXPIRES,
} from './cloud-token-store.service';
import {
  buildDropboxAuthorizeUrl,
  exchangeDropboxCode,
  getDropboxCurrentAccount,
  refreshDropboxToken,
} from './dropbox/dropbox-api';
import { DropboxRemoteStore } from './dropbox/dropbox-remote-store';
import {
  NextcloudRemoteStore,
  NextcloudUnreachableError,
} from './nextcloud/nextcloud-remote-store';
import {
  type NextcloudCredentials,
  normalizeNextcloudServerUrl,
} from './nextcloud/webdav-api';
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './pkce';
import {
  RemoteAuthError,
  RemoteConflictError,
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
  /**
   * Author profiles already syncing through this account, with their live
   * project slugs, when the account holds an Inkweld folder. Empty for a
   * fresh account.
   */
  existingProfiles?: {
    name: string;
    username: string;
    slugs: string[];
  }[];
}

/** Result of completing a connect flow */
export type CloudCallbackResult =
  | {
      /** The account already has authors; the user picks one or adds one */
      kind: 'choose-profile';
      pending: PendingCloudConnection;
    }
  | {
      /** Fresh account: the user names the first profile */
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
 * Nextcloud has no OAuth step: `connectNextcloud` takes a server address and
 * an app password and joins the flow at step 2.
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
    assertOAuthProvider(provider);
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

    return this.adoptOrRequestProfile(provider, configId, account);
  }

  /**
   * Connect a self-hosted Nextcloud with a server address, login name and a
   * dedicated app password. Verifies access first so a wrong password or a
   * server without CORS headers fails here with a specific message instead
   * of as a vague sync error later.
   */
  async connectNextcloud(input: {
    serverUrl: string;
    loginName: string;
    appPassword: string;
  }): Promise<CloudCallbackResult> {
    const loginName = input.loginName.trim();
    const appPassword = input.appPassword.trim();
    if (!loginName) throw new Error('Enter your Nextcloud username');
    if (!appPassword) throw new Error('Enter a Nextcloud app password');
    const serverUrl = normalizeNextcloudServerUrl(input.serverUrl);
    const creds: NextcloudCredentials = { serverUrl, loginName, appPassword };

    const probe = new NextcloudRemoteStore(() => Promise.resolve(creds));
    try {
      await probe.checkAccess();
    } catch (error) {
      if (error instanceof NextcloudUnreachableError) {
        throw new Error(
          `Could not reach ${new URL(serverUrl).host}. Check the address, and make sure the server allows Inkweld to connect (see the Nextcloud setup guide).`,
          { cause: error }
        );
      }
      if (error instanceof RemoteAuthError) {
        throw new Error(
          'Nextcloud rejected the username or app password. Create a new app password under Settings, Security and try again.',
          { cause: error }
        );
      }
      throw error;
    }

    const accountId = `${serverUrl}#${loginName}`;
    const host = new URL(serverUrl).host;
    const configId = buildCloudConfigId('nextcloud', accountId);
    this.tokens.set(configId, {
      provider: 'nextcloud',
      accountId,
      accessToken: appPassword,
      expiresAt: NEVER_EXPIRES,
      serverUrl,
      loginName,
    });

    return this.adoptOrRequestProfile('nextcloud', configId, {
      id: accountId,
      label: `${loginName} on ${host}`,
      displayName: loginName,
    });
  }

  /**
   * Shared tail of every connect flow. Nothing is configured yet: the caller
   * either offers the authors already in the folder (or a new one), or
   * collects the first profile for a fresh account.
   */
  private async adoptOrRequestProfile(
    provider: CloudProvider,
    configId: string,
    account: { id: string; label: string; displayName: string }
  ): Promise<CloudCallbackResult> {
    const store = this.createStore(provider, configId);
    const manifest = await this.readManifest(store);

    const pendingConnection: PendingCloudConnection = {
      provider,
      accountId: account.id,
      accountLabel: account.label,
      suggestedName: account.displayName,
      suggestedUsername: suggestUsername(account.displayName, account.label),
      existingProfiles: manifest
        ? manifest.profiles.map(p => ({
            name: p.name,
            username: p.username,
            slugs: manifestProjectsFor(manifest, p.username).map(e => e.slug),
          }))
        : undefined,
    };
    sessionStorage.setItem(
      PENDING_CONNECTION_KEY,
      JSON.stringify(pendingConnection)
    );
    if (manifest) {
      this.logger.info(
        'CloudSync',
        `Connected ${provider} account with ${manifest.profiles.length} existing profile(s)`
      );
      return { kind: 'choose-profile', pending: pendingConnection };
    }
    return { kind: 'needs-profile', pending: pendingConnection };
  }

  /**
   * Continue as an author who already syncs through this account. Creates
   * (or finds) the local profile for that username, shares the account's
   * credentials with it, and switches to it.
   */
  adoptExistingProfile(
    pending: PendingCloudConnection,
    profile: CloudManifestProfile
  ): ServerConfig {
    const config = this.setupService.configureCloudMode({
      provider: pending.provider,
      accountId: pending.accountId,
      accountLabel: pending.accountLabel,
      userProfile: { name: profile.name, username: profile.username },
    });
    this.shareAccountTokens(pending, config.id);
    this.clearPendingConnection();
    this.logger.info(
      'CloudSync',
      `Continuing as @${profile.username} on ${pending.provider}`
    );
    return config;
  }

  /**
   * Provider credentials are stored per profile id. They are obtained once
   * per account (under the account's base id), so every further author on
   * that account gets a copy.
   */
  private shareAccountTokens(
    pending: PendingCloudConnection,
    configId: string
  ): void {
    const baseId = buildCloudConfigId(pending.provider, pending.accountId);
    if (baseId === configId) return;
    const tokens = this.tokens.get(baseId);
    if (tokens && !this.tokens.has(configId)) this.tokens.set(configId, tokens);
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
   * Add an author to the account: write the manifest (created fresh, or with
   * the new profile appended to the existing list) and configure the app for
   * that profile.
   */
  async finishNewConnection(
    pending: PendingCloudConnection,
    profile: { name: string; username: string }
  ): Promise<ServerConfig> {
    const baseId = buildCloudConfigId(pending.provider, pending.accountId);
    const store = this.createStore(pending.provider, baseId);
    await this.registerProfileInManifest(store, pending, profile);

    const config = this.setupService.configureCloudMode({
      provider: pending.provider,
      accountId: pending.accountId,
      accountLabel: pending.accountLabel,
      userProfile: profile,
    });
    this.shareAccountTokens(pending, config.id);
    this.clearPendingConnection();
    this.logger.info(
      'CloudSync',
      `Registered @${profile.username} and configured ${pending.provider} cloud sync`
    );
    return config;
  }

  /** Create the manifest or append the profile, with one retry on a race */
  private async registerProfileInManifest(
    store: RemoteStore,
    pending: PendingCloudConnection,
    profile: CloudManifestProfile
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let version: string | undefined;
      let manifest: CloudManifest;
      try {
        const file = await store.get(CLOUD_MANIFEST_PATH);
        version = file.version;
        const parsed = parseCloudManifest(
          new TextDecoder().decode(file.content)
        );
        manifest = parsed
          ? withManifestProfile(parsed, profile)
          : createCloudManifest(
              { provider: pending.provider, accountId: pending.accountId },
              profile
            );
      } catch (error) {
        if (!(error instanceof RemoteFileNotFoundError)) throw error;
        manifest = createCloudManifest(
          { provider: pending.provider, accountId: pending.accountId },
          profile
        );
      }
      if (findManifestProfile(manifest, profile.username) === undefined) {
        manifest = withManifestProfile(manifest, profile);
      }
      try {
        await store.put(
          CLOUD_MANIFEST_PATH,
          JSON.stringify(manifest, null, 2),
          version ? { ifVersion: version } : undefined
        );
        return;
      } catch (error) {
        if (!(error instanceof RemoteConflictError)) throw error;
      }
    }
    throw new Error('Could not update the cloud manifest; please try again');
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
      case 'nextcloud':
        return new NextcloudRemoteStore(() =>
          this.getNextcloudCredentials(configId)
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

  private getNextcloudCredentials(
    configId: string
  ): Promise<NextcloudCredentials> {
    const tokens = this.tokens.get(configId);
    if (!tokens?.serverUrl || !tokens.loginName) {
      return Promise.reject(new RemoteAuthError('Nextcloud is not connected'));
    }
    return Promise.resolve({
      serverUrl: tokens.serverUrl,
      loginName: tokens.loginName,
      appPassword: tokens.accessToken,
    });
  }

  private buildAuthorizeUrl(
    provider: CloudProvider,
    params: {
      appKey: string;
      redirectUri: string;
      codeChallenge: string;
      state: string;
    }
  ): string {
    assertOAuthProvider(provider);
    return buildDropboxAuthorizeUrl(params);
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
    assertOAuthProvider(provider);
    const response = await exchangeDropboxCode(params);
    return {
      provider,
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
    };
  }

  private async describeAccount(
    provider: CloudProvider,
    accessToken: string
  ): Promise<{ id: string; label: string; displayName: string }> {
    assertOAuthProvider(provider);
    const account = await getDropboxCurrentAccount(accessToken);
    return {
      id: account.account_id,
      label: account.email,
      displayName: account.name.display_name,
    };
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

    if (provider !== 'dropbox') throw new RemoteAuthError();
    const response = await refreshDropboxToken({
      appKey: this.config.getAppKey(provider),
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
 * Dropbox is the only OAuth provider today. Each OAuth-specific step calls
 * this first so a provider that connects differently (Nextcloud) or has no
 * adapter yet fails with one clear message; when the next OAuth adapter lands
 * these become dispatch points.
 */
function assertOAuthProvider(
  provider: CloudProvider
): asserts provider is 'dropbox' {
  if (provider === 'nextcloud') {
    throw new Error(
      'Nextcloud connects with a server address and app password, not a sign-in redirect'
    );
  }
  if (provider !== 'dropbox') {
    throw new Error(
      `${getCloudProviderDisplayName(provider)} is not supported yet`
    );
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
