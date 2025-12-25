import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MCPKeysService } from '@inkweld/api/mcp-keys.service';
import { McpPermission, McpPublicKey } from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { MediaSyncService } from '@services/offline/media-sync.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsTabComponent } from './settings-tab.component';

describe('SettingsTabComponent', () => {
  let component: SettingsTabComponent;
  let fixture: ComponentFixture<SettingsTabComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let mcpKeysService: Partial<MCPKeysService>;
  let snackBar: Partial<MatSnackBar>;
  let setupService: Partial<SetupService>;
  let mediaSyncService: Partial<MediaSyncService>;
  let dialog: Partial<MatDialog>;

  const mockProject = {
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    id: '123',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    description: 'Test description',
  };

  const mockMcpKeys: McpPublicKey[] = [
    {
      id: 'key-1',
      name: 'Test Key 1',
      keyPrefix: 'ink_abc',
      permissions: [McpPermission.ReadProject, McpPermission.ReadElements],
      expiresAt: null,
      lastUsedAt: null,
      createdAt: Date.now() - 86400000,
      revoked: false,
    },
    {
      id: 'key-2',
      name: 'Test Key 2',
      keyPrefix: 'ink_xyz',
      permissions: [McpPermission.ReadProject],
      expiresAt: Date.now() + 86400000 * 30,
      lastUsedAt: Date.now() - 3600000,
      createdAt: Date.now() - 86400000 * 7,
      revoked: true,
    },
  ];

  beforeEach(async () => {
    projectStateService = {
      project: signal(mockProject),
    };

    mcpKeysService = {
      listMcpKeys: vi.fn().mockReturnValue(of(mockMcpKeys)),
      createMcpKey: vi.fn().mockReturnValue(
        of({
          key: {
            id: 'new-key',
            name: 'New Key',
            keyPrefix: 'ink_new',
            permissions: [McpPermission.ReadProject],
            expiresAt: null,
            lastUsedAt: null,
            createdAt: Date.now(),
            revoked: false,
          },
          fullKey: 'ink_new_fullkey123456789',
        })
      ),
      revokeMcpKey: vi.fn().mockReturnValue(of({ message: 'Key revoked' })),
      deleteMcpKey: vi.fn().mockReturnValue(of({ message: 'Key deleted' })),
    };

    snackBar = {
      open: vi.fn(),
    };

    setupService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    mediaSyncService = {
      checkSyncStatus: vi.fn().mockResolvedValue({
        items: [],
        needsDownload: 0,
        needsUpload: 0,
        isSyncing: false,
        downloadProgress: 0,
        lastChecked: new Date(),
        error: null,
      }),
      downloadAllFromServer: vi.fn().mockResolvedValue(undefined),
      uploadAllToServer: vi.fn().mockResolvedValue(undefined),
    };

    dialog = {};

    await TestBed.configureTestingModule({
      imports: [
        NoopAnimationsModule,
        FormsModule,
        MatButtonModule,
        MatCardModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatProgressBarModule,
        MatProgressSpinnerModule,
        MatSelectModule,
        MatTooltipModule,
        SettingsTabComponent,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: projectStateService },
        { provide: MCPKeysService, useValue: mcpKeysService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: SetupService, useValue: setupService },
        { provide: MediaSyncService, useValue: mediaSyncService },
        { provide: MatDialog, useValue: dialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('MCP Keys Management', () => {
    it('should load MCP keys on init when in server mode', async () => {
      await component.loadMcpKeys();
      await fixture.whenStable();

      expect(mcpKeysService.listMcpKeys).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
      expect(component['mcpKeys']().length).toBe(2);
      expect(component['isLoadingKeys']()).toBe(false);
    });

    it('should not load keys in offline mode', async () => {
      (setupService.getMode as ReturnType<typeof vi.fn>).mockReturnValue(
        'offline'
      );

      // Create a new component instance to pick up the offline mode
      const offlineFixture = TestBed.createComponent(SettingsTabComponent);
      const offlineComponent = offlineFixture.componentInstance;

      // Force project state to trigger effect
      (projectStateService.project as ReturnType<typeof signal>).set(
        mockProject
      );

      await offlineComponent.loadMcpKeys();

      expect(offlineComponent['mcpKeys']().length).toBe(0);
      expect(offlineComponent['isLoadingKeys']()).toBe(false);
    });

    it('should handle error when loading keys', async () => {
      (mcpKeysService.listMcpKeys as ReturnType<typeof vi.fn>).mockReturnValue(
        throwError(() => new Error('Network error'))
      );

      await component.loadMcpKeys();

      expect(component['keysError']()).toBe('Failed to load API keys');
      expect(component['isLoadingKeys']()).toBe(false);
    });

    it('should toggle permission selection', () => {
      expect(component.hasPermission(McpPermission.ReadProject)).toBe(false);

      component.togglePermission(McpPermission.ReadProject);
      expect(component.hasPermission(McpPermission.ReadProject)).toBe(true);

      component.togglePermission(McpPermission.ReadProject);
      expect(component.hasPermission(McpPermission.ReadProject)).toBe(false);
    });

    it('should select all read permissions', () => {
      component.selectAllReadPermissions();

      expect(component.hasPermission(McpPermission.ReadProject)).toBe(true);
      expect(component.hasPermission(McpPermission.ReadElements)).toBe(true);
      expect(component.hasPermission(McpPermission.ReadWorldbuilding)).toBe(
        true
      );
      expect(component.hasPermission(McpPermission.ReadSchemas)).toBe(true);
      expect(component.hasPermission(McpPermission.WriteElements)).toBe(false);
    });

    it('should select all write permissions', () => {
      component.selectAllWritePermissions();

      expect(component.hasPermission(McpPermission.WriteElements)).toBe(true);
      expect(component.hasPermission(McpPermission.WriteWorldbuilding)).toBe(
        true
      );
      expect(component.hasPermission(McpPermission.ReadProject)).toBe(false);
    });

    it('should select all permissions', () => {
      component.selectAllPermissions();

      expect(component.hasPermission(McpPermission.ReadProject)).toBe(true);
      expect(component.hasPermission(McpPermission.WriteElements)).toBe(true);
    });

    it('should clear permissions', () => {
      component.selectAllPermissions();
      component.clearPermissions();

      expect(component['selectedPermissions']().size).toBe(0);
    });

    it('should create a new key', async () => {
      component.newKeyName = 'My New Key';
      component.togglePermission(McpPermission.ReadProject);

      await component.createKey();

      expect(mcpKeysService.createMcpKey).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        expect.objectContaining({
          name: 'My New Key',
          permissions: [McpPermission.ReadProject],
        })
      );
      expect(component['newlyCreatedKey']()).toBe('ink_new_fullkey123456789');
      expect(snackBar.open).toHaveBeenCalledWith(
        'API key created successfully',
        'Close',
        { duration: 3000 }
      );
    });

    it('should not create key without name', async () => {
      component.newKeyName = '';
      component.togglePermission(McpPermission.ReadProject);

      await component.createKey();

      expect(mcpKeysService.createMcpKey).not.toHaveBeenCalled();
    });

    it('should not create key without permissions', async () => {
      component.newKeyName = 'My Key';
      // No permissions selected

      await component.createKey();

      expect(mcpKeysService.createMcpKey).not.toHaveBeenCalled();
    });

    it('should revoke a key', async () => {
      await component.loadMcpKeys();
      const keyToRevoke = component['mcpKeys']()[0];

      await component.revokeKey(keyToRevoke);

      expect(mcpKeysService.revokeMcpKey).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'key-1'
      );
      expect(snackBar.open).toHaveBeenCalledWith('API key revoked', 'Close', {
        duration: 3000,
      });
    });

    it('should delete a key', async () => {
      await component.loadMcpKeys();
      const keyToDelete = component['mcpKeys']()[0];

      await component.deleteKey(keyToDelete);

      expect(mcpKeysService.deleteMcpKey).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        'key-1'
      );
      expect(
        component['mcpKeys']().find(k => k.id === 'key-1')
      ).toBeUndefined();
      expect(snackBar.open).toHaveBeenCalledWith('API key deleted', 'Close', {
        duration: 3000,
      });
    });

    it('should get active keys count', async () => {
      await component.loadMcpKeys();

      expect(component.getActiveKeysCount()).toBe(1);
    });

    it('should dismiss newly created key', () => {
      component['newlyCreatedKey'].set('test-key');
      component['showCreateKeyForm'].set(true);

      component.dismissNewKey();

      expect(component['newlyCreatedKey']()).toBeNull();
      expect(component['showCreateKeyForm']()).toBe(false);
    });

    it('should toggle create key form', () => {
      expect(component['showCreateKeyForm']()).toBe(false);

      component.toggleCreateKeyForm();
      expect(component['showCreateKeyForm']()).toBe(true);

      component.toggleCreateKeyForm();
      expect(component['showCreateKeyForm']()).toBe(false);
    });

    it('should format permission for display', () => {
      const formatted = component.formatPermission(McpPermission.ReadProject);
      expect(formatted).toContain('read');
      expect(formatted).toContain('project');
    });

    it('should format date', () => {
      const now = Date.now();
      const formatted = component.formatDate(now);
      expect(formatted).toBeTruthy();
      expect(formatted).not.toBe('Never');

      expect(component.formatDate(null)).toBe('Never');
    });
  });

  describe('Media Sync', () => {
    it('should check media sync status', async () => {
      await component.checkMediaSyncStatus();

      expect(mediaSyncService.checkSyncStatus).toHaveBeenCalledWith(
        'testuser/test-project'
      );
    });

    it('should download all media', async () => {
      await component.downloadAllMedia();

      expect(mediaSyncService.downloadAllFromServer).toHaveBeenCalledWith(
        'testuser/test-project'
      );
      expect(snackBar.open).toHaveBeenCalledWith(
        'All media downloaded successfully',
        'Close',
        { duration: 3000 }
      );
    });

    it('should upload all media', async () => {
      await component.uploadAllMedia();

      expect(mediaSyncService.uploadAllToServer).toHaveBeenCalledWith(
        'testuser/test-project'
      );
      expect(snackBar.open).toHaveBeenCalledWith(
        'All media uploaded successfully',
        'Close',
        { duration: 3000 }
      );
    });

    it('should format bytes', () => {
      expect(component.formatBytes(0)).toBe('0 B');
      expect(component.formatBytes(1024)).toBe('1 KB');
      expect(component.formatBytes(1048576)).toBe('1 MB');
    });

    it('should return projectKey', () => {
      expect(component['projectKey']()).toBe('testuser/test-project');
    });

    it('should return null projectKey when no project', () => {
      (projectStateService.project as ReturnType<typeof signal>).set(undefined);
      expect(component['projectKey']()).toBeNull();
    });
  });

  describe('Utility methods', () => {
    it('should get server total size', () => {
      component['mediaSyncState'].set({
        items: [
          {
            mediaId: '1',
            size: 1000,
            status: 'server-only',
            server: { filename: 'file1.jpg', size: 1000 },
          },
          {
            mediaId: '2',
            size: 2000,
            status: 'server-only',
            server: { filename: 'file2.jpg', size: 2000 },
          },
        ],
        needsDownload: 0,
        needsUpload: 0,
        isSyncing: false,
        downloadProgress: 0,
        lastChecked: null,
      });

      expect(component.getServerTotalSize()).toBe(3000);
    });

    it('should get local total size', () => {
      component['mediaSyncState'].set({
        items: [
          {
            mediaId: '1',
            size: 500,
            status: 'local-only',
            local: {
              mediaId: '1',
              mimeType: 'image/jpeg',
              size: 500,
              createdAt: '2025-01-15T10:00:00.000Z',
            },
          },
          {
            mediaId: '2',
            size: 1500,
            status: 'local-only',
            local: {
              mediaId: '2',
              mimeType: 'image/jpeg',
              size: 1500,
              createdAt: '2025-01-15T10:00:00.000Z',
            },
          },
        ],
        needsDownload: 0,
        needsUpload: 0,
        isSyncing: false,
        downloadProgress: 0,
        lastChecked: null,
      });

      expect(component.getLocalTotalSize()).toBe(2000);
    });

    it('should get server file count', () => {
      component['mediaSyncState'].set({
        items: [
          {
            mediaId: '1',
            size: 1000,
            status: 'server-only',
            server: { filename: 'file1.jpg', size: 1000 },
          },
          {
            mediaId: '2',
            size: 2000,
            status: 'server-only',
            server: { filename: 'file2.jpg', size: 2000 },
          },
          {
            mediaId: '3',
            size: 500,
            status: 'local-only',
            local: {
              mediaId: '3',
              mimeType: 'image/jpeg',
              size: 500,
              createdAt: '2025-01-15T10:00:00.000Z',
            },
          },
        ],
        needsDownload: 0,
        needsUpload: 0,
        isSyncing: false,
        downloadProgress: 0,
        lastChecked: null,
      });

      expect(component.getServerFileCount()).toBe(2);
    });

    it('should get local file count', () => {
      component['mediaSyncState'].set({
        items: [
          {
            mediaId: '1',
            size: 1000,
            status: 'synced',
            server: { filename: 'file1.jpg', size: 1000 },
            local: {
              mediaId: '1',
              mimeType: 'image/jpeg',
              size: 1000,
              createdAt: '2025-01-15T10:00:00.000Z',
            },
          },
          {
            mediaId: '2',
            size: 500,
            status: 'local-only',
            local: {
              mediaId: '2',
              mimeType: 'image/jpeg',
              size: 500,
              createdAt: '2025-01-15T10:00:00.000Z',
            },
          },
        ],
        needsDownload: 0,
        needsUpload: 0,
        isSyncing: false,
        downloadProgress: 0,
        lastChecked: null,
      });

      expect(component.getLocalFileCount()).toBe(2);
    });
  });
});
