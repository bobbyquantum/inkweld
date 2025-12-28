import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MCPKeysService } from '@inkweld/api/mcp-keys.service';
import {
  CreateMcpKeyRequest,
  McpPermission,
  McpPublicKey,
} from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import {
  MediaSyncService,
  MediaSyncState,
} from '@services/offline/media-sync.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { firstValueFrom } from 'rxjs';

import { RelationshipsTabComponent } from '../relationships/relationships-tab.component';
import { TagsTabComponent } from '../tags/tags-tab.component';
import { TemplatesTabComponent } from '../templates/templates-tab.component';

/**
 * Permission group for easier selection in UI
 */
interface PermissionGroup {
  label: string;
  permissions: {
    permission: McpPermission;
    label: string;
    description: string;
  }[];
}

/**
 * Project Settings Tab Component
 *
 * Provides project-specific settings including:
 * - MCP API key management for external tool access
 * - Media sync status (moved from user settings)
 * - Future: Collaboration settings
 */
@Component({
  selector: 'app-settings-tab',
  templateUrl: './settings-tab.component.html',
  styleUrls: ['./settings-tab.component.scss'],
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    RelationshipsTabComponent,
    TagsTabComponent,
    TemplatesTabComponent,
  ],
})
export class SettingsTabComponent {
  protected readonly projectState = inject(ProjectStateService);
  private readonly mcpKeysService = inject(MCPKeysService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly setupService = inject(SetupService);
  private readonly mediaSyncService = inject(MediaSyncService);
  private readonly dialog = inject(MatDialog);

  // Current mode (server or offline)
  protected readonly currentMode = this.setupService.getMode();

  // MCP Keys state
  protected readonly mcpKeys = signal<McpPublicKey[]>([]);
  protected readonly isLoadingKeys = signal(true);
  protected readonly keysError = signal<string | null>(null);

  // New key creation state
  protected readonly isCreatingKey = signal(false);
  protected readonly showCreateKeyForm = signal(false);
  newKeyName = '';
  protected selectedPermissions = signal<Set<McpPermission>>(new Set());
  protected newKeyExpiration: 'never' | '7days' | '30days' | '90days' = 'never';

  // Helper for template date comparisons
  protected readonly currentTime = () => Date.now();

  // Newly created key (shown once)
  protected readonly newlyCreatedKey = signal<string | null>(null);

  // Permission groups for easier selection
  // NOTE: Only include permissions that are actually implemented in the backend
  // read:documents and read:media are defined but not used by any MCP tools/resources yet
  // write:schemas and write:media are defined but not used by any MCP tools yet
  protected readonly permissionGroups: PermissionGroup[] = [
    {
      label: 'Read Permissions',
      permissions: [
        {
          permission: McpPermission.ReadProject,
          label: 'Project',
          description: 'Read project metadata',
        },
        {
          permission: McpPermission.ReadElements,
          label: 'Elements',
          description: 'Read project tree/elements',
        },
        {
          permission: McpPermission.ReadWorldbuilding,
          label: 'Worldbuilding',
          description: 'Read worldbuilding data',
        },
        {
          permission: McpPermission.ReadSchemas,
          label: 'Schemas',
          description: 'Read custom schemas',
        },
      ],
    },
    {
      label: 'Write Permissions',
      permissions: [
        {
          permission: McpPermission.WriteElements,
          label: 'Elements',
          description: 'Create/modify elements',
        },
        {
          permission: McpPermission.WriteWorldbuilding,
          label: 'Worldbuilding',
          description: 'Modify worldbuilding data',
        },
      ],
    },
  ];

  // Media sync state (moved from sync-settings)
  protected readonly projectKey = computed(() => {
    const project = this.projectState.project();
    if (!project) return null;
    return `${project.username}/${project.slug}`;
  });

  protected readonly mediaSyncState = signal<MediaSyncState | null>(null);

  constructor() {
    // Watch for project changes and update media sync state
    effect(() => {
      const key = this.projectKey();
      if (key && this.currentMode === 'server') {
        void this.checkMediaSyncStatus();
        void this.loadMcpKeys();
      }
    });
  }

  // =====================
  // MCP Keys Management
  // =====================

  async loadMcpKeys(): Promise<void> {
    const project = this.projectState.project();
    if (!project || this.currentMode !== 'server') {
      this.mcpKeys.set([]);
      this.isLoadingKeys.set(false);
      return;
    }

    this.isLoadingKeys.set(true);
    this.keysError.set(null);

    try {
      const keys = await firstValueFrom(
        this.mcpKeysService.listMcpKeys(project.username, project.slug)
      );
      this.mcpKeys.set(keys);
    } catch (error) {
      console.error('Failed to load MCP keys:', error);
      this.keysError.set('Failed to load API keys');
    } finally {
      this.isLoadingKeys.set(false);
    }
  }

  toggleCreateKeyForm(): void {
    this.showCreateKeyForm.update(show => !show);
    if (!this.showCreateKeyForm()) {
      this.resetCreateKeyForm();
    }
  }

  resetCreateKeyForm(): void {
    this.newKeyName = '';
    this.selectedPermissions.set(new Set());
    this.newKeyExpiration = 'never';
    this.newlyCreatedKey.set(null);
  }

  togglePermission(permission: McpPermission): void {
    this.selectedPermissions.update(perms => {
      const newPerms = new Set(perms);
      if (newPerms.has(permission)) {
        newPerms.delete(permission);
      } else {
        newPerms.add(permission);
      }
      return newPerms;
    });
  }

  hasPermission(permission: McpPermission): boolean {
    return this.selectedPermissions().has(permission);
  }

  selectAllReadPermissions(): void {
    this.selectedPermissions.update(perms => {
      const newPerms = new Set(perms);
      this.permissionGroups[0].permissions.forEach(p =>
        newPerms.add(p.permission)
      );
      return newPerms;
    });
  }

  selectAllWritePermissions(): void {
    this.selectedPermissions.update(perms => {
      const newPerms = new Set(perms);
      this.permissionGroups[1].permissions.forEach(p =>
        newPerms.add(p.permission)
      );
      return newPerms;
    });
  }

  selectAllPermissions(): void {
    this.selectedPermissions.update(() => {
      const newPerms = new Set<McpPermission>();
      this.permissionGroups.forEach(group => {
        group.permissions.forEach(p => newPerms.add(p.permission));
      });
      return newPerms;
    });
  }

  clearPermissions(): void {
    this.selectedPermissions.set(new Set());
  }

  async createKey(): Promise<void> {
    const project = this.projectState.project();
    if (
      !project ||
      !this.newKeyName.trim() ||
      this.selectedPermissions().size === 0
    ) {
      return;
    }

    this.isCreatingKey.set(true);

    try {
      const request: CreateMcpKeyRequest = {
        name: this.newKeyName.trim(),
        permissions: Array.from(this.selectedPermissions()),
        expiresAt: this.getExpirationTimestamp(),
      };

      const response = await firstValueFrom(
        this.mcpKeysService.createMcpKey(
          project.username,
          project.slug,
          request
        )
      );

      // Show the full key (only shown once!)
      this.newlyCreatedKey.set(response.fullKey);

      // Add the new key to the list
      this.mcpKeys.update(keys => [...keys, response.key]);

      this.snackBar.open('API key created successfully', 'Close', {
        duration: 3000,
      });

      // Reset form but keep showing the created key
      this.newKeyName = '';
      this.selectedPermissions.set(new Set());
      this.newKeyExpiration = 'never';
    } catch (error) {
      console.error('Failed to create API key:', error);
      this.snackBar.open('Failed to create API key', 'Close', {
        duration: 3000,
      });
    } finally {
      this.isCreatingKey.set(false);
    }
  }

  private getExpirationTimestamp(): number | undefined {
    if (this.newKeyExpiration === 'never') {
      return undefined;
    }

    const now = Date.now();
    const days = parseInt(this.newKeyExpiration.replace('days', ''), 10);
    return now + days * 24 * 60 * 60 * 1000;
  }

  async revokeKey(key: McpPublicKey): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    // TODO: Add confirmation dialog
    try {
      await firstValueFrom(
        this.mcpKeysService.revokeMcpKey(project.username, project.slug, key.id)
      );

      // Update the key in the list
      this.mcpKeys.update(keys =>
        keys.map(k => (k.id === key.id ? { ...k, revoked: true } : k))
      );

      this.snackBar.open('API key revoked', 'Close', { duration: 3000 });
    } catch (error) {
      console.error('Failed to revoke API key:', error);
      this.snackBar.open('Failed to revoke API key', 'Close', {
        duration: 3000,
      });
    }
  }

