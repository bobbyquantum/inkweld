import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterOutlet } from '@angular/router';
import { TutorialOverlayComponent } from '@components/tutorial-overlay/tutorial-overlay.component';
import { TranslocoModule } from '@jsverse/transloco';
import { isLocalOrCloudMode } from '@services/core/storage-context.service';

import { ThemeService } from '../themes/theme.service';
import { CloudSyncEngineService } from './services/cloud-sync/cloud-sync-engine.service';
import { BackgroundService } from './services/core/background.service';
import { LocaleService } from './services/core/locale.service';
import { SetupService } from './services/core/setup.service';
import { UpdateService } from './services/core/update.service';
import { VersionCompatibilityService } from './services/core/version-compatibility.service';
import { ViewportService } from './services/core/viewport.service';
import { BackgroundSyncService } from './services/local/background-sync.service';
import { UnifiedUserService } from './services/user/unified-user.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatButtonModule,
    TranslocoModule,
    TutorialOverlayComponent,
  ],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  protected readonly offlineMode = signal(false);
  protected readonly themeService = inject(ThemeService);
  protected readonly setupService = inject(SetupService);
  private readonly localeService = inject(LocaleService);
  protected readonly updateService = inject(UpdateService);
  protected readonly versionCompatibility = inject(VersionCompatibilityService);
  protected readonly viewportService = inject(ViewportService);
  protected readonly unifiedUserService = inject(UnifiedUserService);
  protected readonly backgroundSync = inject(BackgroundSyncService);
  private readonly cloudSync = inject(CloudSyncEngineService);
  private readonly backgroundService = inject(BackgroundService);
  protected readonly router = inject(Router);

  // Track if we ever had a real authenticated user session
  private hadRealUser = false;

  constructor() {
    // Track when we get a real user (not anonymous)
    effect(() => {
      const user = this.unifiedUserService.currentUser();
      if (user && user.username !== 'anonymous') {
        this.hadRealUser = true;
      }
    });

    // The background surface follows authentication, not the route: every
    // signed-in page (home, profile, settings, ...) shares the personalisable
    // app surface, and a hard refresh on any of them must resolve the same way
    // a navigation from home would.
    effect(() => {
      this.backgroundService.setSurface(
        this.unifiedUserService.isAuthenticated() ? 'app' : 'login'
      );
    });
  }

  ngOnInit(): void {
    this.themeService.initTheme();
    // Applies the cached background synchronously before the config fetch, so
    // a branded login page does not flash the bundled default first.
    this.backgroundService.initialize();
    this.localeService.init();
    this.updateService.initialize();
    void this.initializeApp();
  }

  protected shouldShowErrorBar(): boolean {
    const error = this.unifiedUserService.error();

    return !!(
      error &&
      'code' in error &&
      error.code === 'SESSION_EXPIRED' &&
      !this.offlineMode() &&
      this.hadRealUser // Only show if we previously had a real user session
    );
  }

  protected async handleReAuthenticate(): Promise<void> {
    this.offlineMode.set(false);
    await this.unifiedUserService.logout();
  }

  protected handleContinueOffline(): void {
    this.offlineMode.set(true);
  }

  protected refreshPage(): void {
    globalThis.location.reload();
  }

  private async initializeApp(): Promise<void> {
    try {
      // Use window.location.pathname because this.router.url is still '/'
      // during bootstrap before the router resolves the actual URL.
      const currentPath = globalThis.location.pathname;

      // The cloud sync OAuth callback is what *creates* the configuration on
      // a fresh browser, so it must be allowed through unconfigured.
      const isCloudSyncCallback = currentPath.startsWith(
        '/cloud-sync/callback'
      );

      // Check if app is configured
      const isConfigured = this.setupService.checkConfiguration();

      if (!isConfigured && !isCloudSyncCallback) {
        // Redirect to setup if not configured
        await this.router.navigate(['/setup']);
        return;
      }

      // Skip user initialization if we're on registration-related pages
      // This prevents session expired errors for users who just registered
      // but need approval or are being redirected.
      const skipUserLoading =
        currentPath.startsWith('/register') ||
        currentPath.startsWith('/welcome') ||
        currentPath.startsWith('/approval-pending') ||
        currentPath.startsWith('/oauth') ||
        isCloudSyncCallback;

      if (!skipUserLoading) {
        // Initialize user service based on mode
        await this.unifiedUserService.initialize();
      }

      // Set offline mode flag for UI
      const mode = this.setupService.getMode();
      this.offlineMode.set(isLocalOrCloudMode(mode));

      // Check version compatibility with server (only in server mode)
      // This runs in the background and updates syncBlocked signal if mismatch
      if (mode === 'server') {
        void this.versionCompatibility.initialize();
      }

      // Initialize background sync service for pending changes
      this.backgroundSync.initialize();

      // Cloud Sync mode: mirror local state to the user's cloud storage
      if (mode === 'cloud' && !skipUserLoading) {
        this.cloudSync.initialize();
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      // On any error, redirect to setup
      await this.router.navigate(['/setup']);
    }
  }
}
