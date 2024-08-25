import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { UserSettingsDialogComponent } from '@components/user-settings-dialog/user-settings-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class UserSettingsService {
  constructor(private dialog: MatDialog) {}

  openSettingsDialog(): Observable<void> {
    console.log('Settings');
    return this.dialog
      .open(UserSettingsDialogComponent, {
        width: '500px',
        // other configuration options
      })
      .afterClosed();
  }
}
