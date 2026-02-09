import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.scss',
})
export class AccountSettingsComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly systemConfig = inject(SystemConfigService);
  private readonly snackBar = inject(MatSnackBar);

  readonly isLocalMode = this.systemConfig.isLocalMode;
  readonly isSaving = signal(false);

  displayName = '';
  email = '';

  ngOnInit(): void {
    const user = this.userService.currentUser();
    this.displayName = user.name ?? '';
    this.email = user.email ?? '';
  }

  async saveProfile(): Promise<void> {
    this.isSaving.set(true);

    try {
      const data: { name?: string; email?: string } = {};

      const currentUser = this.userService.currentUser();
      const newName = this.displayName.trim();
      const newEmail = this.email.trim();

      // Only send changed fields
      if (newName !== (currentUser.name ?? '')) {
        data.name = newName;
      }
      if (!this.isLocalMode() && newEmail !== (currentUser.email ?? '')) {
        data.email = newEmail;
      }

      if (Object.keys(data).length === 0) {
        this.snackBar.open('No changes to save', 'Close', { duration: 2000 });
        return;
      }

      await this.userService.updateProfile(data);
      this.snackBar.open('Profile updated', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to update profile:', err);
      let message = 'Failed to update profile';
      if (
        err instanceof HttpErrorResponse &&
        err.error &&
        typeof err.error === 'object'
      ) {
        const body = err.error as Record<string, unknown>;
        if ('error' in body && typeof body['error'] === 'string') {
          message = body['error'];
        }
      }
      this.snackBar.open(message, 'Close', {
        duration: 3000,
      });
    } finally {
      this.isSaving.set(false);
    }
  }
}
