import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { ConfirmationDialogComponent } from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class UpdateService {
  private swUpdate = inject(SwUpdate);
  private dialog = inject(MatDialog);

  constructor() {
    if (this.swUpdate.isEnabled) {
      console.log('Service Worker Update Service initialized');

      this.swUpdate.versionUpdates
        .pipe(
          filter(
            (evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'
          )
        )
        .subscribe(evt => {
          console.log('New version available!', evt);
          this.showUpdateDialog();
        });

      // Check for updates every hour
      setInterval(() => {
        void this.swUpdate.checkForUpdate();
      }, 3600000);
    }
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
