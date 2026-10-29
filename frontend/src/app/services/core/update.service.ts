import { inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { TranslocoService } from '@jsverse/transloco';
import {
  classifyUpdate,
  highlightsSince,
  readUpdateAppData,
} from '@utils/release-notes';
import { filter } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';
import { markVersionSeen } from './whats-new.service';

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

  /** The running app's version, compared with the update's `appData`. */
  readonly currentVersion: string = environment.version;

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
          const update = this.describeUpdate(evt.latestVersion.appData);
          const ref = this.dialog.open(ConfirmationDialogComponent, {
            data: update.data,
          });
          ref.afterClosed().subscribe(result => {
            dialogOpen = false;
            if (result) {
              // The dialog listed what's new, so don't announce it again
              // after the reload.
              if (update.version) markVersionSeen(update.version);
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
   * Build the update dialog from the new build's `appData`: the waiting
   * version, what kind of bump it is (beta, stable, major/minor/patch) and the
   * highlights of every release since the running one. Falls back to the
   * generic prompt when the build carries no version, or the same version
   * (preview builds between releases).
   */
  private describeUpdate(appDataValue: unknown): {
    data: ConfirmationDialogData;
    version: string | null;
  } {
    const buttons = {
      confirmText: this.t('dialogs.update.confirm', 'Update'),
      cancelText: this.t('dialogs.update.cancel', 'Later'),
    };
    const current = this.currentVersion;
    const appData = readUpdateAppData(appDataValue);
    const kind = appData ? classifyUpdate(current, appData.version) : null;
    if (!appData || !kind) {
      return {
        data: {
          ...buttons,
          title: this.t('dialogs.update.title', 'Update Available'),
          message: this.t(
            'dialogs.update.message',
            'A new version of Inkweld is available. Update now?'
          ),
        },
        version: null,
      };
    }

    const { highlights, more } = highlightsSince(appData, current);
    const params = { version: appData.version, current, count: more };
    const details =
      more > 0
        ? [...highlights, this.t('dialogs.update.more', '', params)]
        : highlights;
    return {
      data: {
        ...buttons,
        title: this.t(`dialogs.update.titles.${kind}`, 'Update Available'),
        message: this.t(
          highlights.length > 0
            ? 'dialogs.update.messageHighlights'
            : 'dialogs.update.messageVersion',
          'A new version of Inkweld is available. Update now?',
          params
        ),
        details,
      },
      version: appData.version,
    };
  }

  /**
   * Resolve a translation key, falling back to the provided English string
   * when Transloco is unavailable (e.g. in tests or if the provider is missing).
   */
  private t(
    key: string,
    fallback: string,
    params?: Record<string, unknown>
  ): string {
    return this.transloco?.translate(key, params) ?? fallback;
  }
}
