import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import {
  type ProfileDestination,
  type ProfileInfo,
  ProfileManagerService,
  profileRemovalMessageKey,
} from '@services/core/profile-manager.service';
import { StorageContextService } from '@services/core/storage-context.service';
import { firstValueFrom } from 'rxjs';

import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '../../../confirmation-dialog/confirmation-dialog.component';

/**
 * Profile tab of the user settings dialog.
 *
 * Shows the active profile, offers a one-click switch to any other profile
 * on this device, and hands off to the profiles manager for adding, migrating
 * and cleaning up. Removing the current profile lives here too because that
 * is where users look for it.
 */
@Component({
  selector: 'app-connection-settings',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressBarModule,
    MatTooltipModule,
    TranslocoModule,
  ],
  templateUrl: './connection-settings.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './connection-settings.component.scss',
})
export class ConnectionSettingsComponent {
  private readonly profileManager = inject(ProfileManagerService);
  private readonly storageContext = inject(StorageContextService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly current = this.profileManager.activeConnection;
  protected readonly others = computed(() =>
    this.profileManager.connections().filter(c => !c.isActive)
  );
  protected readonly isBusy = signal(false);

  /** Icon for the status line of the current connection */
  protected statusIcon(info: ProfileInfo): string {
    if (info.kind === 'server')
      return info.hasCredentials ? 'cloud_done' : 'lock';
    if (info.kind === 'cloud')
      return info.hasCredentials ? 'cloud_sync' : 'cloud_off';
    return 'computer';
  }

  protected kindLabel(info: ProfileInfo): string {
    switch (info.kind) {
      case 'server':
        return this.transloco.translate('settings.connectionTab.onlineMode');
      case 'cloud':
        return this.transloco.translate('settings.connectionTab.cloudMode');
      default:
        return this.transloco.translate('settings.connectionTab.localMode');
    }
  }

  /** Switch to another connection. Full reload so every service re-binds. */
  switchTo(info: ProfileInfo): void {
    if (info.isActive) return;
    this.profileManager.switchTo(info.config.id);
    this.leaveTo('home');
  }

  /** Open the full connections manager on top of the settings dialog */
  async manageConnections(): Promise<void> {
    await this.dialogGateway.openProfileManagerDialog();
  }

  /** Back to the first-run screen without changing anything */
  goToWelcome(): void {
    this.dialog.closeAll();
    void this.router.navigate(['/setup']);
  }

  /** Disconnect the current connection after a confirmation */
  async disconnectCurrent(): Promise<void> {
    const info = this.current();
    if (!info || info.isBuiltIn) return;
    const data = await this.storageContext.describeContextData(info.config.id);
    const messageKey = profileRemovalMessageKey(info.kind);
    const confirmed = await this.confirm({
      title: this.transloco.translate(
        'dialogs.profileManager.disconnectTitle',
        { name: info.name }
      ),
      message: this.transloco.translate(messageKey),
      confirmText: this.transloco.translate(
        'dialogs.profileManager.disconnect'
      ),
      cancelText: this.transloco.translate('cancel'),
      details: [
        this.transloco.translate('dialogs.profileManager.disconnectDataLine', {
          databases: data.databases.length,
          keys: data.localStorageKeys.length,
        }),
      ],
      requireConfirmationText: info.kind === 'local' ? 'DELETE' : undefined,
    });
    if (!confirmed) return;

    this.isBusy.set(true);
    try {
      const destination = await this.profileManager.disconnect(info.config.id);
      this.leaveTo(destination);
    } catch (error) {
      console.error('Profile removal failed:', error);
      this.snackBar.open(
        this.transloco.translate('settings.connectionTab.removeFailed'),
        this.transloco.translate('close'),
        { duration: 4000 }
      );
      this.isBusy.set(false);
    }
  }

  private async confirm(data: ConfirmationDialogData): Promise<boolean> {
    const ref = this.dialog.open<
      ConfirmationDialogComponent,
      ConfirmationDialogData,
      boolean
    >(ConfirmationDialogComponent, { width: '450px', data });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  private leaveTo(destination: ProfileDestination): void {
    globalThis.location.href = destination === 'welcome' ? '/setup' : '/';
  }
}
