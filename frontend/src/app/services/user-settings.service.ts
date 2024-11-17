import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { UserFilesDialogComponent } from '@dialogs/user-files-dialog/user-files-dialog.component';
import { UserSettingsDialogComponent } from '@dialogs/user-settings-dialog/user-settings-dialog.component';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class UserSettingsService {
  dialog = inject(MatDialog);

  openSettingsDialog(): Observable<void> {
    console.log('Settings');
    return this.dialog
      .open(UserSettingsDialogComponent, {
        width: '700px',
      })
      .afterClosed();
  }

  openFileDialog(): Observable<void> {
    console.log('Files');
    return this.dialog
      .open(UserFilesDialogComponent, {
        width: '700px',
      })
      .afterClosed();
  }
}
