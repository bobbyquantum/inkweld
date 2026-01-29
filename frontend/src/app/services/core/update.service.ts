import { inject, Injectable, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { ConfirmationDialogComponent } from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class UpdateService {
  // SwUpdate is optional - may not be available in tests or when service worker is disabled
  private swUpdate = inject(SwUpdate, { optional: true });
  private dialog = inject(MatDialog);

  /** Whether an update is available and waiting to be applied */
  readonly updateAvailable = signal(false);

  /** Whether we're currently checking for updates */
  readonly checking = signal(false);

  constructor() {
    if (this.swUpdate?.isEnabled) {
      console.log('Service Worker Update Service initialized');

      this.swUpdate.versionUpdates
        .pipe(
          filter(
            (evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'
          )
        )
        .subscribe(evt => {
          console.log('New version available!', evt);
          this.updateAvailable.set(true);
          this.showUpdateDialog();
        });

      // Check for updates immediately on startup (don't wait an hour!)
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
   */
  async checkForUpdate(): Promise<boolean> {
    if (!this.swUpdate?.isEnabled) {
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
    window.location.reload();
  }

  private showUpdateDialog(): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Update Available',
        message: 'A new version of Inkweld is available. Update now?',
        confirmText: 'Update',
        cancelText: 'Later',
      },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        window.location.reload();
      }
    });
  }
}
