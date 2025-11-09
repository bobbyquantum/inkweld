import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterOutlet } from '@angular/router';

import { ThemeService } from '../themes/theme.service';
import { SetupService } from './services/setup.service';
import { UnifiedUserService } from './services/unified-user.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatButtonModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  protected readonly offlineMode = signal(false);
  protected readonly themeService = inject(ThemeService);
  protected readonly setupService = inject(SetupService);
  protected readonly unifiedUserService = inject(UnifiedUserService);
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
  }

  ngOnInit(): void {
    this.themeService.initTheme();
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

  private async initializeApp(): Promise<void> {
    try {
      // Check if app is configured
      const isConfigured = this.setupService.checkConfiguration();

      if (!isConfigured) {
        // Redirect to setup if not configured
        await this.router.navigate(['/setup']);
        return;
      }

      // Skip user initialization if we're on registration-related pages
      // This prevents session expired errors for users who just registered
      // but need approval or are being redirected
      const currentUrl = this.router.url;
      const skipUserLoading =
        currentUrl.startsWith('/register') ||
        currentUrl.startsWith('/welcome') ||
        currentUrl.startsWith('/approval-pending');

      if (!skipUserLoading) {
        // Initialize user service based on mode
        await this.unifiedUserService.initialize();
      }

      // Set offline mode flag for UI
      const mode = this.setupService.getMode();
      this.offlineMode.set(mode === 'offline');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      // On any error, redirect to setup
      await this.router.navigate(['/setup']);
    }
  }
}




