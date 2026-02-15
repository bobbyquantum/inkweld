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
import { Router } from '@angular/router';
import {
  CreateMcpKeyDialogComponent,
  CreateMcpKeyDialogResult,
} from '@dialogs/create-mcp-key-dialog/create-mcp-key-dialog.component';
import { CollaborationService as CollaborationApiService } from '@inkweld/api/collaboration.service';
import { MCPKeysService } from '@inkweld/api/mcp-keys.service';
import { ProjectsService } from '@inkweld/api/projects.service';
import {
  Collaborator,
  CollaboratorCollaboratorType,
  CollaboratorRole,
  InvitationStatus,
  McpPublicKey,
} from '@inkweld/index';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { SettingsService } from '@services/core/settings.service';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { MediaSyncService } from '@services/local/media-sync.service';
import { UnifiedProjectService } from '@services/local/unified-project.service';
import { ProjectExportService } from '@services/project/project-export.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { firstValueFrom } from 'rxjs';

import {
  createDefaultPublishPlan,
  PublishPlan,
} from '../../../../models/publish-plan';
import { RelationshipsTabComponent } from '../relationships/relationships-tab.component';
import { TagsTabComponent } from '../tags/tags-tab.component';
import { TemplatesTabComponent } from '../templates/templates-tab.component';

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
  private readonly projectsService = inject(ProjectsService);
  private readonly projectService = inject(UnifiedProjectService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly setupService = inject(SetupService);
  private readonly mediaSyncService = inject(MediaSyncService);
  private readonly systemConfigService = inject(SystemConfigService);
  private readonly exportService = inject(ProjectExportService);
  private readonly settingsService = inject(SettingsService);

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

  // Danger zone: project rename state
  protected readonly showRenameForm = signal(false);
  protected readonly isRenaming = signal(false);
  protected readonly renameError = signal<string | null>(null);
  protected newProjectSlug = '';

  // Danger zone: project delete state
  protected readonly isDeleting = signal(false);

  // Collaboration state
  protected readonly collaborators = signal<Collaborator[]>([]);
  protected readonly isLoadingCollaborators = signal(true);
  protected readonly collaboratorsError = signal<string | null>(null);
  protected readonly showInviteForm = signal(false);

  // Computed signals for filtering human collaborators vs OAuth apps
  protected readonly humanCollaborators = computed(() =>
    this.collaborators().filter(
      c => c.collaboratorType !== CollaboratorCollaboratorType.OauthApp
    )
  );
  protected readonly oauthAppCollaborators = computed(() =>
    this.collaborators().filter(
      c => c.collaboratorType === CollaboratorCollaboratorType.OauthApp
    )
  );
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

  // Helper for template date comparisons
  protected readonly currentTime = () => Date.now();

  // Newly created key (shown once)
  protected readonly newlyCreatedKey = signal<string | null>(null);

  // Media sync state
  protected readonly projectKey = computed(() => {
    const project = this.projectState.project();
    if (!project) return null;
    return `${project.username}/${project.slug}`;
  });

  /**
   * Reactive sync state that automatically updates when background syncs
   * (periodic, WebSocket, initial) modify the MediaSyncService's internal state.
   */
  protected readonly mediaSyncState = computed(() => {
    const key = this.projectKey();
    if (!key) return null;
    return this.mediaSyncService.getSyncState(key)();
  });

  constructor() {
    // Watch for project changes and trigger initial sync status check
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

  openCreateKeyDialog(): void {
    const dialogRef = this.dialog.open(CreateMcpKeyDialogComponent, {
      panelClass: 'create-mcp-key-dialog',
      width: '520px',
    });

    dialogRef.afterClosed().subscribe((result: CreateMcpKeyDialogResult) => {
      if (result) {
        this.newlyCreatedKey.set(result.fullKey);
        this.mcpKeys.update(keys => [...keys, result.key]);
      }
    });
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

  getMcpEndpointUrl(): string {
    const serverUrl = this.setupService.getServerUrl() || '';
    return `${serverUrl}/api/v1/ai/mcp`;
  }

  copyMcpUrl(): void {
    const url = this.getMcpEndpointUrl();
    navigator.clipboard.writeText(url).then(
      () => {
        this.snackBar.open('MCP endpoint URL copied to clipboard', 'Close', {
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

  async openAuthorizedAppsSettings(): Promise<void> {
    await this.dialogGateway.openUserSettingsDialog('authorized-apps');
    // Reload collaborators after returning from settings, as grants may have changed
    void this.loadCollaborators();
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
      await this.mediaSyncService.checkSyncStatus(key);
      // No need to set state — mediaSyncState is a computed that reads
      // directly from the service's reactive signal
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
      // Re-check status to update counts (downloads don't update item list)
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
      // Re-check status to update counts
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

  // =====================
  // Danger Zone Methods
  // =====================

  /**
   * Check if the entered slug is valid
   */
  isValidSlug(): boolean {
    const slug = this.newProjectSlug.trim();
    if (!slug || slug.length < 3) return false;
    if (!/^[a-z0-9-]+$/.test(slug)) return false;

    // Check it's different from current slug
    const project = this.projectState.project();
    if (project && slug === project.slug) return false;

    return true;
  }

  /**
   * Cancel the rename form
   */
  cancelRename(): void {
    this.showRenameForm.set(false);
    this.newProjectSlug = '';
    this.renameError.set(null);
  }

  /**
   * Rename the project (change its slug)
   */
  async renameProject(): Promise<void> {
    const project = this.projectState.project();
    if (!project || !this.isValidSlug()) return;

    const newSlug = this.newProjectSlug.trim();
    const oldSlug = project.slug;

    this.isRenaming.set(true);
    this.renameError.set(null);

    try {
      // Call the API to rename the project
      await firstValueFrom(
        this.projectsService.updateProject(project.username, oldSlug, {
          slug: newSlug,
        })
      );

      this.snackBar.open(
        `Project renamed to "${newSlug}". Redirecting...`,
        'Close',
        { duration: 3000 }
      );

      // Navigate to the new URL
      setTimeout(() => {
        void this.router.navigate(['/', project.username, newSlug, 'settings']);
        // Reload to ensure all state is refreshed
        window.location.href = `/${project.username}/${newSlug}/settings`;
      }, 1000);
    } catch (error) {
      console.error('Failed to rename project:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'A project with this slug may already exist';
      this.renameError.set(message);
    } finally {
      this.isRenaming.set(false);
    }
  }

  /**
   * Delete the project
   */
  async deleteProject(): Promise<void> {
    const project = this.projectState.project();
    if (!project) return;

    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete Project',
      message: `To confirm deletion, please type the project slug "${project.slug}" below. This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      requireConfirmationText: project.slug,
    });

    if (!confirmed) return;

    this.isDeleting.set(true);

    try {
      await this.projectService.deleteProject(project.username, project.slug);

      this.snackBar.open('Project deleted successfully', 'Close', {
        duration: 3000,
      });

      // Navigate to home
      void this.router.navigate(['/']);
    } catch (error) {
      console.error('Failed to delete project:', error);
      this.snackBar.open('Failed to delete project', 'Close', {
        duration: 5000,
      });
    } finally {
      this.isDeleting.set(false);
    }
  }

  // =====================
  // Project Actions
  // =====================

  /**
   * Export the current project as an .inkweld.zip archive.
   */
  async exportProject(): Promise<void> {
    try {
      await this.exportService.exportProject();
      this.snackBar.open('Project exported successfully', 'Close', {
        duration: 3000,
      });
    } catch (error) {
      console.error('Export failed:', error);
      this.snackBar.open('Failed to export project', 'Close', {
        duration: 5000,
      });
    }
  }

  /**
   * Open the import project dialog.
   */
  importProject(): void {
    const project = this.projectState.project();
    void this.dialogGateway
      .openImportProjectDialog(project?.username)
      .then(result => {
        if (result?.success && result.slug) {
          this.snackBar
            .open('Project imported successfully!', 'View', {
              duration: 5000,
            })
            .onAction()
            .subscribe(() => {
              const username = project?.username ?? 'offline';
              void this.router.navigate(['/', username, result.slug]);
            });
        }
      });
  }

  /**
   * Open or create a publish plan and navigate to it.
   */
  openPublishPlan(): void {
    const project = this.projectState.project();
    if (!project) return;

    const plans = this.projectState.getPublishPlans();
    let plan: PublishPlan;

    if (plans.length > 0) {
      plan = plans[0];
    } else {
      plan = createDefaultPublishPlan(project.title, project.username);
      this.projectState.createPublishPlan(plan);
    }

    this.projectState.openPublishPlan(plan);

    void this.router.navigate([
      '/',
      project.username,
      project.slug,
      'publish-plan',
      plan.id,
    ]);
  }

  /**
   * Navigate to the document list view.
   */
  showDocumentList(): void {
    const result = this.projectState.openSystemTab('documents-list');
    this.projectState.selectTab(result.index);
    const project = this.projectState.project();
    if (project) {
      void this.router.navigate([
        '/',
        project.username,
        project.slug,
        'documents-list',
      ]);
    }
  }

  /**
   * Toggle zen mode. Requires a document tab to be selected.
   */
  toggleZenMode(): void {
    if (!this.canEnableZenMode() && !this.isZenMode()) {
      return;
    }

    this.isZenMode.update(current => {
      const newValue = !current;

      const fullscreenEnabled = this.settingsService.getSetting<boolean>(
        'zenModeFullscreen',
        true
      );

      if (newValue && fullscreenEnabled) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Error attempting to enable fullscreen:', err);
        });
      } else if (!newValue && document.fullscreenElement) {
        document.exitFullscreen().catch(err => {
          console.warn('Error attempting to exit fullscreen:', err);
        });
      }

      return newValue;
    });
  }

  /**
   * Check if zen mode can be enabled (requires a document tab to be selected).
   */
  canEnableZenMode(): boolean {
    const currentTabIndex = this.projectState.selectedTabIndex();
    const tabs = this.projectState.openTabs();

    if (currentTabIndex === 0 || tabs.length === 0) {
      return false;
    }

    const currentTab = tabs[currentTabIndex - 1];

    return (
      currentTab && currentTab.type === 'document' && currentTab.element != null
    );
  }

  /**
   * Whether zen mode is currently active.
   */
  protected readonly isZenMode = signal(false);
}
