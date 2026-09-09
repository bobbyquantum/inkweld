import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { ThemeToggleComponent } from '@components/theme-toggle/theme-toggle.component';
import { ConfigurationService } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { sameUsername } from '@models/cloud-manifest';
import { CloudSyncConfigService } from '@services/cloud-sync/cloud-sync-config.service';
import {
  CloudSyncConnectService,
  type PendingCloudConnection,
} from '@services/cloud-sync/cloud-sync-connect.service';
import {
  peekProfileUpgradeSource,
  ProfileManagerService,
  setProfileUpgradeSource,
  takeProfileUpgradeSource,
} from '@services/core/profile-manager.service';
import { StorageContextService } from '@services/core/storage-context.service';
import {
  type CloudProvider,
  getCloudProviderDisplayName,
} from '@services/core/storage-context.service';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../environments/environment';
import { SetupService } from '../../services/core/setup.service';
import { UnifiedUserService } from '../../services/user/unified-user.service';

type AppMode = 'ONLINE' | 'LOCAL' | 'BOTH';

// Define a safe interface for the system features response
interface SystemFeaturesResponse {
  appMode?: string;
  defaultServerName?: string | null;
  aiAutoReview?: boolean;
  aiImageGeneration?: boolean;
  captcha?: {
    enabled?: boolean;
    siteKey?: string;
  };
}

/** Display metadata for a cloud provider option */
interface CloudProviderOption {
  id: CloudProvider;
  name: string;
  icon: string;
  description: string;
}

const PROVIDER_OPTIONS: Record<
  CloudProvider,
  Omit<CloudProviderOption, 'id'>
> = {
  dropbox: {
    name: 'Dropbox',
    icon: 'cloud',
    description:
      'Inkweld gets its own folder under Apps in your Dropbox and cannot see anything else.',
  },
  nextcloud: {
    name: 'Nextcloud',
    icon: 'dns',
    description:
      'Your own server. Inkweld keeps an Inkweld folder in your files, using an app password you can revoke at any time.',
  },
  'google-drive': {
    name: 'Google Drive',
    icon: 'cloud',
    description:
      'Inkweld can only see files it created in your Drive, nothing else.',
  },
  onedrive: {
    name: 'OneDrive',
    icon: 'cloud',
    description:
      'Inkweld gets its own folder under Apps in your OneDrive and cannot see anything else.',
  },
};

/** Where the Nextcloud CORS and app-password walkthrough lives */
export const NEXTCLOUD_SETUP_GUIDE_URL =
  'https://preview.inkweld.org/user-guide/getting-started/nextcloud-sync';

