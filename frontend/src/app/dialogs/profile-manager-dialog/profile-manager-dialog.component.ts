import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { RegistrationFormComponent } from '@components/registration-form/registration-form.component';
import { TooltipAriaLabelDirective } from '@directives/tooltip-aria-label.directive';
import {
  type Project,
  ProjectsService,
  type SystemFeatures,
  type User,
} from '@inkweld/index';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { PasskeyError, PasskeyService } from '@services/auth/passkey.service';
import { AppModePolicyService } from '@services/core/app-mode-policy.service';
import { ErrorTranslationService } from '@services/core/error-translation.service';
import {
  type ProfileDestination,
  type ProfileInfo,
  ProfileManagerService,
  profileRemovalMessageKey,
  setProfileUpgradeSource,
  type StorageScan,
} from '@services/core/profile-manager.service';
import { SetupService } from '@services/core/setup.service';
import {
  type ServerConfig,
  StorageContextService,
} from '@services/core/storage-context.service';
import { BackgroundSyncService } from '@services/local/background-sync.service';
import {
  MigrationService,
  MigrationStatus,
  ServerApprovalRequiredError,
} from '@services/local/migration.service';
import { UserService } from '@services/user/user.service';
import { appUrl } from '@utils/app-base';
import { normalizeServerUrl, stripTrailingSlashes } from '@utils/string-utils';
import { firstValueFrom } from 'rxjs';

import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '../confirmation-dialog/confirmation-dialog.component';

/**
 * Dialog for managing profiles: every author identity this browser knows,
 * whether it lives in the browser, in a cloud account, or on an Inkweld
 * server.
 *
 * Users can:
 * - See which profile is active and switch between them
 * - Add a profile (via the welcome screen), or move Browser projects to a
 *   server profile with the guided migration flow
 * - Remove any profile, including the active one, deleting its data from
 *   this device
 * - Inspect what each profile stores on this device and clean up leftovers
 *   from removed profiles
 * - Reset this device completely
 */
/** Optional data: which view to open with */
export interface ProfileManagerDialogData {
  view?: 'list' | 'upgrade';
}

@Component({
  selector: 'app-profile-manager-dialog',
  imports: [
    TooltipAriaLabelDirective,
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
    MatMenuModule,
    TranslocoModule,
    RegistrationFormComponent,
  ],
  templateUrl: './profile-manager-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './profile-manager-dialog.component.scss',
})
export class ProfileManagerDialogComponent {
  private readonly storageContext = inject(StorageContextService);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly setupService = inject(SetupService);
  private readonly profileManager = inject(ProfileManagerService);
  private readonly appModePolicy = inject(AppModePolicyService);
  private readonly dialogRef = inject(
    MatDialogRef<ProfileManagerDialogComponent>
  );
  private readonly migrationService = inject(MigrationService);
  private readonly projectsService = inject(ProjectsService);
  private readonly backgroundSyncService = inject(BackgroundSyncService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);
  private readonly passkeyService = inject(PasskeyService);
  private readonly userService = inject(UserService);
  private readonly errorTranslation = inject(ErrorTranslationService);

  private readonly dialogData = inject<ProfileManagerDialogData | null>(
    MAT_DIALOG_DATA,
    { optional: true }
  );

  // View state
  protected currentView = signal<
    'list' | 'add' | 'add-local' | 'migrate' | 'upgrade'
  >(this.dialogData?.view ?? 'list');

  // Add local form
  protected localUsername = signal('');
  protected localDisplayName = signal('');
  protected localError = signal<string | null>(null);

  // Connection list (active first)
  protected profiles = computed(() =>
    this.profileManager.connections().map(c => c.config)
  );
  protected activeProfile = computed(() =>
    this.storageContext.getActiveConfig()
  );
  /**
   * Cloud storage can be added when this build offers at least one provider
   * and the home server's APP_MODE allows profiles stored in the browser
   */
  protected canAddCloud = this.appModePolicy.canAddCloudProfiles;
  /** Browser profiles can be added unless APP_MODE is ONLINE */
  protected canAddLocal = this.appModePolicy.canAddBrowserProfiles;
  /** Server profiles can be added unless APP_MODE is LOCAL */
  protected canAddServer = this.appModePolicy.canAddServerProfiles;
  /** Why some kinds of profile can't be added here, if APP_MODE says so */
  protected restrictionMessageKey = this.appModePolicy.restrictionMessageKey;

  /** The active profile as the manager describes it */
  protected activeInfo = computed(
    () => this.profileManager.activeConnection() ?? null
  );

  /**
   * Upgrade paths for the active profile, within what APP_MODE allows.
   * Browser can go to cloud storage or a server; cloud can go to a server;
   * a server profile is the top of the ladder.
   */
  protected upgradeOptions = computed(() =>
    this.appModePolicy.upgradeTargets(this.activeInfo()?.kind)
  );

