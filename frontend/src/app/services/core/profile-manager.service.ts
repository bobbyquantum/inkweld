import { computed, inject, Injectable } from '@angular/core';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { CloudTokenStoreService } from '@services/cloud-sync/cloud-token-store.service';

import { LoggerService } from './logger.service';
import { SetupService } from './setup.service';
import {
  type ContextDataSummary,
  getCloudProviderDisplayName,
  getLocalConfigDisplayName,
  type MigrationRecord,
  type ServerConfig,
  StorageContextService,
} from './storage-context.service';

/** Where the app should go after a profile change */
export type ProfileDestination = 'home' | 'welcome';

/**
 * sessionStorage key remembering which profile is being upgraded while the
 * user walks through the welcome screen (and, for Dropbox, the OAuth
 * redirect). Consumed when the new profile is created.
 */
export const PROFILE_UPGRADE_SOURCE_KEY = 'inkweld-profile-upgrade-source';

export function setProfileUpgradeSource(configId: string): void {
  try {
    sessionStorage.setItem(PROFILE_UPGRADE_SOURCE_KEY, configId);
  } catch {
    // Session storage unavailable: the upgrade degrades to a plain add
  }
}

export function peekProfileUpgradeSource(): string | null {
  try {
    return sessionStorage.getItem(PROFILE_UPGRADE_SOURCE_KEY);
  } catch {
    return null;
  }
}

export function takeProfileUpgradeSource(): string | null {
  const value = peekProfileUpgradeSource();
  try {
    sessionStorage.removeItem(PROFILE_UPGRADE_SOURCE_KEY);
  } catch {
    // ignore
  }
  return value;
}

/**
 * A profile: one author identity on one backend (Browser, a cloud account, or
 * an Inkweld server login), plus everything the UI needs to present it.
 */
export interface ProfileInfo {
  config: ServerConfig;
  /** Short kind label: Browser, Cloud Sync, Inkweld server */
  kind: 'local' | 'cloud' | 'server';
  name: string;
  subtitle: string;
  icon: string;
  isActive: boolean;
  /** Server: has a login token. Cloud: has provider credentials. Local: always */
  hasCredentials: boolean;
  /** The server this build ships with; re-created on load so cannot be removed */
  isBuiltIn: boolean;
  /** One-line history note, e.g. "Projects moved to Ink as @bobby" */
  history?: string;
}

/** Translation key explaining what removing a profile of this kind deletes */
export function profileRemovalMessageKey(kind: ProfileInfo['kind']): string {
  const keys: Record<ProfileInfo['kind'], string> = {
    local: 'dialogs.profileManager.disconnectLocalMessage',
    cloud: 'dialogs.profileManager.disconnectCloudMessage',
    server: 'dialogs.profileManager.disconnectServerMessage',
  };
  return keys[kind];
}

/** Result of a storage scan: what each profile holds, plus leftovers */
export interface StorageScan {
  connections: { info: ProfileInfo; data: ContextDataSummary }[];
  orphans: ContextDataSummary[];
  /** Browser-reported usage/quota for this origin, when available */
  estimate?: { usageBytes: number; quotaBytes: number };
}

/**
 * One coherent place for everything the user can do with profiles: switch,
 * remove, reset, and see what each one stores on this device. The dialogs and
 * menus are thin views over this service.
 *
 * Terminology: a "profile" is what `StorageContextService` calls a
 * configuration: one author identity on one backend, with its own isolated
 * storage prefix. There can be any number of Browser profiles (one per
 * username), cloud profiles (one per account) and server profiles (one per
 * server login).
 */
@Injectable({
  providedIn: 'root',
})
export class ProfileManagerService {
  private readonly storageContext = inject(StorageContextService);
  private readonly setupService = inject(SetupService);
  private readonly authTokens = inject(AuthTokenService);
  private readonly cloudTokens = inject(CloudTokenStoreService);
  private readonly logger = inject(LoggerService);

