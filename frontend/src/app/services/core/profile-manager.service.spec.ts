import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { CloudTokenStoreService } from '@services/cloud-sync/cloud-token-store.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from './logger.service';
import { ProfileManagerService } from './profile-manager.service';
import { SetupService } from './setup.service';
import {
  buildCloudConfigId,
  type ServerConfig,
  StorageContextService,
} from './storage-context.service';

const local: ServerConfig = {
  id: 'local',
  type: 'local',
  displayName: 'Browser',
  userProfile: { name: 'Bobby', username: 'bobby' },
  addedAt: '2026-01-01T00:00:00Z',
  lastUsedAt: '2026-01-02T00:00:00Z',
};
const server: ServerConfig = {
  id: 'abc12345',
  type: 'server',
  serverUrl: 'https://ink.example.com',
  displayName: 'Ink',
  userProfile: { name: 'Bobby', username: 'bobby' },
  addedAt: '2026-01-01T00:00:00Z',
  lastUsedAt: '2026-01-03T00:00:00Z',
};
const cloud: ServerConfig = {
  id: 'cloud-dropbox-1a2b',
  type: 'cloud',
  cloudProvider: 'dropbox',
  cloudAccountId: 'dbid:1',
  cloudAccountLabel: 'bobby@example.com',
  displayName: 'Dropbox',
  addedAt: '2026-01-01T00:00:00Z',
  lastUsedAt: '2026-01-04T00:00:00Z',
};