  async deleteKey(key: McpPublicKey): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    // TODO: Add confirmation dialog
    try {
      await firstValueFrom(
        this.mcpKeysService.deleteMcpKey(project.username, project.slug, key.id)
      );

      // Remove from list
      this.mcpKeys.update(keys => keys.filter(k => k.id !== key.id));

      this.snackBar.open('API key deleted', 'Close', { duration: 3000 });
    } catch (error) {
      console.error('Failed to delete API key:', error);
      this.snackBar.open('Failed to delete API key', 'Close', {
        duration: 3000,
      });
    }
  }

  copyKeyToClipboard(key: string): void {
    navigator.clipboard.writeText(key).then(
      () => {
        this.snackBar.open('API key copied to clipboard', 'Close', {
          duration: 2000,
        });
      },
      () => {
        this.snackBar.open('Failed to copy to clipboard', 'Close', {
          duration: 2000,
        });
      }
    );
  }

  dismissNewKey(): void {
    this.newlyCreatedKey.set(null);
    this.showCreateKeyForm.set(false);
  }

  formatPermission(permission: McpPermission): string {
    return permission.replace(':', ': ').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  formatDate(timestamp: number | null): string {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleDateString();
  }

  getActiveKeysCount(): number {
    return this.mcpKeys().filter(k => !k.revoked).length;
  }

  // =====================
  // Media Sync (moved from sync-settings)
  // =====================

  async checkMediaSyncStatus(): Promise<void> {
    const key = this.projectKey();
    if (!key) return;

    try {
      const state = await this.mediaSyncService.checkSyncStatus(key);
      this.mediaSyncState.set(state);
    } catch (error) {
      console.error('Failed to check media sync status:', error);
      this.snackBar.open('Failed to check media sync status', 'Close', {
        duration: 3000,
      });
    }
  }

  async downloadAllMedia(): Promise<void> {
    const key = this.projectKey();
    if (!key) return;

    try {
      await this.mediaSyncService.downloadAllFromServer(key);
      this.snackBar.open('All media downloaded successfully', 'Close', {
        duration: 3000,
      });
      await this.checkMediaSyncStatus();
    } catch (error) {
      console.error('Failed to download media:', error);
      this.snackBar.open('Failed to download some media files', 'Close', {
        duration: 3000,
      });
    }
  }

  async uploadAllMedia(): Promise<void> {
    const key = this.projectKey();
    if (!key) return;

    try {
      await this.mediaSyncService.uploadAllToServer(key);
      this.snackBar.open('All media uploaded successfully', 'Close', {
        duration: 3000,
      });
      await this.checkMediaSyncStatus();
    } catch (error) {
      console.error('Failed to upload media:', error);
      this.snackBar.open('Failed to upload some media files', 'Close', {
        duration: 3000,
      });
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getServerTotalSize(): number {
    const state = this.mediaSyncState();
    if (!state) return 0;
    return state.items
      .filter(item => item.server)
      .reduce((sum, item) => sum + (item.server?.size ?? 0), 0);
  }

  getLocalTotalSize(): number {
    const state = this.mediaSyncState();
    if (!state) return 0;
    return state.items
      .filter(item => item.local)
      .reduce((sum, item) => sum + (item.local?.size ?? 0), 0);
  }

  getServerFileCount(): number {
    const state = this.mediaSyncState();
    if (!state) return 0;
    return state.items.filter(item => item.server).length;
  }

  getLocalFileCount(): number {
    const state = this.mediaSyncState();
    if (!state) return 0;
    return state.items.filter(item => item.local).length;
  }
}