  /** All profiles, active first, then most recently used */
  readonly connections = computed<ProfileInfo[]>(() => {
    const active = this.storageContext.activeConfig();
    return [...this.storageContext.configurations()]
      .sort((a, b) => {
        if (a.id === active?.id) return -1;
        if (b.id === active?.id) return 1;
        return (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
      })
      .map(config => this.describe(config, active?.id));
  });

  readonly activeConnection = computed<ProfileInfo | null>(
    () => this.connections().find(c => c.isActive) ?? null
  );

  /** Presentation details for one configuration */
  describe(config: ServerConfig, activeId?: string | null): ProfileInfo {
    const isActive =
      config.id === (activeId ?? this.storageContext.activeConfig()?.id);
    const history = describeHistory(config);
    switch (config.type) {
      case 'local':
        return {
          config,
          kind: 'local',
          // The author is the identity; "Browser" is where it lives
          name: config.userProfile?.name ?? getLocalConfigDisplayName(config),
          subtitle: config.userProfile?.username
            ? `@${config.userProfile.username} · this browser only`
            : 'This browser only',
          icon: 'computer',
          isActive,
          hasCredentials: true,
          isBuiltIn: false,
          history,
        };
      case 'cloud': {
        const provider = config.cloudProvider
          ? getCloudProviderDisplayName(config.cloudProvider)
          : 'Cloud Sync';
        return {
          config,
          kind: 'cloud',
          name: config.userProfile?.name ?? config.displayName ?? provider,
          subtitle: [
            config.userProfile?.username
              ? `@${config.userProfile.username}`
              : null,
            provider,
            config.cloudAccountLabel ?? null,
          ]
            .filter(Boolean)
            .join(' · '),
          icon: 'cloud_sync',
          isActive,
          hasCredentials: this.cloudTokens.has(config.id),
          isBuiltIn: false,
          history,
        };
      }
      default: {
        let host = config.serverUrl ?? '';
        try {
          host = new URL(config.serverUrl ?? '').host;
        } catch {
          // keep raw
        }
        const serverName = config.displayName ?? host;
        return {
          config,
          kind: 'server',
          name: config.userProfile?.name ?? serverName,
          subtitle: config.userProfile?.username
            ? `@${config.userProfile.username} · ${serverName}`
            : `${serverName} · not logged in`,
          icon: 'dns',
          isActive,
          hasCredentials: this.authTokens.hasTokenForConfig(config.id),
          isBuiltIn: this.setupService.isHostedServerConfig(config),
          history,
        };
      }
    }
  }

  /**
   * Make a profile active. Returns where the caller should navigate; the
   * caller performs a full page load because every service holds handles
   * into the previous context's storage.
   */
  switchTo(configId: string): ProfileDestination {
    this.storageContext.switchToConfig(configId);
    return 'home';
  }

  /**
   * Remove a profile and everything it stored on this device. Remote data
   * (the Inkweld server, the cloud folder) is never touched.
   *
   * If the active profile is removed, the most recently used remaining
   * profile becomes active and the caller should go home; with nothing left
   * the caller should show the welcome screen.
   */
  async disconnect(configId: string): Promise<ProfileDestination> {
    const config = this.storageContext.getConfigById(configId);
    if (!config) return this.storageContext.isConfigured() ? 'home' : 'welcome';
    const wasActive = this.storageContext.activeConfig()?.id === configId;

    // Credentials first so a failed data wipe never leaves a usable token
    this.authTokens.clearTokenForConfig(configId);
    this.cloudTokens.clear(configId);
    await this.storageContext.clearContextData(configId);
    this.storageContext.removeConfig(configId);
    this.logger.info('Profiles', `Removed ${config.type} profile ${configId}`);

    if (!wasActive) return 'home';
    const remaining = this.storageContext.getConfigurations();
    if (remaining.length === 0) return 'welcome';
    const next = [...remaining].sort((a, b) =>
      (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '')
    )[0];
    this.storageContext.switchToConfig(next.id);
    return 'home';
  }

  /**
   * Wipe every trace of Inkweld from this browser: all profiles, all their
   * data, credentials and app-wide preferences.
   */
  async resetDevice(): Promise<ProfileDestination> {
    for (const config of this.storageContext.getConfigurations()) {
      this.authTokens.clearTokenForConfig(config.id);
      this.cloudTokens.clear(config.id);
    }
    for (const orphan of await this.storageContext.findOrphanedData()) {
      await this.storageContext.clearPrefixedData(orphan.prefix);
    }
    for (const config of this.storageContext.getConfigurations()) {
      await this.storageContext.clearContextData(config.id);
    }
    this.storageContext.clearConfig();
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Storage unavailable; the config is already gone
    }
    this.logger.info('Profiles', 'Reset this device');
    return 'welcome';
  }

