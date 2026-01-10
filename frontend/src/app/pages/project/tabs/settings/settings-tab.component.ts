import { Tab, TabList, Tabs } from '@angular/aria/tabs';
import { DatePipe } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { CollaborationService as CollaborationApiService } from '@inkweld/api/collaboration.service';
import { MCPKeysService } from '@inkweld/api/mcp-keys.service';
import {
  Collaborator,
  CollaboratorRole,
  CreateMcpKeyRequest,
  InvitationStatus,
  McpPermission,
  McpPublicKey,
} from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
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
    MatTooltipModule,
    RelationshipsTabComponent,
    Tab,
    TabList,
    Tabs,
    TagsTabComponent,
    TemplatesTabComponent,
  ],
})
export class SettingsTabComponent implements AfterViewInit {
  @ViewChild('tabNavBar') tabNavBar!: ElementRef<HTMLElement>;

  // Active tab tracking
  protected readonly selectedTab = signal('sync');

  // Scroll state for arrow visibility
  protected readonly canScrollLeft = signal(false);
  protected readonly canScrollRight = signal(false);
  protected readonly projectState = inject(ProjectStateService);
  private readonly mcpKeysService = inject(MCPKeysService);
  private readonly collaborationService = inject(CollaborationApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly setupService = inject(SetupService);
  private readonly mediaSyncService = inject(MediaSyncService);
  private readonly systemConfigService = inject(SystemConfigService);

  // MCP Keys should only be visible when AI kill switch is OFF
  protected readonly isAiKillSwitchEnabled =
    this.systemConfigService.isAiKillSwitchEnabled;
  private readonly dialog = inject(MatDialog);

  // Current mode (server or offline)
  protected readonly currentMode = this.setupService.getMode();

  // MCP Keys state
  protected readonly mcpKeys = signal<McpPublicKey[]>([]);
  protected readonly isLoadingKeys = signal(true);
  protected readonly keysError = signal<string | null>(null);

  // Reset local data state
  protected readonly isResettingLocalData = signal(false);

  // Collaboration state
  protected readonly collaborators = signal<Collaborator[]>([]);
  protected readonly isLoadingCollaborators = signal(true);
  protected readonly collaboratorsError = signal<string | null>(null);
  protected readonly showInviteForm = signal(false);
  protected readonly isInviting = signal(false);
  inviteUsername = '';
  inviteRole: CollaboratorRole = CollaboratorRole.Viewer;

  // Role options for dropdown
  protected readonly roleOptions = [
    {
      value: CollaboratorRole.Viewer,
      label: 'Viewer',
      description: 'Can view project content',
    },
    {
      value: CollaboratorRole.Editor,
      label: 'Editor',
      description: 'Can view and edit content',
    },
    {
      value: CollaboratorRole.Admin,
      label: 'Admin',
      description: 'Full access including settings',
    },
  ];

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

  // Media sync state
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
        void this.loadCollaborators();
      }
    });

    // Watch for tab changes and update scroll state
    effect(() => {
      this.selectedTab();
      setTimeout(() => this.updateScrollState(), 0);
    });
  }

  ngAfterViewInit(): void {
    this.updateScrollState();
    setTimeout(() => this.scrollToActiveTab(), 0);
  }

  /** Check if scroll arrows should be visible */
  updateScrollState(): void {
    const el = this.tabNavBar?.nativeElement;
    if (!el) return;

    const canLeft = el.scrollLeft > 0;
    const canRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;

    this.canScrollLeft.set(canLeft);
    this.canScrollRight.set(canRight);
  }

  /** Handle scroll event on the tab nav bar */
  onTabsScroll(): void {
    this.updateScrollState();
  }

  /** Scroll tabs left */
  scrollLeft(): void {
    const el = this.tabNavBar?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: -150, behavior: 'smooth' });
  }

  /** Scroll tabs right */
  scrollRight(): void {
    const el = this.tabNavBar?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: 150, behavior: 'smooth' });
  }

  /** Scroll to make the active tab visible */
  scrollToActiveTab(): void {
    const container = this.tabNavBar?.nativeElement;
    if (!container) return;

    const activeTabButton = container.querySelector(
      '[aria-selected="true"]'
    ) as HTMLElement;
    if (!activeTabButton) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTabButton.getBoundingClientRect();

    if (tabRect.left < containerRect.left) {
      const scrollAmount = tabRect.left - containerRect.left - 8;
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    } else if (tabRect.right > containerRect.right) {
      const scrollAmount = tabRect.right - containerRect.right + 8;
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }

    setTimeout(() => this.updateScrollState(), 150);
  }

  /** Handle tab selection change */
  onTabChange(tabId: string): void {
    this.selectedTab.set(tabId);
    setTimeout(() => this.scrollToActiveTab(), 0);
  }

  // =====================
  // MCP Keys Management
  // =====================

  async loadMcpKeys(): Promise<void> {
    const project = this.projectState.project();
    // MCP keys are owner-only (not available to editors or viewers)
    if (
      !project ||
      this.currentMode !== 'server' ||
      !this.projectState.isOwner()
    ) {
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
  // Collaboration
  // =====================

  async loadCollaborators(): Promise<void> {
    const project = this.projectState.project();
    if (!project || this.currentMode !== 'server') {
      this.collaborators.set([]);
      this.isLoadingCollaborators.set(false);
      return;
    }

    this.isLoadingCollaborators.set(true);
    this.collaboratorsError.set(null);

    try {
      const collabs = await firstValueFrom(
        this.collaborationService.listCollaborators(
          project.username,
          project.slug
        )
      );
      this.collaborators.set(collabs);
    } catch (error) {
      console.error('Failed to load collaborators:', error);
      this.collaboratorsError.set('Failed to load collaborators');
    } finally {
      this.isLoadingCollaborators.set(false);
    }
  }

  toggleInviteForm(): void {
    this.showInviteForm.update(show => !show);
    if (!this.showInviteForm()) {
      this.resetInviteForm();
    }
  }

  resetInviteForm(): void {
    this.inviteUsername = '';
    this.inviteRole = CollaboratorRole.Viewer;
  }

  async inviteCollaborator(): Promise<void> {
    const project = this.projectState.project();
    if (!project || !this.inviteUsername.trim()) {
      return;
    }

    this.isInviting.set(true);

    try {
      const collaborator = await firstValueFrom(
        this.collaborationService.inviteCollaborator(
          project.username,
          project.slug,
          { username: this.inviteUsername.trim(), role: this.inviteRole }
        )
      );

      this.collaborators.update(collabs => [...collabs, collaborator]);
      this.snackBar.open(
        `Invited ${this.inviteUsername} as ${this.inviteRole}`,
        'Close',
        {
          duration: 3000,
        }
      );
      this.resetInviteForm();
      this.showInviteForm.set(false);
    } catch (error) {
      console.error('Failed to invite collaborator:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to invite collaborator';
      this.snackBar.open(message, 'Close', { duration: 5000 });
    } finally {
      this.isInviting.set(false);
    }
  }

  async updateCollaboratorRole(
    collaborator: Collaborator,
    newRole: CollaboratorRole
  ): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    try {
      await firstValueFrom(
        this.collaborationService.updateCollaborator(
          project.username,
          project.slug,
          collaborator.userId,
          { role: newRole }
        )
      );

      this.collaborators.update(collabs =>
        collabs.map(c =>
          c.userId === collaborator.userId ? { ...c, role: newRole } : c
        )
      );

      this.snackBar.open(
        `Updated ${collaborator.username}'s role to ${newRole}`,
        'Close',
        {
          duration: 3000,
        }
      );
    } catch (error) {
      console.error('Failed to update collaborator:', error);
      this.snackBar.open('Failed to update role', 'Close', { duration: 3000 });
    }
  }

  async removeCollaborator(collaborator: Collaborator): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    try {
      await firstValueFrom(
        this.collaborationService.removeCollaborator(
          project.username,
          project.slug,
          collaborator.userId
        )
      );

      this.collaborators.update(collabs =>
        collabs.filter(c => c.userId !== collaborator.userId)
      );

      this.snackBar.open(
        `Removed ${collaborator.username} from project`,
        'Close',
        {
          duration: 3000,
        }
      );
    } catch (error) {
      console.error('Failed to remove collaborator:', error);
      this.snackBar.open('Failed to remove collaborator', 'Close', {
        duration: 3000,
      });
    }
  }

  getActiveCollaboratorsCount(): number {
    return this.collaborators().filter(
      c => c.status === InvitationStatus.Accepted
    ).length;
  }

  getPendingInvitationsCount(): number {
    return this.collaborators().filter(
      c => c.status === InvitationStatus.Pending
    ).length;
  }

  getRoleIcon(role: CollaboratorRole): string {
    switch (role) {
      case CollaboratorRole.Viewer:
        return 'visibility';
      case CollaboratorRole.Editor:
        return 'edit';
      case CollaboratorRole.Admin:
        return 'admin_panel_settings';
      default:
        return 'person';
    }
  }

  // =====================
  // Reset Local Data
  // =====================

  /**
   * Reset all local IndexedDB data for this project.
   * This will close connections, delete local databases, and reload the project.
   */
  async resetLocalData(): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    const username = project.username;
    const slug = project.slug;
    const _projectKey = `${username}/${slug}`;

    // Confirm with user
    const confirmed = window.confirm(
      `This will delete all locally cached data for "${project.title}" and re-download from the server.\n\n` +
        `This can fix sync issues but any unsynced local changes will be lost.\n\n` +
        `Continue?`
    );

    if (!confirmed) return;

    this.isResettingLocalData.set(true);

    try {
      // Get all IndexedDB databases
      const databases = await this.getProjectDatabases(username, slug);

      // Delete each database
      for (const dbName of databases) {
        await this.deleteDatabase(dbName);
      }

      // Also clear media for this project
      // The media service stores in 'inkweld-media' with keys like 'projectKey:mediaId'
      // We'll let the project reload handle re-downloading

      this.snackBar.open(`Local data cleared. Reloading project...`, 'Close', {
        duration: 3000,
      });

      // Reload the page to force fresh load from server
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Failed to reset local data:', error);
      this.snackBar.open('Failed to reset local data', 'Close', {
        duration: 5000,
      });
      this.isResettingLocalData.set(false);
    }
  }

  /**
   * Get all IndexedDB databases that belong to this project.
   * y-indexeddb creates databases named after the document ID.
   */
  private async getProjectDatabases(
    username: string,
    slug: string
  ): Promise<string[]> {
    const projectPrefix = `${username}:${slug}`;
    const worldbuildingPrefix = `worldbuilding:${username}:${slug}`;
    const databases: string[] = [];

    // Try to get all databases (not supported in all browsers)
    if ('databases' in indexedDB) {
      try {
        const allDbs = await indexedDB.databases();
        for (const db of allDbs) {
          if (
            db.name &&
            (db.name.startsWith(projectPrefix) ||
              db.name.startsWith(worldbuildingPrefix))
          ) {
            databases.push(db.name);
          }
        }
      } catch {
        // Fall through to known patterns
      }
    }

    // If we couldn't enumerate, try known patterns
    if (databases.length === 0) {
      // Known document patterns:
      // - {username}:{slug}:elements (element tree)
      // - {username}:{slug}:elements/ (element tree with trailing slash)
      // - {username}:{slug}:doc:{elementId} (individual documents)
      // - worldbuilding:{username}:{slug}:{elementId} (worldbuilding data per element)
      databases.push(`${projectPrefix}:elements`);
      databases.push(`${projectPrefix}:elements/`);

      // Try to get element IDs from current state
      const elements = this.projectState.elements();
      for (const element of elements) {
        databases.push(`${projectPrefix}:doc:${element.id}`);
        databases.push(`${worldbuildingPrefix}:${element.id}`);
      }
    }

    return databases;
  }

  /**
   * Delete a single IndexedDB database
   */
  private deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(new Error(`Failed to delete database: ${name}`));
      request.onblocked = () => {
        // Database is blocked, but we'll resolve anyway
        console.warn(`Database ${name} delete was blocked`);
        resolve();
      };
    });
  }

  // =====================
  // Media Sync
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
