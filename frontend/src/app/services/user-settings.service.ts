import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { UserSettingsDialogComponent } from '@components/user-settings-dialog/user-settings-dialog.component';
import { UserFilesDialogComponent } from '@components/user-files-dialog/user-files-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class UserSettingsService {
  constructor(private dialog: MatDialog) {}

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
