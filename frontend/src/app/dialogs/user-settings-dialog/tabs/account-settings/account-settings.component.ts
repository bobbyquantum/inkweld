import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PasskeysSettingsComponent } from '@components/passkeys-settings/passkeys-settings.component';
import { type UserAuthProvider } from '@inkweld/model/user';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';

@Component({
  selector: 'app-account-settings',
  imports: [
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    PasskeysSettingsComponent,
  ],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.scss',
})
export class AccountSettingsComponent implements OnInit {
  private readonly userService = inject(UserService);
  readonly systemConfig = inject(SystemConfigService);
  private readonly snackBar = inject(MatSnackBar);

  readonly isLocalMode = this.systemConfig.isLocalMode;
  readonly isSaving = signal(false);
  readonly authProvider = signal<UserAuthProvider | undefined>(undefined);

  displayName = '';
  email = '';

  ngOnInit(): void {
    const user = this.userService.currentUser();
    this.displayName = user.name ?? '';
    this.email = user.email ?? '';
    this.authProvider.set(user.authProvider);
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
