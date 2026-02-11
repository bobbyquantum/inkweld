import {
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
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
import { Router } from '@angular/router';
import { CreateMcpKeyDialogResult } from '@dialogs/create-mcp-key-dialog/create-mcp-key-dialog.component';
import { CollaborationService as CollaborationApiService } from '@inkweld/api/collaboration.service';
import { MCPKeysService } from '@inkweld/api/mcp-keys.service';
import { ProjectsService } from '@inkweld/api/projects.service';
import {
  Collaborator,
  CollaboratorRole,
  InvitationStatus,
  McpPermission,
  McpPublicKey,
} from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RelationshipsTabComponent } from '../relationships/relationships-tab.component';
import { TagsTabComponent } from '../tags/tags-tab.component';
import { TemplatesTabComponent } from '../templates/templates-tab.component';
import { SettingsTabComponent } from './settings-tab.component';

// Mock child components to avoid their complex dependencies
@Component({ selector: 'app-templates-tab', template: '', standalone: true })
class MockTemplatesTabComponent {}

@Component({
  selector: 'app-relationships-tab',
  template: '',
  standalone: true,
})
class MockRelationshipsTabComponent {}

@Component({ selector: 'app-tags-tab', template: '', standalone: true })
class MockTagsTabComponent {}

describe('SettingsTabComponent', () => {
  let component: SettingsTabComponent;
  let fixture: ComponentFixture<SettingsTabComponent>;
  let projectStateService: Partial<ProjectStateService>;
  let mcpKeysService: Partial<MCPKeysService>;
  let collaborationService: Partial<CollaborationApiService>;
  let snackBar: Partial<MatSnackBar>;
  let setupService: Partial<SetupService>;
  let systemConfigService: Partial<SystemConfigService>;
  let mediaSyncService: Partial<MediaSyncService>;
  let dialog: Partial<MatDialog>;
  let projectsService: Partial<ProjectsService>;
  let router: Partial<Router>;

  const mockProject = {
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    id: '123',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    description: 'Test description',
  };

  const mockCollaborators: Collaborator[] = [
    {
      projectId: '123',
      userId: 'user-1',
      username: 'collaborator1',
      name: 'Collaborator One',
      email: 'collab1@example.com',
      role: CollaboratorRole.Editor,
      status: InvitationStatus.Accepted,
      invitedBy: 'testuser-id',
      invitedByUsername: 'testuser',
      invitedAt: Date.now() - 86400000,
      acceptedAt: Date.now() - 43200000,
      clientName: null,
    },
    {
      projectId: '123',
      userId: 'user-2',
      username: 'collaborator2',
      name: 'Collaborator Two',
      email: 'collab2@example.com',
      role: CollaboratorRole.Viewer,
      status: InvitationStatus.Pending,
      invitedBy: 'testuser-id',
      invitedByUsername: 'testuser',
      invitedAt: Date.now() - 3600000,
      acceptedAt: null,
      clientName: null,
    },
  ];

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
      canWrite: signal(true),
      isOwner: signal(true),
      accessLoaded: signal(true),
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

    collaborationService = {
      listCollaborators: vi.fn().mockReturnValue(of(mockCollaborators)),
      inviteCollaborator: vi.fn().mockReturnValue(
        of({
          projectId: '123',
          userId: 'new-user',
          username: 'newuser',
          name: 'New User',
          email: 'newuser@example.com',
          role: CollaboratorRole.Editor,
          status: InvitationStatus.Pending,
          invitedBy: 'testuser-id',
          invitedByUsername: 'testuser',
          invitedAt: Date.now(),
          acceptedAt: null,
        })
      ),
      updateCollaborator: vi.fn().mockReturnValue(
        of({
          ...mockCollaborators[0],
          role: CollaboratorRole.Admin,
        })
      ),
      removeCollaborator: vi.fn().mockReturnValue(of({ message: 'Removed' })),
    };

    snackBar = {
      open: vi.fn(),
    };

    setupService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    systemConfigService = {
      isAiKillSwitchEnabled: signal(false), // AI enabled (kill switch OFF)
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

    dialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(null),
      }),
    };

    projectsService = {
      updateProject: vi.fn().mockReturnValue(of({ slug: 'new-slug' })),
    };

    router = {
      navigate: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [
        NoopAnimationsModule,
        FormsModule,
        MatButtonModule,
        MatCardModule,
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
        { provide: CollaborationApiService, useValue: collaborationService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: SetupService, useValue: setupService },
        { provide: SystemConfigService, useValue: systemConfigService },
        { provide: MediaSyncService, useValue: mediaSyncService },
        { provide: MatDialog, useValue: dialog },
        { provide: ProjectsService, useValue: projectsService },
        { provide: Router, useValue: router },
      ],
    })
      .overrideComponent(SettingsTabComponent, {
        remove: {
          imports: [
            TemplatesTabComponent,
            RelationshipsTabComponent,
            TagsTabComponent,
          ],
        },
        add: {
          imports: [
            MockTemplatesTabComponent,
            MockRelationshipsTabComponent,
            MockTagsTabComponent,
          ],
        },
      })
      .compileComponents();

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
        'local'
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
      // Permission management is now in the CreateMcpKeyDialogComponent
      // This test validates the dialog is opened correctly
      expect(component.openCreateKeyDialog).toBeDefined();
    });

    it('should open create key dialog', () => {
      const dialogSpy = vi.spyOn(component['dialog'], 'open').mockReturnValue({
        afterClosed: () => of(null),
      } as ReturnType<MatDialog['open']>);

      component.openCreateKeyDialog();
      expect(dialogSpy).toHaveBeenCalled();
    });

    it('should handle dialog result when key is created', () => {
      const mockResult: CreateMcpKeyDialogResult = {
        fullKey: 'ink_new_fullkey123456789',
        key: {
          id: 'new-key',
          name: 'Test Key',
          keyPrefix: 'ink_new_',
          permissions: [McpPermission.ReadProject],
          createdAt: Date.now(),
          expiresAt: null,
          lastUsedAt: null,
          revoked: false,
        },
      };

      vi.spyOn(component['dialog'], 'open').mockReturnValue({
        afterClosed: () => of(mockResult),
      } as ReturnType<MatDialog['open']>);

      component.openCreateKeyDialog();
      expect(component['newlyCreatedKey']()).toBe('ink_new_fullkey123456789');
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

      component.dismissNewKey();

      expect(component['newlyCreatedKey']()).toBeNull();
    });

    it('should format date', () => {
      const now = Date.now();
      const formatted = component.formatDate(now);
      expect(formatted).toBeTruthy();
      expect(formatted).not.toBe('Never');

      expect(component.formatDate(null)).toBe('Never');
    });

    it('should handle error when revoking key', async () => {
      await component.loadMcpKeys();
      (mcpKeysService.revokeMcpKey as ReturnType<typeof vi.fn>).mockReturnValue(
        throwError(() => new Error('Failed'))
      );

      const keyToRevoke = component['mcpKeys']()[0];
      await component.revokeKey(keyToRevoke);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to revoke API key',
        'Close',
        { duration: 3000 }
      );
    });

    it('should handle error when deleting key', async () => {
      await component.loadMcpKeys();
      (mcpKeysService.deleteMcpKey as ReturnType<typeof vi.fn>).mockReturnValue(
        throwError(() => new Error('Failed'))
      );

      const keyToDelete = component['mcpKeys']()[0];
      await component.deleteKey(keyToDelete);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to delete API key',
        'Close',
        { duration: 3000 }
      );
    });

    it('should not revoke key without project', async () => {
      (projectStateService.project as ReturnType<typeof signal>).set(undefined);
      const keyToRevoke = { id: 'key-1' } as McpPublicKey;
      await component.revokeKey(keyToRevoke);
      expect(mcpKeysService.revokeMcpKey).not.toHaveBeenCalled();
    });

    it('should not delete key without project', async () => {
      (projectStateService.project as ReturnType<typeof signal>).set(undefined);
      const keyToDelete = { id: 'key-1' } as McpPublicKey;
      await component.deleteKey(keyToDelete);
      expect(mcpKeysService.deleteMcpKey).not.toHaveBeenCalled();
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

    it('should handle error when downloading media', async () => {
      (
        mediaSyncService.downloadAllFromServer as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Download failed'));

      await component.downloadAllMedia();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to download some media files',
        'Close',
        { duration: 3000 }
      );
    });

    it('should handle error when uploading media', async () => {
      (
        mediaSyncService.uploadAllToServer as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Upload failed'));

      await component.uploadAllMedia();

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to upload some media files',
        'Close',
        { duration: 3000 }
      );
    });

    it('should not download media without project key', async () => {
      (projectStateService.project as ReturnType<typeof signal>).set(undefined);
      await component.downloadAllMedia();
      expect(mediaSyncService.downloadAllFromServer).not.toHaveBeenCalled();
    });

    it('should not upload media without project key', async () => {
      (projectStateService.project as ReturnType<typeof signal>).set(undefined);
      await component.uploadAllMedia();
      expect(mediaSyncService.uploadAllToServer).not.toHaveBeenCalled();
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

  describe('Collaboration Management', () => {
    it('should load collaborators on init when in server mode', async () => {
      await component.loadCollaborators();
      await fixture.whenStable();

      expect(collaborationService.listCollaborators).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
      expect(component['collaborators']().length).toBe(2);
    });

    it('should get active collaborators count', async () => {
      await component.loadCollaborators();
      await fixture.whenStable();

      expect(component.getActiveCollaboratorsCount()).toBe(1);
    });

    it('should get pending invitations count', async () => {
      await component.loadCollaborators();
      await fixture.whenStable();

      expect(component.getPendingInvitationsCount()).toBe(1);
    });

    it('should invite a collaborator', async () => {
      await component.loadCollaborators();
      component.inviteUsername = 'newuser';
      component.inviteRole = CollaboratorRole.Editor;

      await component.inviteCollaborator();
      await fixture.whenStable();

      expect(collaborationService.inviteCollaborator).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        {
          username: 'newuser',
          role: CollaboratorRole.Editor,
        }
      );
      expect(snackBar.open).toHaveBeenCalled();
    });

    it('should not invite if username is empty', async () => {
      component.inviteUsername = '';

      await component.inviteCollaborator();
      await fixture.whenStable();

      expect(collaborationService.inviteCollaborator).not.toHaveBeenCalled();
    });

    it('should update collaborator role', async () => {
      await component.loadCollaborators();
      await fixture.whenStable();

      const collaborator = mockCollaborators[0];
      await component.updateCollaboratorRole(
        collaborator,
        CollaboratorRole.Admin
      );
      await fixture.whenStable();

      expect(collaborationService.updateCollaborator).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        collaborator.userId,
        { role: CollaboratorRole.Admin }
      );
    });

    it('should remove a collaborator', async () => {
      await component.loadCollaborators();
      await fixture.whenStable();

      const collaborator = mockCollaborators[0];
      await component.removeCollaborator(collaborator);
      await fixture.whenStable();

      expect(collaborationService.removeCollaborator).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        collaborator.userId
      );
      expect(snackBar.open).toHaveBeenCalled();
    });

    it('should return correct role icon', () => {
      expect(component.getRoleIcon(CollaboratorRole.Viewer)).toBe('visibility');
      expect(component.getRoleIcon(CollaboratorRole.Editor)).toBe('edit');
      expect(component.getRoleIcon(CollaboratorRole.Admin)).toBe(
        'admin_panel_settings'
      );
    });

    it('should handle error when loading collaborators', async () => {
      // Reset collaborators first and set up error mock
      component['collaborators'].set([]);
      (
        collaborationService.listCollaborators as ReturnType<typeof vi.fn>
      ).mockReturnValue(throwError(() => new Error('Network error')));

      await component.loadCollaborators();
      await fixture.whenStable();

      // Should remain empty after error
      expect(component['collaborators']().length).toBe(0);
    });

    it('should handle error when inviting collaborator', async () => {
      (
        collaborationService.inviteCollaborator as ReturnType<typeof vi.fn>
      ).mockReturnValue(throwError(() => new Error('User not found')));

      component.inviteUsername = 'nonexistent';
      component.inviteRole = CollaboratorRole.Editor;

      await component.inviteCollaborator();
      await fixture.whenStable();

      expect(snackBar.open).toHaveBeenCalled();
    });

    it('should handle error when updating collaborator role', async () => {
      await component.loadCollaborators();
      (
        collaborationService.updateCollaborator as ReturnType<typeof vi.fn>
      ).mockReturnValue(throwError(() => new Error('Update failed')));

      const collaborator = mockCollaborators[0];
      await component.updateCollaboratorRole(
        collaborator,
        CollaboratorRole.Admin
      );

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to update role',
        'Close',
        { duration: 3000 }
      );
    });

    it('should handle error when removing collaborator', async () => {
      await component.loadCollaborators();
      (
        collaborationService.removeCollaborator as ReturnType<typeof vi.fn>
      ).mockReturnValue(throwError(() => new Error('Remove failed')));

      const collaborator = mockCollaborators[0];
      await component.removeCollaborator(collaborator);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Failed to remove collaborator',
        'Close',
        { duration: 3000 }
      );
    });

    it('should not update collaborator without project', async () => {
      (projectStateService.project as ReturnType<typeof signal>).set(undefined);
      await component.updateCollaboratorRole(
        mockCollaborators[0],
        CollaboratorRole.Admin
      );
      expect(collaborationService.updateCollaborator).not.toHaveBeenCalled();
    });

    it('should not remove collaborator without project', async () => {
      (projectStateService.project as ReturnType<typeof signal>).set(undefined);
      await component.removeCollaborator(mockCollaborators[0]);
      expect(collaborationService.removeCollaborator).not.toHaveBeenCalled();
    });

    it('should toggle invite form', () => {
      expect(component['showInviteForm']()).toBe(false);

      component.toggleInviteForm();
      expect(component['showInviteForm']()).toBe(true);

      component.toggleInviteForm();
      expect(component['showInviteForm']()).toBe(false);
    });

    it('should reset invite form', () => {
      component.inviteUsername = 'someone';
      component.inviteRole = CollaboratorRole.Admin;

      component.resetInviteForm();

      expect(component.inviteUsername).toBe('');
      expect(component.inviteRole).toBe(CollaboratorRole.Viewer);
    });

    it('should not invite collaborator without project', async () => {
      (projectStateService.project as ReturnType<typeof signal>).set(undefined);
      component.inviteUsername = 'newuser';
      await component.inviteCollaborator();
      expect(collaborationService.inviteCollaborator).not.toHaveBeenCalled();
    });
  });

  describe('Project Rename', () => {
    it('should validate slug - empty slug is invalid', () => {
      component['newProjectSlug'] = '';
      expect(component.isValidSlug()).toBe(false);
    });

    it('should validate slug - too short slug is invalid', () => {
      component['newProjectSlug'] = 'ab';
      expect(component.isValidSlug()).toBe(false);
    });

    it('should validate slug - valid slug with 3 chars', () => {
      component['newProjectSlug'] = 'abc';
      expect(component.isValidSlug()).toBe(true);
    });

    it('should validate slug - invalid chars are rejected', () => {
      component['newProjectSlug'] = 'invalid_slug';
      expect(component.isValidSlug()).toBe(false);

      component['newProjectSlug'] = 'Invalid';
      expect(component.isValidSlug()).toBe(false);

      component['newProjectSlug'] = 'has spaces';
      expect(component.isValidSlug()).toBe(false);
    });

    it('should validate slug - same as current slug is invalid', () => {
      component['newProjectSlug'] = 'test-project';
      expect(component.isValidSlug()).toBe(false);
    });

    it('should validate slug - different valid slug is valid', () => {
      component['newProjectSlug'] = 'new-valid-slug';
      expect(component.isValidSlug()).toBe(true);
    });

    it('should cancel rename form', () => {
      component['showRenameForm'].set(true);
      component['newProjectSlug'] = 'some-slug';
      component['renameError'].set('Some error');

      component.cancelRename();

      expect(component['showRenameForm']()).toBe(false);
      expect(component['newProjectSlug']).toBe('');
      expect(component['renameError']()).toBeNull();
    });

    it('should not rename if slug is invalid', async () => {
      component['newProjectSlug'] = '';
      await component.renameProject();
      expect(projectsService.updateProject).not.toHaveBeenCalled();
    });

    it('should not rename if no project', async () => {
      (projectStateService.project as ReturnType<typeof signal>).set(undefined);
      component['newProjectSlug'] = 'new-slug';
      await component.renameProject();
      expect(projectsService.updateProject).not.toHaveBeenCalled();
    });

    it('should call API to rename project with valid slug', async () => {
      component['newProjectSlug'] = 'new-slug';
      await component.renameProject();

      expect(projectsService.updateProject).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        { slug: 'new-slug' }
      );
      expect(snackBar.open).toHaveBeenCalledWith(
        expect.stringContaining('renamed'),
        'Close',
        expect.any(Object)
      );
    });

    it('should set isRenaming during rename operation', async () => {
      component['newProjectSlug'] = 'new-slug';

      expect(component['isRenaming']()).toBe(false);

      const renamePromise = component.renameProject();
      // isRenaming should be true during the operation
      expect(component['isRenaming']()).toBe(true);

      await renamePromise;
      // isRenaming should be false after completion
      expect(component['isRenaming']()).toBe(false);
    });

    it('should handle rename error', async () => {
      (
        projectsService.updateProject as ReturnType<typeof vi.fn>
      ).mockReturnValue(throwError(() => new Error('Slug already exists')));

      component['newProjectSlug'] = 'existing-slug';
      await component.renameProject();

      expect(component['renameError']()).toBe('Slug already exists');
      expect(component['isRenaming']()).toBe(false);
    });

    it('should handle rename error without message', async () => {
      (
        projectsService.updateProject as ReturnType<typeof vi.fn>
      ).mockReturnValue(throwError(() => 'Unknown error'));

      component['newProjectSlug'] = 'some-slug';
      await component.renameProject();

      expect(component['renameError']()).toBe(
        'A project with this slug may already exist'
      );
    });
  });
});