@Component({
  selector: 'app-setup',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressBarModule,
    TranslocoModule,
    ThemeToggleComponent,
  ],
  templateUrl: './setup.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './setup.component.scss',
})
export class SetupComponent implements OnInit {
  private readonly setupService = inject(SetupService);
  private readonly unifiedUserService = inject(UnifiedUserService);
  private readonly ConfigurationService = inject(ConfigurationService);
  private readonly cloudSyncConfig = inject(CloudSyncConfigService);
  private readonly cloudSyncConnect = inject(CloudSyncConnectService);
  private readonly profileManager = inject(ProfileManagerService);
  private readonly storageContext = inject(StorageContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly isLoading = this.setupService.isLoading;
  protected readonly showServerSetup = signal(false);
  protected readonly showLocalSetup = signal(false);
  /** Provider picker step of Cloud Sync */
  protected readonly showCloudSetup = signal(false);
  /** Nextcloud connection form (server address plus app password) */
  protected readonly showNextcloudSetup = signal(false);
  /** Profile step of Cloud Sync, after the provider redirect */
  protected readonly showCloudProfileSetup = signal(false);
  /** The account already has authors: continue as one, or add a new one */
  protected readonly showCloudChooseProfile = signal(false);
  /**
   * Upgrading into an author that already exists in the account: some
   * projects share an address and need a new one before copying
   */
  protected readonly showCloudClash = signal(false);
  /** Projects of the source profile that clash with the destination author */
  protected readonly clashes = signal<
    { slug: string; title: string; newSlug: string }[]
  >([]);
  /**
   * Addresses a rename may not take: what the destination author already has
   * plus the source's own non-clashing projects, which are copied as they are
   */
  private takenSlugs = new Set<string>();
  protected readonly nextcloudGuideUrl = NEXTCLOUD_SETUP_GUIDE_URL;
  /** Name of the profile being upgraded, when this visit is an upgrade */
  protected readonly upgradeSourceName = signal<string | null>(null);
  protected readonly pendingCloudConnection =
    signal<PendingCloudConnection | null>(null);
  protected readonly isConnectingCloud = signal(false);
  protected readonly appMode = signal<AppMode>('BOTH');
  protected readonly configLoading = signal(true);

  /** Cloud providers this build can offer */
  protected readonly cloudProviders = computed<CloudProviderOption[]>(() =>
    this.cloudSyncConfig
      .availableProviders()
      .map(id => ({ id, ...PROVIDER_OPTIONS[id] }))
  );

  /**
   * Server URL input default. A build with a hosted apiUrl (e.g. a preview
   * deployment with autoConfigure disabled) pre-fills its own server so the
   * user only has to confirm; other builds fall back to localhost.
   */
  protected serverUrl = environment.apiUrl || 'http://localhost:8333';
  protected userName = '';
  protected displayName = '';
  protected nextcloudUrl = '';
  protected nextcloudUser = '';
  protected nextcloudAppPassword = '';

  ngOnInit(): void {
    // Returning from a cloud provider with a fresh account: go straight to
    // the profile step instead of the mode picker.
    const upgradeFrom = this.route.snapshot.queryParamMap.get('upgradeFrom');
    if (upgradeFrom) setProfileUpgradeSource(upgradeFrom);
    this.loadUpgradeSource();

    const cloudParam = this.route.snapshot.queryParamMap.get('cloud');
    const pending = this.cloudSyncConnect.getPendingConnection();
    if (cloudParam && pending && pending.provider === cloudParam) {
      this.pendingCloudConnection.set(pending);
      this.openCloudProfileStep(pending);
      this.configLoading.set(false);
      return;
    }

    // The connections manager can deep-link into one step, e.g. "add cloud
    // storage" opens the provider picker (or one provider's form) directly.
    this.openRequestedStep(
      this.route.snapshot.queryParamMap.get('mode'),
      this.route.snapshot.queryParamMap.get('provider')
    );

    // Check if there's already a configured server
    const existingServerUrl = this.setupService.getServerUrl();
    if (existingServerUrl) {
      // If already configured, try to load system config from that server
      void this.loadSystemConfig();
    } else {
      // No server configured yet, skip loading and use defaults
      this.configLoading.set(false);
      console.info('No server configured yet, using default setup options');
    }
  }

  private async loadSystemConfig(): Promise<void> {
    try {
      const systemFeatures = await firstValueFrom(
        this.ConfigurationService.getAppConfiguration()
      );

      if (systemFeatures) {
        // Use type assertion to a safe interface
        const response = systemFeatures as SystemFeaturesResponse;

        // Safely handle appMode
        const appModeValue = response.appMode;
        if (
          typeof appModeValue === 'string' &&
          (appModeValue === 'ONLINE' ||
            appModeValue === 'LOCAL' ||
            appModeValue === 'BOTH')
        ) {
          this.appMode.set(appModeValue);

          // Auto-select mode if only one option is available
          if (appModeValue === 'ONLINE') {
            this.chooseServerMode();
          } else if (appModeValue === 'LOCAL' && !this.canUseCloudMode()) {
            this.chooseLocalMode();
          }
        }

        // Safely handle defaultServerName
        const serverName = response.defaultServerName;
        if (typeof serverName === 'string' && serverName.trim().length > 0) {
          this.serverUrl = serverName;
        }
      }
    } catch (error) {
      console.warn(
        'Failed to load system configuration, using defaults:',
        error
      );
      // Keep default mode as 'BOTH' if config fails to load
    } finally {
      this.configLoading.set(false);
    }
  }

  protected shouldShowModeSelection(): boolean {
    return (
      this.hasModeChoice() &&
      !this.showServerSetup() &&
      !this.showLocalSetup() &&
      !this.showCloudSetup() &&
      !this.showNextcloudSetup() &&
      !this.showCloudProfileSetup() &&
      !this.showCloudChooseProfile() &&
      !this.showCloudClash()
    );
  }

  /**
   * Whether there is more than one way to use this deployment. A LOCAL-only
   * server still offers a choice when cloud sync is available, because cloud
   * sync never touches the server.
   */
  protected hasModeChoice(): boolean {
    const mode = this.appMode();
    if (mode === 'BOTH') return true;
    return mode === 'LOCAL' && this.canUseCloudMode();
  }

  /**
   * True when a back button makes sense: inside a sub-step, or at the mode
   * picker when the app is already configured (back returns to the app, so
   * the welcome screen never traps someone who arrived from the connections
   * manager).
   */
  protected canGoBack(): boolean {
    if (this.inSubStep()) return this.hasModeChoice();
    return this.canReturnToApp();
  }

  /** Already configured, so the welcome screen is optional */
  protected canReturnToApp(): boolean {
    return this.setupService.isConfigured();
  }

  private inSubStep(): boolean {
    return (
      this.showServerSetup() ||
      this.showLocalSetup() ||
      this.showCloudSetup() ||
      this.showNextcloudSetup() ||
      this.showCloudProfileSetup() ||
      this.showCloudChooseProfile() ||
      this.showCloudClash()
    );
  }

  /** Jump to a step named in the URL (`?mode=cloud|server|local`) */
  private openRequestedStep(
    mode: string | null,
    provider: string | null
  ): void {
    switch (mode) {
      case 'cloud':
        this.chooseCloudMode();
        if (provider === 'nextcloud') {
          this.showCloudSetup.set(false);
          this.showNextcloudSetup.set(true);
        }
        break;
      case 'server':
        this.chooseServerMode();
        break;
      case 'local':
        this.chooseLocalMode();
        break;
      default:
        break;
    }
  }

  protected canUseServerMode(): boolean {
    const mode = this.appMode();
    return mode === 'BOTH' || mode === 'ONLINE';
  }

  protected canUseLocalMode(): boolean {
    const mode = this.appMode();
    return mode === 'BOTH' || mode === 'LOCAL';
  }

  /**
   * Cloud sync is offered when this build has at least one provider key and
   * the server (if any) allows working without it.
   */
  protected canUseCloudMode(): boolean {
    return (
      this.canUseLocalMode() && this.cloudSyncConfig.isCloudSyncAvailable()
    );
  }

  protected chooseServerMode(): void {
    this.showServerSetup.set(true);
    this.showLocalSetup.set(false);
    this.showCloudSetup.set(false);
  }

  protected chooseLocalMode(): void {
    this.showLocalSetup.set(true);
    this.showServerSetup.set(false);
    this.showCloudSetup.set(false);
  }

  /**
   * Show the provider picker. Always shown, even with a single provider, so
   * the user sees which service they are about to hand a folder to and the
   * step stays stable as more providers are added.
   */
  protected chooseCloudMode(): void {
    this.showCloudSetup.set(true);
    this.showServerSetup.set(false);
    this.showLocalSetup.set(false);
  }

  /**
   * Kick off the provider connect flow: an OAuth redirect for hosted
   * providers, or the address form for a self-hosted Nextcloud.
   */
  protected async connectCloudProvider(provider: CloudProvider): Promise<void> {
    if (this.isConnectingCloud()) return;
    if (provider === 'nextcloud') {
      this.showCloudSetup.set(false);
      this.showNextcloudSetup.set(true);
      return;
    }
    this.isConnectingCloud.set(true);
    try {
      await this.cloudSyncConnect.beginAuthorization(provider);
      // The browser is navigating away; leave the spinner running.
    } catch (error) {
      this.isConnectingCloud.set(false);
      const name = getCloudProviderDisplayName(provider);
      this.snackBar.open(
        error instanceof Error
          ? error.message
          : `Could not start ${name} sign-in`,
        'Close',
        { duration: 5000 }
      );
    }
  }

  /**
   * Verify the Nextcloud details and either adopt the existing folder or move
   * on to the profile step. Nothing leaves the browser except the WebDAV
   * requests to the user's own server.
   */
  protected async connectNextcloud(): Promise<void> {
    if (this.isConnectingCloud()) return;
    this.isConnectingCloud.set(true);
    try {
      const result = await this.cloudSyncConnect.connectNextcloud({
        serverUrl: this.nextcloudUrl,
        loginName: this.nextcloudUser,
        appPassword: this.nextcloudAppPassword,
      });
      this.nextcloudAppPassword = '';
      this.pendingCloudConnection.set(result.pending);
      this.showNextcloudSetup.set(false);
      this.openCloudProfileStep(result.pending);
    } catch (error) {
      this.snackBar.open(
        error instanceof Error
          ? error.message
          : 'Could not connect to Nextcloud',
        'Close',
        { duration: 8000 }
      );
    } finally {
      this.isConnectingCloud.set(false);
    }
  }

  protected canConnectNextcloud(): boolean {
    return (
      !!this.nextcloudUrl.trim() &&
      !!this.nextcloudUser.trim() &&
      !!this.nextcloudAppPassword.trim()
    );
  }

  protected async setupServerMode(): Promise<void> {
    if (!this.serverUrl.trim()) {
      this.snackBar.open('Please enter a server URL', 'Close', {
        duration: 3000,
      });
      return;
    }

    try {
      await this.setupService.configureServerMode(this.serverUrl.trim());
      this.snackBar.open('Server configuration saved!', 'Close', {
        duration: 3000,
      });
      await this.router.navigate(['/']);
    } catch {
      this.snackBar.open(
        'Failed to connect to server. Please check the URL and try again.',
        'Close',
        {
          duration: 5000,
        }
      );
    }
  }

  protected async setupLocalMode(): Promise<void> {
    // Use defaults if fields are empty
    const username = this.userName.trim() || 'local';
    const displayName = this.displayName.trim() || 'Local User';

    try {
      this.setupService.configureLocalMode({
        username: username,
        name: displayName,
      });

      // Initialize the user service after configuration
      await this.unifiedUserService.initialize();

      this.snackBar.open('Browser profile ready!', 'Close', {
        duration: 3000,
      });
      await this.router.navigate(['/']);
    } catch {
      this.snackBar.open('Failed to configure local mode', 'Close', {
        duration: 3000,
      });
    }
  }

  /** Finish a fresh cloud connection: write the manifest, configure the app */
  protected async setupCloudProfile(): Promise<void> {
    const pending = this.pendingCloudConnection();
    if (!pending) {
      this.snackBar.open(
        'Your cloud connection expired. Please connect again.',
        'Close',
        { duration: 5000 }
      );
      this.goBack();
      return;
    }

    const username = this.userName.trim() || pending.suggestedUsername;
    const displayName = this.displayName.trim() || pending.suggestedName;
    const providerName = getCloudProviderDisplayName(pending.provider);

    this.isConnectingCloud.set(true);
    try {
      const config = await this.cloudSyncConnect.finishNewConnection(pending, {
        username,
        name: displayName,
      });
      if (await this.finishUpgradeInto(config.id, username, providerName)) {
        return;
      }
      await this.unifiedUserService.initialize();
      this.snackBar.open(`Connected to ${providerName}!`, 'Close', {
        duration: 3000,
      });
      await this.router.navigate(['/'], { replaceUrl: true });
    } catch (error) {
      console.error('Failed to finish cloud sync setup:', error);
      this.snackBar.open(
        `Failed to set up ${providerName} sync. Please try again.`,
        'Close',
        { duration: 5000 }
      );
    } finally {
      this.isConnectingCloud.set(false);
    }
  }

  /**
   * Decide which cloud step follows a successful connect.
   *
   * - Fresh account: name the first profile.
   * - Account with authors, plain add: choose one or add a new one.
   * - Account with authors, upgrading: if the source's username is already
   *   there, copy into it (after resolving clashing project addresses);
   *   otherwise add the source as a new author.
   */
  private openCloudProfileStep(pending: PendingCloudConnection): void {
    const existing = pending.existingProfiles ?? [];
    const source = this.upgradeSourceConfig();
    if (existing.length === 0) {
      this.prefillCloudProfile(pending);
      this.showCloudProfileSetup.set(true);
      return;
    }
    if (source?.userProfile) {
      const match = existing.find(p =>
        sameUsername(p.username, source.userProfile!.username)
      );
      if (match) {
        this.prepareClashStep(source.id, match);
        return;
      }
      this.prefillCloudProfile(pending);
      this.showCloudProfileSetup.set(true);
      return;
    }
    this.showCloudChooseProfile.set(true);
  }

  /** Work out which source projects collide with the destination author */
  private prepareClashStep(
    sourceId: string,
    destination: { name: string; username: string; slugs: string[] }
  ): void {
    const destinationSlugs = new Set(
      destination.slugs.map(s => s.toLowerCase())
    );
    const sourceProjects = this.storageContext
      .listProjectsForContext(sourceId)
      .filter(p => sameUsername(p.username, destination.username));
    // Every source project is copied, so its address is taken too
    this.takenSlugs = new Set([
      ...destinationSlugs,
      ...sourceProjects.map(p => p.slug.toLowerCase()),
    ]);
    const clashes = sourceProjects
      .filter(p => destinationSlugs.has(p.slug.toLowerCase()))
      .map(p => ({
        slug: p.slug,
        title: p.title ?? p.slug,
        newSlug: this.suggestFreeSlug(p.slug),
      }));
    this.clashes.set(clashes);
    if (clashes.length === 0) {
      // Nothing collides: continue straight into the existing author
      void this.continueAsExisting(destination);
      return;
    }
    this.showCloudClash.set(true);
  }

  private suggestFreeSlug(slug: string): string {
    let candidate = `${slug}-2`;
    let n = 2;
    while (this.takenSlugs.has(candidate.toLowerCase())) {
      n++;
      candidate = `${slug}-${n}`;
    }
    return candidate;
  }

  /** Update one proposed slug on the clash step */
  protected setClashSlug(slug: string, newSlug: string): void {
    this.clashes.update(list =>
      list.map(c => (c.slug === slug ? { ...c, newSlug } : c))
    );
  }

  protected isValidClashSlug(newSlug: string): boolean {
    return (
      /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(newSlug) &&
      !this.takenSlugs.has(newSlug.toLowerCase())
    );
  }

  protected clashesResolved(): boolean {
    const chosen = this.clashes().map(c => c.newSlug.toLowerCase());
    return (
      this.clashes().every(c => this.isValidClashSlug(c.newSlug)) &&
      new Set(chosen).size === chosen.length
    );
  }

  /** Clash step confirmed: copy into the existing author with the renames */
  protected async confirmClashes(): Promise<void> {
    const pending = this.pendingCloudConnection();
    const source = this.upgradeSourceConfig();
    if (!pending || !source?.userProfile || !this.clashesResolved()) return;
    const destination = (pending.existingProfiles ?? []).find(p =>
      sameUsername(p.username, source.userProfile!.username)
    );
    if (!destination) return;
    await this.continueAsExisting(destination);
  }

  /** "Continue as X": adopt an author already in the account */
  protected async continueAsExisting(profile: {
    name: string;
    username: string;
  }): Promise<void> {
    const pending = this.pendingCloudConnection();
    if (!pending || this.isConnectingCloud()) return;
    this.isConnectingCloud.set(true);
    const providerName = getCloudProviderDisplayName(pending.provider);
    try {
      const config = this.cloudSyncConnect.adoptExistingProfile(pending, {
        name: profile.name,
        username: profile.username,
      });
      if (
        await this.finishUpgradeInto(
          config.id,
          profile.username,
          providerName,
          this.clashes()
            .filter(c => c.slug !== c.newSlug)
            .map(c => ({ oldSlug: c.slug, newSlug: c.newSlug }))
        )
      ) {
        return;
      }
      this.snackBar.open(`Connected to ${providerName}!`, 'Close', {
        duration: 3000,
      });
      // Full reload: the engine pulls this author's projects on startup
      globalThis.location.assign('/');
    } catch (error) {
      console.error('Failed to continue as existing profile:', error);
      this.snackBar.open(
        `Failed to set up ${providerName} sync. Please try again.`,
        'Close',
        { duration: 5000 }
      );
      this.isConnectingCloud.set(false);
    }
  }

  /** "Add a new profile" from the chooser: fall through to the profile form */
  protected addNewCloudProfile(): void {
    const pending = this.pendingCloudConnection();
    if (!pending) return;
    this.prefillCloudProfile(pending);
    this.showCloudChooseProfile.set(false);
    this.showCloudProfileSetup.set(true);
  }

  /**
   * When this connect is an upgrade, copy the source profile into the new
   * cloud profile (applying any renames) and reload. Returns true when the
   * page is navigating away.
   */
  private async finishUpgradeInto(
    targetId: string,
    username: string,
    providerName: string,
    renames: { oldSlug: string; newSlug: string }[] = []
  ): Promise<boolean> {
    const upgradeSource = takeProfileUpgradeSource();
    if (!upgradeSource || upgradeSource === targetId) return false;
    const source = this.storageContext.getConfigById(upgradeSource);
    let projectCount: number;
    try {
      ({ projectCount } = await this.profileManager.upgradeInto(
        upgradeSource,
        targetId,
        username,
        renames
      ));
    } catch (error) {
      // The new profile exists but nothing was copied yet: keep the marker
      // so a retry still knows which profile to copy from
      setProfileUpgradeSource(upgradeSource);
      throw error;
    }
    // The same author under the same name now lives in the cloud profile, so
    // the Browser copy is redundant and only invites confusion. A different
    // username means the user deliberately kept two identities: keep both.
    const sameAuthor =
      !!source?.userProfile &&
      sameUsername(source.userProfile.username, username);
    if (sameAuthor) {
      await this.profileManager.disconnect(upgradeSource);
    }
    const moved =
      projectCount === 1
        ? `Moved 1 project to ${providerName}.`
        : `Moved ${projectCount} projects to ${providerName}.`;
    this.snackBar.open(
      sameAuthor
        ? `${moved} The Browser copy was removed. Syncing now.`
        : `${moved} Syncing now.`,
      'Close',
      { duration: 5000 }
    );
    globalThis.location.assign('/');
    return true;
  }

  /**
   * An author in the account that already has a profile on this device.
   * Offered greyed out: switching profiles is done from the user menu.
   */
  protected isAuthorLinkedHere(username: string): boolean {
    const pending = this.pendingCloudConnection();
    if (!pending) return false;
    return this.storageContext
      .getConfigurations()
      .some(
        c =>
          c.type === 'cloud' &&
          c.cloudProvider === pending.provider &&
          c.cloudAccountId === pending.accountId &&
          !!c.userProfile &&
          sameUsername(c.userProfile.username, username)
      );
  }

  /**
   * Fill the profile step. When upgrading, the author keeps their existing
   * name and username so project addresses stay the same; otherwise use the
   * provider's suggestions.
   */
  private prefillCloudProfile(pending: PendingCloudConnection): void {
    const source = this.upgradeSourceConfig();
    if (source?.userProfile) {
      this.displayName = source.userProfile.name;
      this.userName = source.userProfile.username;
      return;
    }
    this.displayName = pending.suggestedName;
    this.userName = pending.suggestedUsername;
  }

  private upgradeSourceConfig() {
    const id = peekProfileUpgradeSource();
    return id ? this.storageContext.getConfigById(id) : undefined;
  }

  /** Remember the profile being upgraded for the header copy */
  private loadUpgradeSource(): void {
    const source = this.upgradeSourceConfig();
    this.upgradeSourceName.set(
      source ? this.profileManager.describe(source).name : null
    );
  }

  /** Label for the connected account shown on the profile step */
  protected pendingProviderName(): string {
    const pending = this.pendingCloudConnection();
    return pending ? getCloudProviderDisplayName(pending.provider) : '';
  }

  protected goBack(): void {
    if (!this.inSubStep()) {
      // At the mode picker: back means "return to the app"; an abandoned
      // upgrade must not silently attach to the next profile created
      takeProfileUpgradeSource();
      void this.router.navigate(['/']);
      return;
    }
    if (
      this.showCloudProfileSetup() ||
      this.showCloudChooseProfile() ||
      this.showCloudClash()
    ) {
      // Abandoning also drops provider credentials obtained for an account
      // that never became a profile
      this.cloudSyncConnect.abandonPendingConnection();
      takeProfileUpgradeSource();
      this.pendingCloudConnection.set(null);
      // Drop the ?cloud= param so a refresh doesn't reopen this step
      void this.router.navigate([], {
        replaceUrl: true,
        queryParams: {},
      });
    }
    if (this.showNextcloudSetup()) {
      // Back from the address form returns to the provider list, not the
      // top-level mode picker
      this.showNextcloudSetup.set(false);
      this.showCloudSetup.set(true);
      return;
    }
    this.showServerSetup.set(false);
    this.showLocalSetup.set(false);
    this.showCloudSetup.set(false);
    this.showCloudProfileSetup.set(false);
    this.showCloudChooseProfile.set(false);
    this.showCloudClash.set(false);
  }
}
