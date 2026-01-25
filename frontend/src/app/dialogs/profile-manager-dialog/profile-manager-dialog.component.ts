import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Project, ProjectsService } from '@inkweld/index';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { SetupService } from '@services/core/setup.service';
import {
  ServerConfig,
  StorageContextService,
} from '@services/core/storage-context.service';
import {
  MigrationService,
  MigrationStatus,
} from '@services/local/migration.service';
import { firstValueFrom } from 'rxjs';

import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../confirmation-dialog/confirmation-dialog.component';

/**
 * Dialog for managing server profiles/connections.
 * Allows users to:
 * - View and switch between configured servers
 * - Add new server connections
 * - Remove existing profiles
 * - Switch to local mode
 * - Migrate local projects to a server
 */
@Component({
  selector: 'app-profile-manager-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTooltipModule,
    FormsModule,
  ],
  templateUrl: './profile-manager-dialog.component.html',
  styleUrl: './profile-manager-dialog.component.scss',
})
export class ProfileManagerDialogComponent {
  private storageContext = inject(StorageContextService);
  private authTokenService = inject(AuthTokenService);
  private setupService = inject(SetupService);
  private migrationService = inject(MigrationService);
  private projectsService = inject(ProjectsService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  // View state
  protected currentView = signal<'list' | 'add' | 'add-local' | 'migrate'>(
    'list'
  );

  // Add local form
  protected localUsername = signal('');
  protected localDisplayName = signal('');
  protected localError = signal<string | null>(null);

  // Profile list
  protected profiles = computed(() => this.storageContext.getConfigurations());
  protected activeProfile = computed(() =>
    this.storageContext.getActiveConfig()
  );

  // Check if we have a local profile
  protected hasLocalProfile = computed(() =>
    this.profiles().some(p => p.type === 'local')
  );

  // Add server form
  protected newServerUrl = signal('');
  protected newServerName = signal('');
  protected isConnecting = signal(false);
  protected connectionError = signal<string | null>(null);
  protected connectionSuccess = signal(false);

  // Migration state (for local -> server transitions)
  protected migrationState = this.migrationService.migrationState;
  protected localProjectsCount = computed(() =>
    this.migrationService.getLocalProjectsCount()
  );
  protected localProjects = computed(() =>
    this.migrationService.getLocalProjects()
  );
  protected selectedProjectSlugs = signal<Set<string>>(new Set());

  // Slug conflict tracking - maps original slug to server conflict status
  protected conflictingSlugs = signal<Set<string>>(new Set());
  // Maps original slug to new slug (for renaming conflicting projects)
  protected projectRenames = signal<Map<string, string>>(new Map());
  // Computed: check if any selected project has an unresolved conflict
  protected hasUnresolvedConflicts = computed(() => {
    const selected = this.selectedProjectSlugs();
    const conflicts = this.conflictingSlugs();
    const renames = this.projectRenames();

    for (const slug of selected) {
      if (conflicts.has(slug)) {
        const newSlug = renames.get(slug);
        // Has conflict and either no rename or rename also conflicts
        if (!newSlug || conflicts.has(newSlug)) {
          return true;
        }
      }
    }
    return false;
  });

  protected allProjectsSelected = computed(() => {
    const projects = this.localProjects();
    const selected = this.selectedProjectSlugs();
    return projects.length > 0 && projects.every(p => selected.has(p.slug));
  });
  protected someProjectsSelected = computed(() => {
    const selected = this.selectedProjectSlugs();
    return selected.size > 0 && !this.allProjectsSelected();
  });
  protected migrationProgress = computed(() => {
    const state = this.migrationState();
    if (state.totalProjects === 0) return 0;
    return (state.completedProjects / state.totalProjects) * 100;
  });

  // Auth form for migration
  protected showAuthForm = signal(false);
  protected isAuthenticated = signal(false); // Whether user has authenticated in this flow
  protected authMode = signal<'login' | 'register'>('register');
  protected username = signal('');
  protected password = signal('');
  protected confirmPassword = signal('');
  protected authError = signal<string | null>(null);
  protected isAuthenticating = signal(false);
  protected isCheckingConflicts = signal(false);
  protected isMigrating = signal(false); // Separate flag for migration phase

  // Expose enum for template
  protected readonly MigrationStatus = MigrationStatus;

  // Pending server URL for migration
  private pendingServerUrl = '';

  /**
   * Check if a profile has stored auth credentials
   */
  hasAuthForProfile(profile: ServerConfig): boolean {
    return this.authTokenService.hasTokenForConfig(profile.id);
  }

  /**
   * Get display info for a profile
   */
  getProfileInfo(profile: ServerConfig): {
    name: string;
    subtitle: string;
    icon: string;
    isActive: boolean;
  } {
    const isActive = profile.id === this.activeProfile()?.id;

    if (profile.type === 'local') {
      return {
        name: profile.displayName ?? 'Local Mode',
        subtitle: profile.userProfile?.username ?? 'Offline',
        icon: 'computer',
        isActive,
      };
    }

    // Extract hostname for subtitle
    let hostname = '';
    try {
      hostname = new URL(profile.serverUrl!).hostname;
    } catch {
      hostname = profile.serverUrl ?? '';
    }

    return {
      name: profile.displayName ?? hostname,
      subtitle: hostname,
      icon: 'cloud',
      isActive,
    };
  }

  /**
   * Switch to a different profile
   */
  async switchToProfile(profile: ServerConfig): Promise<void> {
    if (profile.id === this.activeProfile()?.id) {
      return; // Already on this profile
    }

    // Check if switching to server profile without auth
    if (profile.type === 'server' && !this.hasAuthForProfile(profile)) {
      // Will need to login after switch
      const confirmed = await this.confirmAction(
        'Login Required',
        `You'll need to log in to ${profile.displayName ?? 'this server'} after switching.`,
        'Switch & Login'
      );
      if (!confirmed) return;
    }

    this.storageContext.switchToConfig(profile.id);
    // Navigate to home - the current project URL won't exist in the new profile context
    window.location.href = '/';
  }

  /**
   * Start adding a new server
   */
  showAddServer(): void {
    this.currentView.set('add');
    this.resetAddServerForm();
  }

  /**
   * Cancel adding server and return to list
   */
  cancelAddServer(): void {
    this.currentView.set('list');
    this.resetAddServerForm();
  }

  /**
   * Reset the add server form
   */
  private resetAddServerForm(): void {
    this.newServerUrl.set('');
    this.newServerName.set('');
    this.connectionError.set(null);
    this.connectionSuccess.set(false);
    this.isConnecting.set(false);
  }

  /**
   * Test connection to a server
   */
  async testConnection(): Promise<void> {
    const url = this.newServerUrl().trim();
    if (!url) {
      this.connectionError.set('Please enter a server URL');
      return;
    }

    this.isConnecting.set(true);
    this.connectionError.set(null);
    this.connectionSuccess.set(false);

    try {
      const response = await fetch(`${url}/api/v1/health`);
      if (response.ok) {
        this.connectionSuccess.set(true);
        this.snackBar.open('Connection successful!', 'Close', {
          duration: 3000,
        });
      } else {
        this.connectionError.set('Server is not responding correctly');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      // Detect CORS errors - they typically show as TypeError with no response
      if (
        error instanceof TypeError &&
        error.message.includes('Failed to fetch')
      ) {
        // This could be CORS or network error - provide helpful message
        this.connectionError.set(
          'Connection failed. If the server is running, it may need to add this origin to its CORS allowed list.'
        );
      } else {
        this.connectionError.set('Failed to connect to server');
      }
    } finally {
      this.isConnecting.set(false);
    }
  }

  /**
   * Add a new server profile
   */
  addServer(): void {
    const url = this.newServerUrl().trim();
    if (!url) {
      this.connectionError.set('Please enter a server URL');
      return;
    }

    // Check if we have local projects to migrate
    const hasLocalProjects = this.migrationService.hasLocalProjects();
    const isCurrentlyLocal = this.setupService.getMode() === 'local';

    if (isCurrentlyLocal && hasLocalProjects) {
      // Need to migrate - show auth form
      this.pendingServerUrl = url;
      this.currentView.set('migrate');
      this.showAuthForm.set(true);
      return;
    }

    // No migration needed - just add the server
    this.isConnecting.set(true);
    this.connectionError.set(null);

    try {
      // Add the new server configuration
      const displayName = this.newServerName().trim() || undefined;
      this.storageContext.addServerConfig(url, displayName);

      // Switch to the new server
      const configs = this.storageContext.getConfigurations();
      const newConfig = configs.find(
        c => c.type === 'server' && c.serverUrl === url
      );

      if (newConfig) {
        this.storageContext.switchToConfig(newConfig.id);
        // Navigate to home - the current project URL won't exist in the new profile context
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Failed to add server:', error);
      this.connectionError.set('Failed to add server. Please try again.');
    } finally {
      this.isConnecting.set(false);
    }
  }

  /**
   * Remove a profile
   */
  async removeProfile(profile: ServerConfig): Promise<void> {
    if (profile.id === this.activeProfile()?.id) {
      this.snackBar.open(
        'Cannot remove the active profile. Switch to another first.',
        'Close',
        { duration: 4000 }
      );
      return;
    }

    const confirmed = await this.confirmAction(
      'Remove Profile?',
      `Remove "${profile.displayName ?? profile.serverUrl ?? 'Local Mode'}" from your profiles? This won't delete any data on the server.`,
      'Remove'
    );

    if (!confirmed) return;

    this.storageContext.removeConfig(profile.id);
    // Also clear any stored auth token
    this.authTokenService.clearTokenForConfig(profile.id);

    this.snackBar.open('Profile removed', 'Close', { duration: 3000 });
  }

  /**
   * Show the add local mode form
   */
  showAddLocalMode(): void {
    this.currentView.set('add-local');
    this.resetAddLocalForm();
  }

  /**
   * Cancel adding local mode and return to list
   */
  cancelAddLocal(): void {
    this.currentView.set('list');
    this.resetAddLocalForm();
  }

  /**
   * Reset the add local form
   */
  private resetAddLocalForm(): void {
    this.localUsername.set('');
    this.localDisplayName.set('');
    this.localError.set(null);
  }

  /**
   * Add local mode profile and switch to it
   */
  addLocalMode(): void {
    const username = this.localUsername().trim();
    const displayName = this.localDisplayName().trim() || username;

    if (!username) {
      this.localError.set('Please enter a username');
      return;
    }

    // Validate username format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      this.localError.set(
        'Username can only contain letters, numbers, hyphens, and underscores'
      );
      return;
    }

    try {
      // Add local config (this keeps existing server configs)
      this.setupService.configureLocalMode({ name: displayName, username });

      // Navigate to home - the current project URL won't exist in the new profile context
      window.location.href = '/';
    } catch (error) {
      console.error('Failed to add local mode:', error);
      this.localError.set('Failed to add local mode. Please try again.');
    }
  }

  /**
   * Switch to local mode (for existing local profile)
   */
  async switchToLocalMode(): Promise<void> {
    const configs = this.storageContext.getConfigurations();
    const localConfig = configs.find(c => c.type === 'local');

    if (localConfig) {
      // Just switch to existing local config
      await this.switchToProfile(localConfig);
    } else {
      // Show form to create local profile
      this.showAddLocalMode();
    }
  }

  // ============ Migration Methods ============

  /**
   * Cancel migration and return to list
   */
  cancelMigration(): void {
    this.currentView.set('list');
    this.resetMigrationForm();
  }

  /**
   * Reset migration form state
   */
  private resetMigrationForm(): void {
    this.showAuthForm.set(false);
    this.isAuthenticated.set(false);
    this.username.set('');
    this.password.set('');
    this.confirmPassword.set('');
    this.authError.set(null);
    this.isAuthenticating.set(false);
    this.isMigrating.set(false);
    this.isCheckingConflicts.set(false);
    this.pendingServerUrl = '';
    this.selectedProjectSlugs.set(new Set());
    this.conflictingSlugs.set(new Set());
    this.projectRenames.set(new Map());
  }

  /**
   * Toggle selection of a single project
   */
  toggleProjectSelection(project: Project): void {
    const current = new Set(this.selectedProjectSlugs());
    if (current.has(project.slug)) {
      current.delete(project.slug);
    } else {
      current.add(project.slug);
    }
    this.selectedProjectSlugs.set(current);
  }

  /**
   * Toggle selection of all projects
   */
  toggleAllProjects(): void {
    if (this.allProjectsSelected()) {
      // Deselect all
      this.selectedProjectSlugs.set(new Set());
    } else {
      // Select all
      const allSlugs = this.localProjects().map(p => p.slug);
      this.selectedProjectSlugs.set(new Set(allSlugs));
    }
  }

  /**
   * Check if a project is selected
   */
  isProjectSelected(project: Project): boolean {
    return this.selectedProjectSlugs().has(project.slug);
  }

  /**
   * Toggle between login and register modes
   */
  toggleAuthMode(): void {
    this.authMode.set(this.authMode() === 'login' ? 'register' : 'login');
    this.authError.set(null);
  }

  /**
   * Handle authentication (step 1 of migration flow)
   * After successful auth, fetches server projects and shows migration table
   */
  async authenticate(): Promise<void> {
    const usernameValue = this.username();
    const passwordValue = this.password();
    const confirmPasswordValue = this.confirmPassword();

    // Validation
    if (!usernameValue || !passwordValue) {
      this.authError.set('Please enter username and password');
      return;
    }

    if (
      this.authMode() === 'register' &&
      passwordValue !== confirmPasswordValue
    ) {
      this.authError.set('Passwords do not match');
      return;
    }

    this.isAuthenticating.set(true);
    this.authError.set(null);

    try {
      // Configure server mode first
      await this.setupService.configureServerMode(this.pendingServerUrl);

      // Register or login
      if (this.authMode() === 'register') {
        await this.migrationService.registerOnServer(
          usernameValue,
          passwordValue
        );
      } else {
        await this.migrationService.loginToServer(usernameValue, passwordValue);
      }

      // Auth successful - mark as authenticated
      this.isAuthenticated.set(true);
      this.showAuthForm.set(false);

      // Now check for slug conflicts with server projects
      await this.checkSlugConflicts();

      // Select all projects by default
      const allSlugs = this.localProjects().map(p => p.slug);
      this.selectedProjectSlugs.set(new Set(allSlugs));

      this.snackBar.open(
        'Authenticated successfully! Select projects to migrate.',
        'Close',
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Authentication failed:', error);
      this.authError.set(
        error instanceof Error
          ? error.message
          : 'Authentication failed. Please try again.'
      );
    } finally {
      this.isAuthenticating.set(false);
    }
  }

  /**
   * Handle migration (step 2 of migration flow)
   * Called after user has authenticated and selected projects
   */
  async migrateProjects(): Promise<void> {
    const selectedSlugs = Array.from(this.selectedProjectSlugs());

    // Check if there are unresolved conflicts
    if (this.hasUnresolvedConflicts()) {
      this.authError.set(
        'Please resolve slug conflicts before migrating. Rename conflicting projects or deselect them.'
      );
      return;
    }

    this.isMigrating.set(true);
    this.authError.set(null);

    try {
      if (selectedSlugs.length > 0) {
        // Build slug renames map for migration
        const renames = this.projectRenames();
        await this.migrationService.migrateToServer(
          this.pendingServerUrl,
          selectedSlugs,
          renames.size > 0 ? renames : undefined
        );

        // Handle results
        const state = this.migrationState();

        if (state.status === MigrationStatus.Completed) {
          this.snackBar.open(
            `Successfully migrated ${state.completedProjects} project(s)!`,
            'Close',
            { duration: 5000 }
          );

          // Clean up migrated project data only
          this.migrationService.cleanupLocalData(selectedSlugs);
        } else if (state.status === MigrationStatus.Failed) {
          this.snackBar.open(
            `Migration completed with errors. ${state.completedProjects} succeeded, ${state.failedProjects} failed.`,
            'Close',
            { duration: 7000 }
          );
        }
      } else {
        // No projects selected - just connect to server
        this.snackBar.open(
          'Connected to server. Local projects remain on this device.',
          'Close',
          { duration: 4000 }
        );
      }

      // Navigate to home after migration
      setTimeout(() => {
        window.location.href = '/';
      }, 1000);
    } catch (error) {
      console.error('Migration failed:', error);
      this.authError.set(
        error instanceof Error
          ? error.message
          : 'Migration failed. Please try again.'
      );
    } finally {
      this.isMigrating.set(false);
    }
  }

  // ============ Helper Methods ============

  /**
   * Show confirmation dialog
   */
  private async confirmAction(
    title: string,
    message: string,
    confirmText: string
  ): Promise<boolean> {
    const dialogRef = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, {
      width: '450px',
      data: {
        title,
        message,
        confirmText,
        cancelText: 'Cancel',
      },
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    return result === true;
  }

  // ============ Slug Conflict Methods ============

  /**
   * Check if a project has a slug conflict with server
   */
  hasSlugConflict(project: Project): boolean {
    return this.conflictingSlugs().has(project.slug);
  }

  /**
   * Get the renamed slug for a project (or original if not renamed)
   */
  getProjectSlug(project: Project): string {
    return this.projectRenames().get(project.slug) ?? project.slug;
  }

  /**
   * Update the renamed slug for a project
   */
  updateProjectSlug(project: Project, newSlug: string): void {
    const renames = new Map(this.projectRenames());
    if (newSlug && newSlug !== project.slug) {
      renames.set(project.slug, newSlug);
    } else {
      renames.delete(project.slug);
    }
    this.projectRenames.set(renames);
  }

  /**
   * Check for slug conflicts with existing server projects
   */
  private async checkSlugConflicts(): Promise<void> {
    this.isCheckingConflicts.set(true);

    try {
      // Fetch existing projects from server
      const serverProjects = await firstValueFrom(
        this.projectsService.listUserProjects()
      );
      const serverSlugs = new Set(serverProjects.map(p => p.slug));

      // Check which local projects have conflicting slugs
      const conflicts = new Set<string>();
      for (const project of this.localProjects()) {
        if (serverSlugs.has(project.slug)) {
          conflicts.add(project.slug);
        }
      }

      this.conflictingSlugs.set(conflicts);

      // Show warning if there are conflicts
      if (conflicts.size > 0) {
        this.snackBar.open(
          `${conflicts.size} project(s) have slug conflicts. Please rename them before migrating.`,
          'Close',
          { duration: 5000 }
        );
      }
    } catch (error) {
      console.error('Failed to check slug conflicts:', error);
      // Don't block migration if we can't check conflicts
      // The server will return 409 anyway
    } finally {
      this.isCheckingConflicts.set(false);
    }
  }

  /**
   * Validate a new slug format
   */
  isValidSlug(slug: string): boolean {
    // Slug must be lowercase alphanumeric with hyphens, 3-50 chars
    return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug);
  }

  /**
   * Check if a new slug would also conflict
   */
  wouldSlugConflict(newSlug: string): boolean {
    return this.conflictingSlugs().has(newSlug);
  }
}