describe('ProfileManagerService', () => {
  let service: ProfileManagerService;
  let configs: ReturnType<typeof signal<ServerConfig[]>>;
  let active: ReturnType<typeof signal<ServerConfig | null>>;
  let storage: {
    switchToConfig: ReturnType<typeof vi.fn>;
    removeConfig: ReturnType<typeof vi.fn>;
    getConfigById: ReturnType<typeof vi.fn>;
    getConfigurations: ReturnType<typeof vi.fn>;
    isConfigured: ReturnType<typeof vi.fn>;
    clearContextData: ReturnType<typeof vi.fn>;
    describeContextData: ReturnType<typeof vi.fn>;
    findOrphanedData: ReturnType<typeof vi.fn>;
    clearPrefixedData: ReturnType<typeof vi.fn>;
    clearConfig: ReturnType<typeof vi.fn>;
    cloneContextData?: ReturnType<typeof vi.fn>;
    recordMigration?: ReturnType<typeof vi.fn>;
    renameProjectInContext?: ReturnType<typeof vi.fn>;
    activateProjectsInContext?: ReturnType<typeof vi.fn>;
  };
  let auth: {
    hasTokenForConfig: ReturnType<typeof vi.fn>;
    clearTokenForConfig: ReturnType<typeof vi.fn>;
  };
  let cloudTokens: {
    has: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
  };
  let setup: { isHostedServerConfig: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    configs = signal<ServerConfig[]>([local, server, cloud]);
    active = signal<ServerConfig | null>(cloud);
    storage = {
      switchToConfig: vi.fn((id: string) => {
        active.set(configs().find(c => c.id === id) ?? null);
      }),
      removeConfig: vi.fn((id: string) => {
        configs.set(configs().filter(c => c.id !== id));
        if (active()?.id === id) active.set(configs()[0] ?? null);
      }),
      getConfigById: vi.fn((id: string) => configs().find(c => c.id === id)),
      getConfigurations: vi.fn(() => configs()),
      isConfigured: vi.fn(() => configs().length > 0),
      clearContextData: vi.fn().mockResolvedValue(undefined),
      describeContextData: vi.fn((id: string) =>
        Promise.resolve({
          prefix: `${id}:`,
          databases: [`${id}:inkweld-media`],
          localStorageKeys: [`${id}:userSettings`],
        })
      ),
      findOrphanedData: vi.fn().mockResolvedValue([
        {
          prefix: 'srv:dead0000:',
          databases: ['srv:dead0000:x'],
          localStorageKeys: [],
        },
      ]),
      clearPrefixedData: vi.fn().mockResolvedValue(undefined),
      clearConfig: vi.fn(),
    };
    auth = {
      hasTokenForConfig: vi.fn().mockReturnValue(false),
      clearTokenForConfig: vi.fn(),
    };
    cloudTokens = { has: vi.fn().mockReturnValue(true), clear: vi.fn() };
    setup = { isHostedServerConfig: vi.fn().mockReturnValue(false) };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ProfileManagerService,
        {
          provide: StorageContextService,
          useValue: {
            ...storage,
            configurations: configs,
            activeConfig: active,
          },
        },
        { provide: AuthTokenService, useValue: auth },
        { provide: CloudTokenStoreService, useValue: cloudTokens },
        { provide: SetupService, useValue: setup },
        { provide: LoggerService, useValue: { info: vi.fn(), warn: vi.fn() } },
      ],
    });
    service = TestBed.inject(ProfileManagerService);
  });

  describe('connections', () => {
    it('lists the active connection first, then most recently used', () => {
      expect(service.connections().map(c => c.config.id)).toEqual([
        cloud.id,
        server.id,
        local.id,
      ]);
      expect(service.activeConnection()?.config.id).toBe(cloud.id);
    });

    it('describes each kind with credentials and built-in state', () => {
      auth.hasTokenForConfig.mockReturnValue(true);
      setup.isHostedServerConfig.mockImplementation(
        (c: ServerConfig) => c.id === server.id
      );
      const [cloudInfo, serverInfo, localInfo] = service.connections();

      expect(cloudInfo).toMatchObject({
        kind: 'cloud',
        name: 'Dropbox',
        subtitle: 'Dropbox · bobby@example.com',
        hasCredentials: true,
        isActive: true,
        isBuiltIn: false,
      });
      expect(serverInfo).toMatchObject({
        kind: 'server',
        name: 'Bobby',
        subtitle: '@bobby · Ink',
        hasCredentials: true,
        isBuiltIn: true,
      });
      expect(localInfo).toMatchObject({
        kind: 'local',
        name: 'Bobby',
        subtitle: '@bobby · this browser only',
        hasCredentials: true,
      });
    });

    it('summarises migration history in one line', () => {
      const info = service.describe({
        ...local,
        displayName: 'Local Mode',
        migratedTo: {
          configId: server.id,
          displayName: 'Ink',
          username: 'bobby',
          projectCount: 3,
          at: '2026-09-08T10:00:00Z',
        },
      });
      expect(info.name).toBe('Bobby');
      expect(info.history).toMatch(/^3 projects moved to Ink as @bobby on /);

      const target = service.describe({
        ...server,
        migratedFrom: {
          configId: local.id,
          displayName: 'Local Mode',
          projectCount: 1,
          at: '2026-09-08T10:00:00Z',
        },
      });
      expect(target.history).toMatch(/^1 project moved here from Browser on /);
    });

    it('reports a cloud connection without tokens as needing reconnect', () => {
      cloudTokens.has.mockReturnValue(false);
      expect(service.describe(cloud).hasCredentials).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('clears credentials and data, then removes the config', async () => {
      const destination = await service.disconnect(server.id);

      expect(auth.clearTokenForConfig).toHaveBeenCalledWith(server.id);
      expect(cloudTokens.clear).toHaveBeenCalledWith(server.id);
      expect(storage.clearContextData).toHaveBeenCalledWith(server.id);
      expect(storage.removeConfig).toHaveBeenCalledWith(server.id);
      // Not the active one: stay put
      expect(destination).toBe('home');
      expect(storage.switchToConfig).not.toHaveBeenCalled();
    });

    it('switches to the most recently used remaining connection when the active one goes', async () => {
      const destination = await service.disconnect(cloud.id);

      expect(storage.switchToConfig).toHaveBeenCalledWith(server.id);
      expect(destination).toBe('home');
    });

    it('sends the user to the welcome screen when nothing is left', async () => {
      configs.set([cloud]);

      const destination = await service.disconnect(cloud.id);

      expect(destination).toBe('welcome');
      expect(storage.switchToConfig).not.toHaveBeenCalled();
    });

    it('clears the account-level cloud token once the last author on the account is gone', async () => {
      const second: ServerConfig = {
        ...cloud,
        id: `${cloud.id}-b0b`,
        userProfile: { name: 'Bob', username: 'bob' },
      };
      configs.set([local, cloud, second]);
      active.set(local);

      await service.disconnect(second.id);
      // One author still uses the account: only that profile's copy goes
      expect(cloudTokens.clear).toHaveBeenCalledWith(second.id);
      expect(cloudTokens.clear).not.toHaveBeenCalledWith(cloud.id);

      cloudTokens.clear.mockClear();
      await service.disconnect(cloud.id);
      // Last author: the base account token is cleared as well
      expect(cloudTokens.clear).toHaveBeenCalledWith(cloud.id);
      expect(cloudTokens.clear).toHaveBeenCalledWith(
        buildCloudConfigId('dropbox', 'dbid:1')
      );
    });

    it('is a no-op for an unknown id', async () => {
      const destination = await service.disconnect('nope');
      expect(destination).toBe('home');
      expect(storage.removeConfig).not.toHaveBeenCalled();
    });
  });

  describe('resetDevice', () => {
    it('wipes every connection, orphan and credential', async () => {
      const destination = await service.resetDevice();

      expect(auth.clearTokenForConfig).toHaveBeenCalledTimes(3);
      expect(cloudTokens.clear).toHaveBeenCalledTimes(3);
      expect(storage.clearPrefixedData).toHaveBeenCalledWith('srv:dead0000:');
      expect(storage.clearContextData).toHaveBeenCalledTimes(3);
      expect(storage.clearConfig).toHaveBeenCalled();
      expect(destination).toBe('welcome');
    });
  });

  describe('upgradeInto', () => {
    it('clones the data, drops any copied token and records the move', async () => {
      storage.cloneContextData = vi.fn().mockResolvedValue({
        databases: 4,
        localStorageKeys: 3,
        projectCount: 2,
      });
      storage.recordMigration = vi.fn();
      storage.renameProjectInContext = vi.fn().mockResolvedValue(undefined);
      storage.activateProjectsInContext = vi.fn().mockResolvedValue(2);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          ProfileManagerService,
          {
            provide: StorageContextService,
            useValue: {
              ...storage,
              configurations: configs,
              activeConfig: active,
            },
          },
          { provide: AuthTokenService, useValue: auth },
          { provide: CloudTokenStoreService, useValue: cloudTokens },
          { provide: SetupService, useValue: setup },
          {
            provide: LoggerService,
            useValue: { info: vi.fn(), warn: vi.fn() },
          },
        ],
      });
      service = TestBed.inject(ProfileManagerService);

      const result = await service.upgradeInto(local.id, cloud.id, 'bobby', [
        { oldSlug: 'novel', newSlug: 'my-novel' },
        { oldSlug: 'same', newSlug: 'same' },
      ]);

      expect(storage.cloneContextData).toHaveBeenCalledWith(local.id, cloud.id);
      expect(storage.renameProjectInContext).toHaveBeenCalledTimes(1);
      expect(storage.activateProjectsInContext).toHaveBeenCalledWith(cloud.id);
      expect(storage.renameProjectInContext).toHaveBeenCalledWith(
        cloud.id,
        'bobby',
        'novel',
        'my-novel'
      );
      expect(auth.clearTokenForConfig).toHaveBeenCalledWith(cloud.id);
      expect(storage.recordMigration).toHaveBeenCalledWith(local.id, cloud.id, {
        username: 'bobby',
        projectCount: 2,
      });
      expect(result.projectCount).toBe(2);
    });

    it('does nothing for an unknown or identical target', async () => {
      storage.cloneContextData = vi.fn();
      const result = await service.upgradeInto(local.id, local.id);
      expect(result.projectCount).toBe(0);
      expect(storage.cloneContextData).not.toHaveBeenCalled();
    });
  });

  describe('scanStorage', () => {
    it('reports per-connection data and orphans', async () => {
      const scan = await service.scanStorage();

      expect(scan.connections.map(c => c.info.config.id)).toEqual([
        cloud.id,
        server.id,
        local.id,
      ]);
      expect(scan.connections[0].data.databases).toEqual([
        `${cloud.id}:inkweld-media`,
      ]);
      expect(scan.orphans).toHaveLength(1);
    });

    it('deleteOrphan clears the prefix', async () => {
      await service.deleteOrphan('srv:dead0000:');
      expect(storage.clearPrefixedData).toHaveBeenCalledWith('srv:dead0000:');
    });
  });
});
