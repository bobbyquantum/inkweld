import {
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '@dialogs/confirmation-dialog/confirmation-dialog.component';
import { AdminConfigService } from '@services/admin/admin-config.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { firstValueFrom } from 'rxjs';

import { AiKillSwitchDialogComponent } from './ai-kill-switch-dialog/ai-kill-switch-dialog.component';

@Component({
  selector: 'app-admin-settings',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class AdminSettingsComponent implements OnInit {
  private readonly configService = inject(AdminConfigService);
  private readonly systemConfigService = inject(SystemConfigService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly error = signal<Error | null>(null);
  readonly userApprovalRequired = signal(false);
  readonly requireEmailEnabled = signal(false);

  // AI Kill Switch state
  readonly aiKillSwitchEnabled = signal(true); // Default to ON (AI disabled)
  readonly aiKillSwitchLockedByEnv = signal(false);

  // Password policy state
  readonly passwordMinLength = signal(8);
  readonly passwordRequireUppercase = signal(true);
  readonly passwordRequireLowercase = signal(true);
  readonly passwordRequireNumber = signal(true);
  readonly passwordRequireSymbol = signal(true);

  // Site URL state
  readonly siteUrl = signal('');

  // Passkeys state
  readonly passkeysEnabled = signal(true);

  // Passwordless / recovery flags. Defaults match the backend defaults
  // (passwordLogin: false, emailRecovery: false). The component overwrites
  // them with the live values during loadConfig().
  readonly passwordLoginEnabled = signal(false);
  readonly emailRecoveryEnabled = signal(false);

  /**
   * True when the server has outbound email (SMTP) configured. When false,
   * email-based recovery is non-functional even if the toggle is on, so we
   * disable the toggle and show a warning.
   */
  readonly isEmailEnabled = this.systemConfigService.isEmailEnabled;

  /**
   * Hide the Password Policy card when password login is disabled — the
   * policy only constrains password creation, so it would be irrelevant
   * (and confusing) in a passwordless deployment.
   */
  readonly showPasswordPolicy = computed(() => this.passwordLoginEnabled());

  ngOnInit(): void {
    void this.loadConfig();
  }

  async loadConfig(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const [
        userApproval,
        aiKillSwitch,
        requireEmail,
        passwordMinLength,
        passwordRequireUppercase,
        passwordRequireLowercase,
        passwordRequireNumber,
        passwordRequireSymbol,
        siteUrl,
        passkeysEnabled,
        passwordLoginEnabled,
        emailRecoveryEnabled,
      ] = await Promise.all([
        this.configService.getConfig('USER_APPROVAL_REQUIRED'),
        this.configService.getConfig('AI_KILL_SWITCH'),
        this.configService.getConfig('REQUIRE_EMAIL'),
        this.configService.getConfig('PASSWORD_MIN_LENGTH'),
        this.configService.getConfig('PASSWORD_REQUIRE_UPPERCASE'),
        this.configService.getConfig('PASSWORD_REQUIRE_LOWERCASE'),
        this.configService.getConfig('PASSWORD_REQUIRE_NUMBER'),
        this.configService.getConfig('PASSWORD_REQUIRE_SYMBOL'),
        this.configService.getConfig('SITE_URL'),
        this.configService.getConfig('PASSKEYS_ENABLED'),
        this.configService.getConfig('PASSWORD_LOGIN_ENABLED'),
        this.configService.getConfig('EMAIL_RECOVERY_ENABLED'),
      ]);

      this.userApprovalRequired.set(userApproval?.value === 'true');
      this.requireEmailEnabled.set(requireEmail?.value === 'true');

      // Password policy
      this.passwordMinLength.set(
        Math.max(1, Number.parseInt(passwordMinLength?.value || '8', 10) || 8)
      );
      this.passwordRequireUppercase.set(
        passwordRequireUppercase?.value !== 'false'
      );
      this.passwordRequireLowercase.set(
        passwordRequireLowercase?.value !== 'false'
      );
      this.passwordRequireNumber.set(passwordRequireNumber?.value !== 'false');
      this.passwordRequireSymbol.set(passwordRequireSymbol?.value !== 'false');

      // Site URL
      this.siteUrl.set(siteUrl?.value || '');

      // Passkeys — default is true (enabled) when no value stored
      this.passkeysEnabled.set(passkeysEnabled?.value !== 'false');

      // Passwordless flags. Both default to FALSE when no value stored — the
      // backend's safe default is "passwordless-first" but we still need an
      // explicit opt-in for password login + email recovery so admins can't
      // accidentally enable email flows on a server with no SMTP configured.
      this.passwordLoginEnabled.set(passwordLoginEnabled?.value === 'true');
      this.emailRecoveryEnabled.set(emailRecoveryEnabled?.value === 'true');

      // For AI kill switch, also check the system config for lockedByEnv status
      const aiKillSwitchValue = aiKillSwitch?.value !== 'false'; // Default to true
      this.aiKillSwitchEnabled.set(aiKillSwitchValue);

      // Get lock status from system config
      this.aiKillSwitchLockedByEnv.set(
        this.systemConfigService.isAiKillSwitchLockedByEnv()
      );
    } catch (err) {
      console.error('Failed to load config:', err);
      this.error.set(
        err instanceof Error ? err : new Error('Failed to load configuration')
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleUserApproval(enabled: boolean): Promise<void> {
    this.isSaving.set(true);

    try {
      await this.configService.setConfig(
        'USER_APPROVAL_REQUIRED',
        enabled ? 'true' : 'false'
      );
      this.userApprovalRequired.set(enabled);
      this.snackBar.open('Setting saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      // Revert toggle on failure
      this.userApprovalRequired.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }

  async toggleRequireEmail(enabled: boolean): Promise<void> {
    this.isSaving.set(true);

    try {
      await this.configService.setConfig(
        'REQUIRE_EMAIL',
        enabled ? 'true' : 'false'
      );
      this.requireEmailEnabled.set(enabled);
      this.systemConfigService.refreshSystemFeatures();
      this.snackBar.open('Setting saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      this.requireEmailEnabled.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }

  async savePasswordMinLength(value: string): Promise<void> {
    const num = Math.max(1, Number.parseInt(value, 10) || 8);
    this.isSaving.set(true);

    try {
      await this.configService.setConfig('PASSWORD_MIN_LENGTH', String(num));
      this.passwordMinLength.set(num);
      this.systemConfigService.refreshSystemFeatures();
      this.snackBar.open('Setting saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  async togglePasswordPolicy(
    key:
      | 'PASSWORD_REQUIRE_UPPERCASE'
      | 'PASSWORD_REQUIRE_LOWERCASE'
      | 'PASSWORD_REQUIRE_NUMBER'
      | 'PASSWORD_REQUIRE_SYMBOL',
    enabled: boolean
  ): Promise<void> {
    this.isSaving.set(true);

    const signalMap = {
      PASSWORD_REQUIRE_UPPERCASE: this.passwordRequireUppercase,
      PASSWORD_REQUIRE_LOWERCASE: this.passwordRequireLowercase,
      PASSWORD_REQUIRE_NUMBER: this.passwordRequireNumber,
      PASSWORD_REQUIRE_SYMBOL: this.passwordRequireSymbol,
    } as const;

    try {
      await this.configService.setConfig(key, enabled ? 'true' : 'false');
      signalMap[key].set(enabled);
      this.systemConfigService.refreshSystemFeatures();
      this.snackBar.open('Setting saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      signalMap[key].set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveSiteUrl(value: string): Promise<void> {
    this.isSaving.set(true);

    try {
      await this.configService.setConfig('SITE_URL', value.trim());
      this.siteUrl.set(value.trim());
      this.snackBar.open('Setting saved', 'Close', { duration: 2000 });
    } catch (err) {
      console.error('Failed to save setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Handle AI kill switch toggle with confirmation dialog
   */
  async toggleAiKillSwitch(enabled: boolean): Promise<void> {
    // If disabling the kill switch (enabling AI), show warning dialog
    if (!enabled) {
      const dialogRef = this.dialog.open<
        AiKillSwitchDialogComponent,
        void,
        boolean
      >(AiKillSwitchDialogComponent, {
        width: '500px',
        disableClose: true,
      });

      const confirmed: boolean | undefined = await firstValueFrom(
        dialogRef.afterClosed()
      );
      if (!confirmed) {
        // User cancelled, revert the toggle
        return;
      }
    }

    this.isSaving.set(true);

    try {
      await this.configService.setConfig(
        'AI_KILL_SWITCH',
        enabled ? 'true' : 'false'
      );
      this.aiKillSwitchEnabled.set(enabled);

      // Refresh system config to update all AI-related features
      this.systemConfigService.refreshSystemFeatures();

      const message = enabled
        ? 'AI features disabled'
        : 'AI features enabled (warning: data may be sent to third parties)';
      this.snackBar.open(message, 'Close', { duration: 3000 });
    } catch (err) {
      console.error('Failed to save AI kill switch setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
    } finally {
      this.isSaving.set(false);
    }
  }

  async togglePasskeys(enabled: boolean): Promise<void> {
    // Refuse to disable passkeys if password login is ALSO off — that would
    // leave the server with no usable login method and lock everyone out
    // (including admins). The flag toggles aren't reversible from outside
    // the app, so this guard avoids a hard-to-recover support situation.
    if (!enabled && !this.passwordLoginEnabled()) {
      this.snackBar.open(
        'Cannot disable passkeys while password login is also disabled — ' +
          'enable password login first or no one will be able to sign in.',
        'Close',
        { duration: 5000 }
      );
      return;
    }

    this.isSaving.set(true);

    try {
      await this.configService.setConfig(
        'PASSKEYS_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.passkeysEnabled.set(enabled);
      this.systemConfigService.refreshSystemFeatures();
      this.snackBar.open(
        enabled
          ? 'Passkey authentication enabled'
          : 'Passkey authentication disabled',
        'Close',
        { duration: 2000 }
      );
    } catch (err) {
      console.error('Failed to save passkeys setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      this.passkeysEnabled.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Toggle password login. Disabling requires a typed confirmation so admins
   * are forced to acknowledge that all existing users without a passkey will
   * lose the ability to sign in (until they go through the email recovery
   * flow to enrol one).
   */
  async togglePasswordLogin(enabled: boolean): Promise<void> {
    // Symmetric guard to togglePasskeys — never allow both to be off.
    if (!enabled && !this.passkeysEnabled()) {
      this.snackBar.open(
        'Cannot disable password login while passkeys are also disabled — ' +
          'enable passkeys first or no one will be able to sign in.',
        'Close',
        { duration: 5000 }
      );
      return;
    }

    if (!enabled) {
      const data: ConfirmationDialogData = {
        title: 'Disable Password Login?',
        message:
          'Disabling password login will switch this server to ' +
          'passkey-only authentication. Existing users WITHOUT a registered ' +
          'passkey will be locked out and must use the "Lost your passkey?" ' +
          'recovery flow (which requires email to be configured) to enrol one.',
        details: [
          'New registrations will require enrolling a passkey.',
          'The /login endpoint will return 403 for password attempts.',
          'Password reset emails will be disabled.',
        ],
        cancelText: 'Cancel',
        confirmText: 'Disable Password Login',
        requireConfirmationText: 'disable password login',
      };
      const dialogRef = this.dialog.open<
        ConfirmationDialogComponent,
        ConfirmationDialogData,
        boolean
      >(ConfirmationDialogComponent, {
        width: '500px',
        disableClose: true,
        data,
      });
      const confirmed = await firstValueFrom(dialogRef.afterClosed());
      if (!confirmed) {
        return;
      }
    }

    this.isSaving.set(true);

    try {
      await this.configService.setConfig(
        'PASSWORD_LOGIN_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.passwordLoginEnabled.set(enabled);
      this.systemConfigService.refreshSystemFeatures();
      this.snackBar.open(
        enabled ? 'Password login enabled' : 'Password login disabled',
        'Close',
        { duration: 2500 }
      );
    } catch (err) {
      console.error('Failed to save password login setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      this.passwordLoginEnabled.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Toggle email-based recovery. Used both for the classic forgot-password
   * email (when password login is on) and for the magic-link passkey
   * enrolment recovery (when password login is off). Either way it depends
   * on a working outbound mailer.
   */
  async toggleEmailRecovery(enabled: boolean): Promise<void> {
    // In passwordless mode, email recovery is the ONLY way for a user who
    // has lost their device to regain access. Disabling both leaves them
    // permanently locked out, so require an explicit typed confirmation —
    // mirroring the symmetric guard on togglePasswordLogin.
    if (!enabled && !this.passwordLoginEnabled()) {
      const data: ConfirmationDialogData = {
        title: 'Disable Email Recovery?',
        message:
          'Password login is currently disabled, which means email-based ' +
          'magic-link recovery is the only way for users to regain access ' +
          'if they lose their passkey. Disabling it now will permanently ' +
          'lock out anyone who loses their device.',
        details: [
          'No fallback recovery path will exist.',
          'Affected users would need an admin to manually intervene.',
        ],
        cancelText: 'Cancel',
        confirmText: 'Disable Email Recovery',
        requireConfirmationText: 'disable email recovery',
      };
      const dialogRef = this.dialog.open<
        ConfirmationDialogComponent,
        ConfirmationDialogData,
        boolean
      >(ConfirmationDialogComponent, {
        width: '500px',
        disableClose: true,
        data,
      });
      const confirmed = await firstValueFrom(dialogRef.afterClosed());
      if (!confirmed) {
        return;
      }
    }

    this.isSaving.set(true);

    try {
      await this.configService.setConfig(
        'EMAIL_RECOVERY_ENABLED',
        enabled ? 'true' : 'false'
      );
      this.emailRecoveryEnabled.set(enabled);
      this.systemConfigService.refreshSystemFeatures();
      this.snackBar.open(
        enabled ? 'Email recovery enabled' : 'Email recovery disabled',
        'Close',
        { duration: 2500 }
      );
    } catch (err) {
      console.error('Failed to save email recovery setting:', err);
      this.snackBar.open('Failed to save setting', 'Close', { duration: 3000 });
      this.emailRecoveryEnabled.set(!enabled);
    } finally {
      this.isSaving.set(false);
    }
  }
}