  /**
   * Upgrade a Browser (or cloud) profile into a freshly created profile:
   * every project, setting and activation is copied into the new profile's
   * storage, and both profiles record the move. The source keeps working
   * until the user removes it. Returns how much was carried over.
   */
  async upgradeInto(
    sourceConfigId: string,
    targetConfigId: string,
    username?: string,
    renames: { oldSlug: string; newSlug: string }[] = []
  ): Promise<{ projectCount: number }> {
    const source = this.storageContext.getConfigById(sourceConfigId);
    const target = this.storageContext.getConfigById(targetConfigId);
    if (!source || !target || source.id === target.id) {
      return { projectCount: 0 };
    }
    const copied = await this.storageContext.cloneContextData(
      sourceConfigId,
      targetConfigId
    );
    // Projects whose address already exists in the destination were given a
    // new slug by the user; apply it to the copy only, never to the source
    const author = username ?? target.userProfile?.username;
    for (const rename of renames) {
      if (!author || rename.oldSlug === rename.newSlug) continue;
      await this.storageContext.renameProjectInContext(
        targetConfigId,
        author,
        rename.oldSlug,
        rename.newSlug
      );
    }
    // A Browser profile never records activations; the copies must be live
    // in the destination or the cards would ask to be downloaded
    await this.storageContext.activateProjectsInContext(targetConfigId);
    // The token of a server source must not travel; the new profile has its own
    this.authTokens.clearTokenForConfig(targetConfigId);
    this.storageContext.recordMigration(sourceConfigId, targetConfigId, {
      username: username ?? target.userProfile?.username,
      projectCount: copied.projectCount,
    });
    this.logger.info(
      'Profiles',
      `Upgraded ${source.type} profile ${sourceConfigId} into ${target.type} profile ${targetConfigId}: ${copied.projectCount} projects, ${copied.databases} databases, ${copied.localStorageKeys} keys`
    );
    return { projectCount: copied.projectCount };
  }

  /** What every profile, and any leftover prefix, holds on this device */
  async scanStorage(): Promise<StorageScan> {
    const connections: StorageScan['connections'] = [];
    for (const info of this.connections()) {
      connections.push({
        info,
        data: await this.storageContext.describeContextData(info.config.id),
      });
    }
    const orphans = await this.storageContext.findOrphanedData();
    let estimate: StorageScan['estimate'];
    try {
      const est = await navigator.storage?.estimate?.();
      if (est?.usage !== undefined && est.quota !== undefined) {
        estimate = { usageBytes: est.usage, quotaBytes: est.quota };
      }
    } catch {
      // Not supported; counts are still useful
    }
    return { connections, orphans, estimate };
  }

  /** Remove data left behind by a profile that no longer exists */
  async deleteOrphan(prefix: string): Promise<void> {
    await this.storageContext.clearPrefixedData(prefix);
    this.logger.info('Profiles', `Removed orphaned data under ${prefix}`);
  }
}

/** Turn the migration records into one short, human sentence */
function describeHistory(config: ServerConfig): string | undefined {
  const parts: string[] = [];
  if (config.migratedFrom) {
    parts.push(
      `${countProjects(config.migratedFrom)} moved here from ${nameOf(
        config.migratedFrom
      )}${asUser(config.migratedFrom)} on ${dateOf(config.migratedFrom)}`
    );
  }
  if (config.migratedTo) {
    parts.push(
      `${countProjects(config.migratedTo)} moved to ${nameOf(
        config.migratedTo
      )}${asUser(config.migratedTo)} on ${dateOf(config.migratedTo)}`
    );
  }
  return parts.length ? parts.join('. ') : undefined;
}

function countProjects(record: MigrationRecord): string {
  return record.projectCount === 1
    ? '1 project'
    : `${record.projectCount} projects`;
}

function nameOf(record: MigrationRecord): string {
  const name = record.displayName?.trim();
  return !name || name === 'Local Mode' ? 'Browser' : name;
}

function asUser(record: MigrationRecord): string {
  return record.username ? ` as @${record.username}` : '';
}

function dateOf(record: MigrationRecord): string {
  const ms = Date.parse(record.at);
  if (Number.isNaN(ms)) return record.at;
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
