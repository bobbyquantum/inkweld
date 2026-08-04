import { inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import { ConfirmationDialogComponent } from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs/operators';

import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root',
})
export class UpdateService {
  // SwUpdate is optional - may not be available in tests or when service worker is disabled
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  private readonly dialog = inject(MatDialog);
  private readonly logger = inject(LoggerService);
  private readonly transloco = inject(TranslocoService, { optional: true });

  /** Whether an update is available and waiting to be applied */
  readonly updateAvailable = signal(false);

  /** Whether we're currently checking for updates */
  readonly checking = signal(false);

  /**
   * Initialize the update service. Must be called after construction
   * to keep async operations outside the constructor.
   */
  initialize(): void {
    if (this.swUpdate?.isEnabled) {
      this.logger.info(
        'UpdateService',
        'Service Worker Update Service initialized'
      );

      // Track whether a dialog is already open so repeated VERSION_READY
      // events (multiple updates while the app stays open) don't stack dialogs.
      let dialogOpen = false;
      this.swUpdate.versionUpdates
        .pipe(
          filter(
            (evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'
          )
        )
        .subscribe(evt => {
          this.logger.info('UpdateService', 'New version available!', evt);
          this.updateAvailable.set(true);
          if (dialogOpen) return;
          dialogOpen = true;
          const ref = this.dialog.open(ConfirmationDialogComponent, {
            data: {
              title: this.t('dialogs.update.title', 'Update Available'),
              message: this.t(
                'dialogs.update.message',
                'A new version of Inkweld is available. Update now?'
              ),
              confirmText: this.t('dialogs.update.confirm', 'Update'),
              cancelText: this.t('dialogs.update.cancel', 'Later'),
            },
          });
          ref.afterClosed().subscribe(result => {
            dialogOpen = false;
            if (result) {
              globalThis.location.reload();
            }
          });
        });

      // Subscribe to unrecoverable state — the SW's cache has been
      // invalidated (e.g. by the browser evicting storage). Force reload
      // when back online so the user gets a fresh install.
      this.swUpdate.unrecoverable.subscribe(evt => {
        console.error('Service worker unrecoverable state:', evt.reason);
        if (navigator.onLine) {
          globalThis.location.reload();
        }
      });

      // Check for updates immediately on startup (only if online)
      void this.checkForUpdate();

      // Then check every hour
      setInterval(() => {
        void this.checkForUpdate();
      }, 3600000);
    }
  }

  /**
   * Manually check for updates.
   * Returns true if an update is available.
   * Skips the check when the browser is offline to avoid
   * pushing the service worker into a degraded state.
   */
  async checkForUpdate(): Promise<boolean> {
    if (!this.swUpdate?.isEnabled || !navigator.onLine) {
      return false;
    }

    this.checking.set(true);
    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();
      if (hasUpdate) {
        this.updateAvailable.set(true);
      }
      return hasUpdate;
    } catch (error) {
      console.error('Error checking for update:', error);
      return false;
    } finally {
      this.checking.set(false);
    }
  }

  /**
   * Apply the pending update by reloading the page.
   */
  applyUpdate(): void {
    globalThis.location.reload();
  }

  /**
   * Resolve a translation key, falling back to the provided English string
   * when Transloco is unavailable (e.g. in tests or if the provider is missing).
   */
  private t(key: string, fallback: string): string {
    return this.transloco?.translate(key) ?? fallback;
  }
}
