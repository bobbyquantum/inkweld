import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';

/** Where the app lands after the account is gone (a full page load). */
export const ACCOUNT_DELETED_URL = '/delete-account?deleted=1';

/**
 * How the server is named in deletion copy: the admin-configured name, else
 * the host of the active server profile, else the page's own host.
 */
export function accountServerName(
  configuredName: string | undefined,
  serverUrl: string | undefined
): string {
  if (configuredName) return configuredName;
  if (serverUrl) {
    try {
      return new URL(serverUrl).host;
    } catch {
      return serverUrl;
    }
  }
  return globalThis.location.host;
}

/**
 * "Delete account" danger zone: lists what will be removed and, after the
 * person types their username, deletes the signed-in server account.
 *
 * Google Play requires apps that allow account creation to let people delete
 * the account from inside the app, so this lives in Settings → Account and on
 * the public /delete-account page that the store listing links to.
 */
@Component({
  selector: 'app-delete-account',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  templateUrl: './delete-account.component.html',
  styleUrl: './delete-account.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteAccountComponent {
  private readonly userService = inject(UserService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly systemConfig = inject(SystemConfigService);
  private readonly storageContext = inject(StorageContextService);

  readonly isDeleting = signal(false);

  readonly serverName = computed(() =>
    accountServerName(
      this.systemConfig.systemFeatures().defaultServerName,
      this.storageContext.getActiveConfig()?.serverUrl
    )
  );

  async deleteAccount(): Promise<void> {
    const username = this.userService.currentUser().username;
    const server = this.serverName();
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: this.transloco.translate('settings.deleteAccount.confirmTitle'),
      message: this.transloco.translate(
        'settings.deleteAccount.confirmMessage',
        { server, username }
      ),
      confirmText: this.transloco.translate(
        'settings.deleteAccount.confirmButton'
      ),
      cancelText: this.transloco.translate('cancel'),
      requireConfirmationText: username,
    });
    if (!confirmed) return;

    this.isDeleting.set(true);
    try {
      await this.userService.deleteAccount(username);
      // Full reload: every service holds handles into this profile's storage,
      // and the database deletes queued by deleteAccount only finish once
      // they are released.
      globalThis.location.assign(ACCOUNT_DELETED_URL);
    } catch (err) {
      console.error('Failed to delete account:', err);
      this.snackBar.open(
        this.errorMessage(err),
        this.transloco.translate('close'),
        { duration: 6000 }
      );
      this.isDeleting.set(false);
    }
  }

  /** Prefer the server's explanation (e.g. "you are the only admin"). */
  private errorMessage(err: unknown): string {
    if (
      err instanceof HttpErrorResponse &&
      err.error &&
      typeof err.error === 'object' &&
      typeof (err.error as Record<string, unknown>)['error'] === 'string'
    ) {
      return (err.error as Record<string, string>)['error'];
    }
    return this.transloco.translate('settings.deleteAccount.failed');
  }
}