  // Storage on this device (loaded on demand)
  protected showStorage = signal(false);
  protected storageScan = signal<StorageScan | null>(null);
  protected isScanning = signal(false);
  protected isBusy = signal(false);

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

  // Sync state after migration
  protected isSyncing = signal(false);
  protected syncSuccess = signal(false);
  protected syncError = signal<string | null>(null);

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
  // All slugs that exist on the server (for validating renames)
  protected serverSlugs = signal<Set<string>>(new Set());
  // Maps original slug to new slug (for renaming conflicting projects)
  protected projectRenames = signal<Map<string, string>>(new Map());
  // Computed: check if any selected project has an unresolved conflict
  protected hasUnresolvedConflicts = computed(() => {
    const selected = this.selectedProjectSlugs();
    const conflicts = this.conflictingSlugs();
    const renames = this.projectRenames();

    const serverSlugsSet = this.serverSlugs();
    for (const slug of selected) {
      if (conflicts.has(slug)) {
        const newSlug = renames.get(slug);
        // Has conflict and either no rename or rename also conflicts with server
        if (!newSlug || serverSlugsSet.has(newSlug)) {
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
  protected authError = signal<string | null>(null);
  protected isAuthenticating = signal(false);
  protected isCheckingConflicts = signal(false);
  protected isMigrating = signal(false); // Separate flag for migration phase

  // Track registration form validity for external button control
  protected registrationFormValid = signal(false);

  /**
   * The target server's public features, read when the move flow starts, so
   * the sign-in step offers what that server allows (the active profile's
   * SystemConfigService describes the Browser profile, not the target).
   * Null while loading or when the server didn't answer.
   */
  protected targetFeatures = signal<SystemFeatures | null>(null);
  protected isLoadingTargetFeatures = signal(false);
  /**
   * Password sign-in and registration. Offered when the server allows it,
   * or when its features couldn't be read and the server will decide.
   */
  protected targetPasswordLogin = computed(
    () => this.targetFeatures()?.passwordLoginEnabled ?? true
  );
  /** Passkey sign-in and registration: the server and this browser support it */
  protected targetPasskeys = computed(
    () =>
      this.passkeyService.isSupported() &&
      (this.targetFeatures()?.passkeysEnabled ?? true)
  );
  /** A new account can be created here (with a password or a passkey) */
  protected canRegisterOnTarget = computed(
    () => this.targetPasswordLogin() || this.targetPasskeys()
  );
  /**
   * Set when a passwordless account was created but its passkey isn't
   * enrolled yet (the prompt was cancelled or failed). The user can retry;
   * cancelling goes back to the Browser profile. `enrolmentToken` is the
   * short-lived token of an account that waits for approval.
   */
  protected pendingPasskeyEnrolment = signal<{
    enrolmentToken?: string;
  } | null>(null);

  // Reference to registration form component for register mode
  @ViewChild(RegistrationFormComponent)
  registrationForm?: RegistrationFormComponent;

  constructor() {
    // A server profile is talking to a server anyway: refresh the APP_MODE
    // policy. Browser and Cloud Sync profiles ask only once someone starts
    // adding a profile (upgrade choices, add server).
    if (
      this.activeProfile()?.type === 'server' ||
      this.currentView() === 'upgrade'
    ) {
      void this.appModePolicy.ready();
    }
    // Closing the dialog part-way through the move must not leave the app
    // on the target profile the sign-in switched to.
    inject(DestroyRef).onDestroy(() => {
      if (this.migrationSourceId && !this.migrationStarted) {
        void this.restoreSourceProfile();
      }
    });
  }

  // Expose enum for template
  protected readonly MigrationStatus = MigrationStatus;

  // Pending server URL for migration (exposed to template for registration form)
  protected pendingServerUrl = '';
  /** Profile that was active when the migration started (the source) */
  private migrationSourceId: string | null = null;
  /** Server profile the login landed in (the destination) */
  private migrationTargetId: string | null = null;
  /** Username the user logged in or registered with on the target server */
  private migrationUsername = '';
  /** Profiles that existed before this flow's first sign-in attempt */
  private knownProfileIds: Set<string> | null = null;
  /** Profiles this flow created, removed again if the sign-in fails */
  private readonly createdProfileIds = new Set<string>();
  /** Signed-in user before the flow touched it, put back on failure */
  private userBeforeSignIn: User | null = null;
  /** Projects started moving (or the switch completed): stay on the target */
  private migrationStarted = false;

  /**
   * Check if registration form is valid (for button disabled state)
   */
  protected isRegistrationFormValid(): boolean {
    return this.registrationFormValid();
  }

  /**
   * Handle validity change from registration form
   */
  protected onRegistrationValidityChange(valid: boolean): void {
    this.registrationFormValid.set(valid);
  }

  /**
   * Trigger submission on the registration form externally
   */
  protected triggerRegistrationSubmit(): void {
    if (this.registrationForm) {
      void this.registrationForm.submit();
    }
  }

  /**
   * Check if a profile has stored auth credentials
   */
  hasAuthForProfile(profile: ServerConfig): boolean {
    return this.authTokenService.hasTokenForConfig(profile.id);
  }

  /**
   * Get display info for a profile
   */
  getProfileInfo(profile: ServerConfig): ProfileInfo {
    return this.profileManager.describe(profile, this.activeProfile()?.id);
  }

  /** Human label for a connection kind badge */
  kindLabel(info: ProfileInfo): string {
    switch (info.kind) {
      case 'local':
        return this.transloco.translate('dialogs.profileManager.kindBrowser');
      case 'cloud':
        return this.transloco.translate('dialogs.profileManager.kindCloud');
      default:
        return this.transloco.translate('dialogs.profileManager.kindServer');
    }
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
    globalThis.location.href = appUrl('/');
  }

  /**
   * Start adding a new server
   */
  showAddServer(): void {
    if (!this.canAddServer()) return;
    // A Browser profile hasn't asked the home server yet; do it now, before
    // the form is submitted
    void this.appModePolicy.ready();
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
    const rawUrl = this.newServerUrl().trim();
    if (!rawUrl) {
      this.connectionError.set(
        this.transloco.translate('dialogs.profileManager.enterServerUrl')
      );
      return;
    }

    const url = normalizeServerUrl(rawUrl);
    this.isConnecting.set(true);
    this.connectionError.set(null);
    this.connectionSuccess.set(false);

    try {
      const response = await fetch(`${url}/api/v1/health`);
      if (response.ok) {
        // Update the input with normalized URL so user sees what will be used
        this.newServerUrl.set(url);
        this.connectionSuccess.set(true);
        this.snackBar.open(
          this.transloco.translate('dialogs.profileManager.connectionSuccess'),
          this.transloco.translate('close'),
          {
            duration: 3000,
          }
        );
      } else {
        this.connectionError.set(
          this.transloco.translate('dialogs.profileManager.serverNotResponding')
        );
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      // Detect network/CORS errors - they typically show as TypeError with no response
      if (
        error instanceof TypeError &&
        error.message.includes('Failed to fetch')
      ) {
        // This could be server down, CORS, or network error - provide helpful message
        this.connectionError.set(
          this.transloco.translate('dialogs.profileManager.serverUnreachable')
        );
      } else {
        this.connectionError.set(
          this.transloco.translate('dialogs.profileManager.connectionFailed')
        );
      }
    } finally {
      this.isConnecting.set(false);
    }
  }

  /**
   * Add a new server profile
   *
   * This always shows the auth form so the user can login/register on the new server.
   * If they have local projects to migrate, those will be shown after authentication.
   */
  addServer(): void {
    if (!this.canAddServer()) {
      this.connectionError.set(this.policyMessage());
      return;
    }
    const rawUrl = this.newServerUrl().trim();
    if (!rawUrl) {
      this.connectionError.set(
        this.transloco.translate('dialogs.profileManager.enterServerUrl')
      );
      return;
    }

    // Normalize URL to ensure it has a protocol
    const url = normalizeServerUrl(rawUrl);

    // Always show the auth form - user needs to authenticate on the new server
    // The migration view handles both auth and optional project migration
    this.pendingServerUrl = url;
    this.migrationSourceId = this.activeProfile()?.id ?? null;
    this.currentView.set('migrate');
    this.showAuthForm.set(true);
    void this.loadTargetFeatures(url);
  }

  /**
   * Read the target server's sign-in options. A passwordless server starts
   * on registration without password fields; one without registration
   * (nothing this dialog can offer) starts on sign-in.
   */
  private async loadTargetFeatures(url: string): Promise<void> {
    this.targetFeatures.set(null);
    this.isLoadingTargetFeatures.set(true);
    try {
      const features = await this.setupService.fetchServerFeatures(url);
      // The user may have cancelled or picked another server meanwhile
      if (this.pendingServerUrl !== url) return;
      this.targetFeatures.set(features);
      if (!this.canRegisterOnTarget()) this.authMode.set('login');
    } finally {
      if (this.pendingServerUrl === url) {
        this.isLoadingTargetFeatures.set(false);
      }
    }
  }

  /**
   * Disconnect a connection. Works for the active one too: the app then
   * lands on the next most recent connection, or the welcome screen when
   * none is left. Browser-mode data has no remote copy, so that one asks
   * for a typed confirmation.
   */
  async removeProfile(profile: ServerConfig): Promise<void> {
    const info = this.getProfileInfo(profile);
    if (info.isBuiltIn) {
      this.snackBar.open(
        this.transloco.translate('dialogs.profileManager.cannotRemoveBuiltIn'),
        this.transloco.translate('close'),
        { duration: 4000 }
      );
      return;
    }
    const data = await this.storageContext.describeContextData(profile.id);
    const details = [
      this.transloco.translate('dialogs.profileManager.disconnectDataLine', {
        databases: data.databases.length,
        keys: data.localStorageKeys.length,
      }),
    ];
    const messageKey = profileRemovalMessageKey(info.kind);
    const confirmed = await this.confirmAction(
      this.transloco.translate('dialogs.profileManager.disconnectTitle', {
        name: info.name,
      }),
      this.transloco.translate(messageKey),
      this.transloco.translate('dialogs.profileManager.disconnect'),
      {
        details,
        requireConfirmationText: info.kind === 'local' ? 'DELETE' : undefined,
      }
    );
    if (!confirmed) return;

    this.isBusy.set(true);
    try {
      const destination = await this.profileManager.disconnect(profile.id);
      if (info.isActive) {
        this.leaveTo(destination);
        return;
      }
      this.snackBar.open(
        this.transloco.translate('dialogs.profileManager.profileRemoved'),
        this.transloco.translate('close'),
        { duration: 3000 }
      );
      if (this.showStorage()) void this.refreshStorage();
    } catch (error) {
      console.error('Failed to remove profile:', error);
      this.snackBar.open(
        this.transloco.translate('settings.connectionTab.removeFailed'),
        this.transloco.translate('close'),
        { duration: 5000 }
      );
    } finally {
      this.isBusy.set(false);
    }
  }

  /** Show the upgrade choices for the active profile */
  showUpgrade(): void {
    void this.appModePolicy.ready();
    this.currentView.set('upgrade');
  }

  /**
   * Upgrade the active profile to cloud storage: remember which profile is
   * being upgraded, then walk through the normal cloud connect flow. When
   * the new profile is created the data is copied across.
   */
  upgradeToCloud(): void {
    const active = this.activeProfile();
    if (!active || !this.canAddCloud()) return;
    setProfileUpgradeSource(active.id);
    this.dialog.closeAll();
    void this.router.navigate(['/setup'], {
      queryParams: { mode: 'cloud', upgradeFrom: active.id },
    });
  }

  /** Upgrade to a server: the guided migration flow already does this */
  upgradeToServer(): void {
    this.showAddServer();
  }

  /** Add another profile via the welcome screen; nothing existing changes */
  goToWelcome(): void {
    this.dialog.closeAll();
    void this.router.navigate(['/setup']);
  }

  /** Add a cloud storage account via the welcome screen's provider picker */
  addCloudStorage(): void {
    if (!this.canAddCloud()) return;
    this.dialog.closeAll();
    void this.router.navigate(['/setup'], { queryParams: { mode: 'cloud' } });
  }

  /**
   * Reconnect a cloud account whose credentials are gone. Allowed whatever
   * APP_MODE says: the profile already exists on this device.
   */
  reconnectCloud(profile: ServerConfig): void {
    this.dialog.closeAll();
    void this.router.navigate(['/setup'], {
      queryParams: { mode: 'cloud', provider: profile.cloudProvider },
    });
  }

  /** Wipe every connection and all Inkweld data from this browser */
  async resetDevice(): Promise<void> {
    const confirmed = await this.confirmAction(
      this.transloco.translate('dialogs.profileManager.resetTitle'),
      this.transloco.translate('dialogs.profileManager.resetMessage'),
      this.transloco.translate('dialogs.profileManager.resetConfirm'),
      { requireConfirmationText: 'RESET' }
    );
    if (!confirmed) return;
    this.isBusy.set(true);
    try {
      const destination = await this.profileManager.resetDevice();
      this.leaveTo(destination);
    } catch (error) {
      console.error('Failed to reset this device:', error);
      this.snackBar.open(
        this.transloco.translate('dialogs.profileManager.resetFailed'),
        this.transloco.translate('close'),
        { duration: 5000 }
      );
    } finally {
      this.isBusy.set(false);
    }
  }

  /** Toggle the storage panel, scanning on first open */
  async toggleStorage(): Promise<void> {
    const next = !this.showStorage();
    this.showStorage.set(next);
    if (next && !this.storageScan()) await this.refreshStorage();
  }

  async refreshStorage(): Promise<void> {
    this.isScanning.set(true);
    try {
      this.storageScan.set(await this.profileManager.scanStorage());
    } catch (error) {
      console.error('Storage scan failed:', error);
    } finally {
      this.isScanning.set(false);
    }
  }

  async deleteOrphan(prefix: string): Promise<void> {
    const confirmed = await this.confirmAction(
      this.transloco.translate('dialogs.profileManager.orphanDeleteTitle'),
      this.transloco.translate('dialogs.profileManager.orphanDeleteMessage', {
        prefix,
      }),
      this.transloco.translate('delete')
    );
    if (!confirmed) return;
    await this.profileManager.deleteOrphan(prefix);
    await this.refreshStorage();
  }

  /** Human-readable byte count for the storage estimate */
  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
  }

  /**
   * Full page load into the new context. Every service holds handles into
   * the old context's storage, so a router navigation is not enough.
   */
  private leaveTo(destination: ProfileDestination): void {
    this.dialogRef.close();
    globalThis.location.href = appUrl(
      destination === 'welcome' ? '/setup' : '/'
    );
  }

  /**
   * Show the add local mode form
   */
  showAddLocalMode(): void {
    if (!this.canAddLocal()) return;
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
    if (!this.canAddLocal()) {
      this.localError.set(this.policyMessage());
      return;
    }
    const username = this.localUsername().trim();
    const displayName = this.localDisplayName().trim() || username;

    if (!username) {
      this.localError.set(
        this.transloco.translate('dialogs.profileManager.enterUsername')
      );
      return;
    }

    // Validate username format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      this.localError.set(
        this.transloco.translate('dialogs.profileManager.usernameFormat')
      );
      return;
    }

    try {
      // Add local config (this keeps existing server configs)
      this.setupService.configureLocalMode({ name: displayName, username });

      // Navigate to home - the current project URL won't exist in the new profile context
      globalThis.location.href = appUrl('/');
    } catch (error) {
      console.error('Failed to add local mode:', error);
      this.localError.set(
        this.transloco.translate('dialogs.profileManager.localModeFailed')
      );
    }
  }

  /**
   * Switch to local mode. An existing Browser profile always works; a new
   * one is only offered when APP_MODE allows it.
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

  /** The APP_MODE restriction, worded the same as everywhere else */
  private policyMessage(): string | null {
    const key = this.restrictionMessageKey();
    return key ? this.transloco.translate(key) : null;
  }

  // ============ Migration Methods ============

  /**
   * Cancel migration and return to list, back on the profile it started from
   */
  async cancelMigration(): Promise<void> {
    this.currentView.set('list');
    if (this.migrationSourceId) await this.restoreSourceProfile();
    this.resetMigrationForm();
  }

  /**
   * Complete the server switch without migration.
   * Called when user is authenticated but has no local projects to migrate.
   */
  completeServerSwitch(): void {
    // Authentication already created and activated the server profile; only
    // a custom display name is left to apply.
    const displayName = this.newServerName().trim();
    const normalizedUrl = stripTrailingSlashes(this.pendingServerUrl);
    const targetId =
      this.migrationTargetId ??
      this.storageContext
        .getConfigurations()
        .find(c => c.type === 'server' && c.serverUrl === normalizedUrl)?.id;
    if (!targetId) return;
    this.migrationStarted = true;
    if (displayName) {
      this.storageContext.updateConfigDisplayName(targetId, displayName);
    }
    this.storageContext.switchToConfig(targetId);
    globalThis.location.href = appUrl('/');
  }

  /**
   * Reset migration form state
   */
  private resetMigrationForm(): void {
    this.showAuthForm.set(false);
    this.isAuthenticated.set(false);
    this.username.set('');
    this.password.set('');
    this.authError.set(null);
    this.isAuthenticating.set(false);
    this.isMigrating.set(false);
    this.isCheckingConflicts.set(false);
    this.pendingServerUrl = '';
    this.migrationSourceId = null;
    this.migrationTargetId = null;
    this.migrationUsername = '';
    this.createdProfileIds.clear();
    this.knownProfileIds = null;
    this.userBeforeSignIn = null;
    this.targetFeatures.set(null);
    this.isLoadingTargetFeatures.set(false);
    this.pendingPasskeyEnrolment.set(null);
    this.authMode.set('register');
    this.selectedProjectSlugs.set(new Set());
    this.conflictingSlugs.set(new Set());
    this.serverSlugs.set(new Set());
    this.projectRenames.set(new Map());
    // Reset registration form if present
    this.registrationForm?.reset();
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
   * Handle registration request from the shared registration form.
   * Called when externalSubmit mode emits submitRequest. Without a password
   * (a passwordless server) the new account gets a passkey straight away.
   */
  async onRegistrationSubmit(credentials: {
    username: string;
    password?: string;
    name?: string;
    email?: string;
  }): Promise<void> {
    const withPasskey = !credentials.password;
    if (withPasskey && !this.targetPasskeys()) {
      this.authError.set(
        this.transloco.translate('dialogs.profileManager.passkeysUnavailable')
      );
      return;
    }

    this.isAuthenticating.set(true);
    this.registrationForm?.setLoading(true);
    this.authError.set(null);
    let accountCreated = false;

    try {
      // Create or find the server profile for this author, then register.
      // The username picks the profile so a second author on the same server
      // never lands in someone else's storage.
      await this.enterTargetProfile(credentials.username);

      if (await this.registerAccount(credentials, withPasskey)) return;
      accountCreated = true;
      this.migrationUsername = credentials.username;

      if (withPasskey) {
        // The account has no credential until this succeeds
        this.pendingPasskeyEnrolment.set({});
        await this.enrolPendingPasskey();
        return;
      }

      await this.completeSignIn(
        'dialogs.profileManager.registeredMigrate',
        'dialogs.profileManager.registeredSwitch'
      );
    } catch (error) {
      console.error('Registration failed:', error);
      const message =
        error instanceof Error
          ? error.message
          : this.transloco.translate(
              'dialogs.profileManager.registrationFailed'
            );
      if (!accountCreated) await this.restoreSourceProfile();
      this.registrationForm?.setError(message);
      this.authError.set(message);
    } finally {
      this.isAuthenticating.set(false);
      this.registrationForm?.setLoading(false);
    }
  }

  /**
   * Create the account on the target server. Returns true when the account
   * waits for approval and this already took over: a passwordless account
   * still needs its passkey then, or it could never be signed in to once
   * approved.
   */
  private async registerAccount(
    credentials: {
      username: string;
      password?: string;
      name?: string;
      email?: string;
    },
    withPasskey: boolean
  ): Promise<boolean> {
    try {
      await this.migrationService.registerOnServer(
        credentials.username,
        credentials.password,
        { name: credentials.name, email: credentials.email }
      );
      return false;
    } catch (error) {
      if (
        !withPasskey ||
        !(error instanceof ServerApprovalRequiredError) ||
        !error.enrolmentToken
      ) {
        throw error;
      }
      this.migrationUsername = credentials.username;
      this.pendingPasskeyEnrolment.set({
        enrolmentToken: error.enrolmentToken,
      });
      await this.enrolPendingPasskey();
      return true;
    }
  }

  /**
   * Enrol the passkey of an account this flow just created on a passwordless
   * server. On success the move carries on (or, for an account that waits
   * for approval, ends back on the Browser profile with a note). A cancelled
   * or failed prompt keeps the retry step open.
   */
  async enrolPendingPasskey(): Promise<void> {
    const pending = this.pendingPasskeyEnrolment();
    if (!pending) return;
    this.isAuthenticating.set(true);
    this.authError.set(null);
    // An account waiting for approval only has a token for this ceremony
    if (pending.enrolmentToken) {
      this.authTokenService.setToken(pending.enrolmentToken);
    }
    let enrolled = false;
    try {
      await this.passkeyService.register(
        this.transloco.translate('dialogs.profileManager.passkeyName')
      );
      enrolled = true;
    } catch (error) {
      console.error('Passkey enrolment failed:', error);
      const result = this.errorTranslation.translate(error);
      this.authError.set(
        result.silent
          ? this.transloco.translate(
              'dialogs.profileManager.passkeyEnrolmentCancelled'
            )
          : result.message
      );
    } finally {
      if (pending.enrolmentToken) this.authTokenService.clearToken();
      this.isAuthenticating.set(false);
    }
    if (!enrolled) return;

    this.pendingPasskeyEnrolment.set(null);
    if (pending.enrolmentToken) {
      // Nothing can move until an administrator approves the account
      await this.restoreSourceProfile();
      this.authError.set(
        this.transloco.translate('dialogs.profileManager.awaitingApproval')
      );
      return;
    }
    await this.completeSignIn(
      'dialogs.profileManager.registeredMigrate',
      'dialogs.profileManager.registeredSwitch'
    );
  }

  /**
   * Sign in to the target server with a passkey. The passkey names the
   * account, so the profile is picked by the server URL and the login moves
   * to its author's own profile if that one belongs to someone else.
   */
  async signInWithPasskey(): Promise<void> {
    if (this.isAuthenticating()) return;
    this.isAuthenticating.set(true);
    this.authError.set(null);

    try {
      await this.enterTargetProfile();
      const profileId = this.migrationTargetId;
      const previousToken = profileId
        ? this.authTokenService.getTokenForConfig(profileId)
        : null;

      const user = await this.passkeyService.login({
        reloadOnProfileChange: false,
      });

      const signedInId = this.activeProfile()?.id ?? null;
      if (signedInId && signedInId !== profileId) {
        // The login moved to its author's own profile. Give the profile it
        // came from its own session back.
        this.trackCreatedProfile(signedInId);
        if (profileId && previousToken) {
          this.authTokenService.setTokenForConfig(profileId, previousToken);
        }
        this.migrationTargetId = signedInId;
      } else if (signedInId) {
        this.useOwnServerProfile(signedInId, user.username);
      }
      this.migrationUsername = user.username;

      await this.completeSignIn(
        'dialogs.profileManager.authenticatedMigrate',
        'dialogs.profileManager.authenticatedSwitch'
      );
    } catch (error) {
      console.error('Passkey sign-in failed:', error);
      await this.restoreSourceProfile();
      this.authError.set(this.passkeySignInMessage(error));
    } finally {
      this.isAuthenticating.set(false);
    }
  }

  /**
   * A passkey sign-in starts on a profile picked by the server URL alone.
   * When this flow created that profile and the author already has one on
   * this server, move the session there instead of keeping two profiles for
   * one author.
   */
  private useOwnServerProfile(profileId: string, username: string): void {
    if (!this.createdProfileIds.has(profileId)) return;
    const serverUrl = this.storageContext.getConfigById(profileId)?.serverUrl;
    const wanted = username.trim().toLowerCase();
    const own = this.storageContext
      .getConfigurations()
      .find(
        c =>
          c.id !== profileId &&
          c.type === 'server' &&
          c.serverUrl === serverUrl &&
          c.userProfile?.username.trim().toLowerCase() === wanted
      );
    if (!own) return;
    this.authTokenService.moveToken(profileId, own.id);
    this.storageContext.switchToConfig(own.id);
    this.discardProfile(profileId);
    this.migrationTargetId = own.id;
  }

  /** Message for a failed passkey sign-in, or null for a cancelled prompt */
  private passkeySignInMessage(error: unknown): string | null {
    if (!(error instanceof PasskeyError)) {
      return error instanceof Error
        ? error.message
        : this.transloco.translate(
            'dialogs.profileManager.authenticationFailed'
          );
    }
    const result = this.errorTranslation.translate(error);
    if (result.silent) return null;
    // There is no approval page to send the user to in the middle of a
    // move; say why the projects can't move yet instead
    if (result.shouldRedirect) {
      return this.transloco.translate(
        result.rejected
          ? 'dialogs.profileManager.accountRejected'
          : 'dialogs.profileManager.awaitingApproval'
      );
    }
    return result.message;
  }

  /**
   * Handle login authentication (step 1 of migration flow)
   * After successful auth, fetches server projects and shows migration table
   */
  async authenticate(): Promise<void> {
    const usernameValue = this.username();
    const passwordValue = this.password();

    // Validation
    if (!usernameValue || !passwordValue) {
      this.authError.set(
        this.transloco.translate('dialogs.profileManager.enterCredentials')
      );
      return;
    }

    this.isAuthenticating.set(true);
    this.authError.set(null);

    try {
      // Create or find the server profile for this author, then log in
      await this.enterTargetProfile(usernameValue);

      // Login to server
      await this.migrationService.loginToServer(usernameValue, passwordValue);
      this.migrationUsername = usernameValue;

      await this.completeSignIn(
        'dialogs.profileManager.authenticatedMigrate',
        'dialogs.profileManager.authenticatedSwitch'
      );
    } catch (error) {
      console.error('Authentication failed:', error);
      await this.restoreSourceProfile();
      this.authError.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate(
              'dialogs.profileManager.authenticationFailed'
            )
      );
    } finally {
      this.isAuthenticating.set(false);
    }
  }

  /**
   * Switch to the target server profile so the sign-in talks to that server
   * (the API client and token store follow the active profile). Remembers
   * whether the profile is new, so a failed sign-in can remove it again.
   */
  private async enterTargetProfile(username?: string): Promise<void> {
    this.userBeforeSignIn ??= this.userService.currentUser();
    this.knownProfileIds ??= new Set(
      this.storageContext.getConfigurations().map(c => c.id)
    );
    await this.setupService.configureServerMode(
      this.pendingServerUrl,
      username ? { username } : {}
    );
    const target = this.activeProfile();
    this.migrationTargetId = target?.id ?? null;
    if (target) this.trackCreatedProfile(target.id);
  }

  private trackCreatedProfile(id: string): void {
    if (!this.knownProfileIds?.has(id)) this.createdProfileIds.add(id);
  }

  /**
   * Go back to the profile the move started from. Profiles this flow created
   * are removed unless the user is signed in to them; the source profile
   * and its projects are never touched.
   */
  private async restoreSourceProfile(): Promise<void> {
    const sourceId = this.migrationSourceId;
    if (
      sourceId &&
      this.activeProfile()?.id !== sourceId &&
      this.storageContext.getConfigById(sourceId)
    ) {
      this.storageContext.switchToConfig(sourceId);
    }
    if (!this.isAuthenticated()) {
      for (const id of this.createdProfileIds) this.discardProfile(id);
      this.knownProfileIds = null;
      this.migrationTargetId = null;
    }
    const previousUser = this.userBeforeSignIn;
    this.userBeforeSignIn = null;
    if (
      previousUser &&
      this.userService.currentUser().username !== previousUser.username
    ) {
      await this.userService.setCurrentUser(previousUser);
    }
  }

  /** Remove a profile this flow created, with anything stored under it */
  private discardProfile(id: string): void {
    this.createdProfileIds.delete(id);
    this.authTokenService.clearTokenForConfig(id);
    this.storageContext.removeConfig(id);
    this.storageContext.clearContextData(id).catch((error: unknown) => {
      console.warn(`Could not clear data of profile ${id}:`, error);
    });
  }

  /**
   * Shared tail of every successful sign-in: select all projects and resolve
   * slug conflicts, then reveal the selection step.
   */
  private async completeSignIn(
    migrateMessageKey: string,
    switchMessageKey: string
  ): Promise<void> {
    // Select all projects by default and resolve slug conflicts BEFORE
    // revealing the selection step. Flipping the view first left a window
    // where the migrate button was clickable with an empty selection, so a
    // fast click "skipped" migration entirely (vacuous success; flaky e2e).
    const allSlugs = this.localProjects().map(p => p.slug);
    this.selectedProjectSlugs.set(new Set(allSlugs));
    await this.checkSlugConflicts();

    // Auth successful - mark as authenticated and show project selection
    this.isAuthenticated.set(true);
    this.showAuthForm.set(false);

    this.snackBar.open(
      this.transloco.translate(
        allSlugs.length > 0 ? migrateMessageKey : switchMessageKey
      ),
      this.transloco.translate('close'),
      { duration: 3000 }
    );
  }

  /**
   * Handle migration (step 2 of migration flow)
   * Called after user has authenticated and selected projects
   */
  async migrateProjects(): Promise<void> {
    const selectedSlugs = Array.from(this.selectedProjectSlugs());

    if (this.hasUnresolvedConflicts()) {
      this.authError.set(
        this.transloco.translate('dialogs.profileManager.resolveConflicts')
      );
      return;
    }

    this.migrationStarted = true;
    this.isMigrating.set(true);
    this.authError.set(null);
    this.syncSuccess.set(false);
    this.syncError.set(null);

    try {
      if (selectedSlugs.length > 0) {
        await this.runMigrationAndSync(selectedSlugs);
      } else {
        this.syncSuccess.set(true);
      }

      if (this.syncSuccess()) {
        setTimeout(() => {
          globalThis.location.href = appUrl('/');
        }, 1500);
      }
    } catch (error) {
      console.error('Migration failed:', error);
      this.authError.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate('dialogs.profileManager.migrationFailed')
      );
    } finally {
      this.isMigrating.set(false);
      this.isSyncing.set(false);
    }
  }

  private async runMigrationAndSync(selectedSlugs: string[]): Promise<void> {
    const renames = this.projectRenames();
    await this.migrationService.migrateToServer(
      selectedSlugs,
      renames.size > 0 ? renames : undefined
    );

    const state = this.migrationState();

    if (state.status === MigrationStatus.Completed) {
      this.isMigrating.set(false);
      this.isSyncing.set(true);

      try {
        const syncSuccess = await this.backgroundSyncService.syncPendingItems();

        if (syncSuccess) {
          this.syncSuccess.set(true);
          this.migrationService.cleanupLocalData(selectedSlugs);
          this.recordMigrationHistory(selectedSlugs.length);
        } else {
          this.syncError.set(
            'Some projects failed to sync. They will be synced automatically later.'
          );
        }
      } catch (syncErr) {
        console.error('Sync failed:', syncErr);
        this.syncError.set(
          syncErr instanceof Error
            ? syncErr.message
            : 'Sync failed. Projects will sync automatically when online.'
        );
      } finally {
        this.isSyncing.set(false);
      }
    } else if (state.status === MigrationStatus.Failed) {
      this.authError.set(
        `Migration completed with errors. ${state.completedProjects} succeeded, ${state.failedProjects} failed.`
      );
    }
  }

  /**
   * Note on both connections that projects moved, and under which username,
   * so the connections list can explain where a user's work went.
   */
  private recordMigrationHistory(projectCount: number): void {
    if (!this.migrationSourceId || !this.migrationTargetId) return;
    if (projectCount === 0) return;
    const targetId = this.migrationTargetId;
    this.storageContext.recordMigration(this.migrationSourceId, targetId, {
      username: this.migrationUsername || undefined,
      projectCount,
    });
  }

  // ============ Helper Methods ============

  /**
   * Show confirmation dialog
   */
  private async confirmAction(
    title: string,
    message: string,
    confirmText: string,
    extra: Pick<
      ConfirmationDialogData,
      'details' | 'requireConfirmationText'
    > = {}
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
        cancelText: this.transloco.translate('cancel'),
        ...extra,
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
    // Check if we have a rename entry (even if empty string)
    if (this.projectRenames().has(project.slug)) {
      return this.projectRenames().get(project.slug) ?? '';
    }
    return project.slug;
  }

  /**
   * Update the renamed slug for a project
   */
  updateProjectSlug(project: Project, newSlug: string): void {
    const renames = new Map(this.projectRenames());
    // Always set the value - even if empty, to allow clearing the field
    // Only delete if it's the same as the original slug (user restored it)
    if (newSlug === project.slug) {
      renames.delete(project.slug);
    } else {
      renames.set(project.slug, newSlug);
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
      this.serverSlugs.set(serverSlugs);

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
   * Check if a new slug would also conflict with server projects
   */
  wouldSlugConflict(newSlug: string): boolean {
    return this.serverSlugs().has(newSlug);
  }
}
