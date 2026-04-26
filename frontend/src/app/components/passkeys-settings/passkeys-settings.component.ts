import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { Passkey } from '@inkweld/index';
import { PasskeyError, PasskeyService } from '@services/auth/passkey.service';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';

/**
 * Passkey management section for the account settings page.
 *
 * Lists existing passkeys and lets the user register, rename, or delete
 * them. The component is intentionally self-contained so it can also be
 * embedded in other settings surfaces in the future.
 */
@Component({
  selector: 'app-passkeys-settings',
  templateUrl: './passkeys-settings.component.html',
  styleUrls: ['./passkeys-settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
})
export class PasskeysSettingsComponent implements OnInit {
  private readonly passkeyService = inject(PasskeyService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogGateway = inject(DialogGatewayService);

  readonly isSupported = this.passkeyService.isSupported();
  readonly passkeys = signal<Passkey[]>([]);
  readonly loading = signal(true);
  readonly registering = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly hasPasskeys = computed(() => this.passkeys().length > 0);

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.passkeyService.list();
      this.passkeys.set(result.passkeys);
    } catch (err) {
      this.error.set(this.toMessage(err, 'Failed to load passkeys.'));
    } finally {
      this.loading.set(false);
    }
  }

  async register(): Promise<void> {
    if (!this.isSupported) {
      this.snackBar.open('This browser does not support passkeys.', 'Dismiss', {
        duration: 3000,
      });
      return;
    }

    this.registering.set(true);
    try {
      // We let the user name the key after the prompt completes so that the
      // browser-native UI is the first thing they see (more familiar UX).
      await this.passkeyService.register();
      this.snackBar.open('Passkey added.', 'Dismiss', { duration: 3000 });
      await this.refresh();
    } catch (err) {
      if (err instanceof PasskeyError && err.code === 'CANCELLED') {
        return; // user cancelled - silent
      }
      this.snackBar.open(
        this.toMessage(err, 'Failed to add passkey.'),
        'Dismiss',
        { duration: 4000 }
      );
    } finally {
      this.registering.set(false);
    }
  }

  async rename(passkey: Passkey): Promise<void> {
    const newName = await this.dialogGateway.openRenameDialog({
      currentName: passkey.name ?? '',
      title: 'Rename passkey',
    });
    if (newName === null || newName.trim() === '' || newName === passkey.name) {
      return;
    }
    const trimmed = newName.trim();

    this.busyId.set(passkey.id);
    try {
      await this.passkeyService.rename(passkey.id, trimmed);
      this.passkeys.update(list =>
        list.map(p => (p.id === passkey.id ? { ...p, name: trimmed } : p))
      );
      this.snackBar.open('Passkey renamed.', 'Dismiss', { duration: 2000 });
    } catch (err) {
      this.snackBar.open(
        this.toMessage(err, 'Failed to rename passkey.'),
        'Dismiss',
        { duration: 4000 }
      );
    } finally {
      this.busyId.set(null);
    }
  }

  async delete(passkey: Passkey): Promise<void> {
    const confirmed = await this.dialogGateway.openConfirmationDialog({
      title: 'Delete passkey',
      message: `Delete "${passkey.name ?? 'Unnamed passkey'}"? You will no longer be able to sign in with this passkey.`,
      confirmText: 'Delete',
    });
    if (!confirmed) return;

    this.busyId.set(passkey.id);
    try {
      await this.passkeyService.delete(passkey.id);
      this.passkeys.update(list => list.filter(p => p.id !== passkey.id));
      this.snackBar.open('Passkey deleted.', 'Dismiss', { duration: 2000 });
    } catch (err) {
      this.snackBar.open(
        this.toMessage(err, 'Failed to delete passkey.'),
        'Dismiss',
        { duration: 4000 }
      );
    } finally {
      this.busyId.set(null);
    }
  }

  formatDate(timestamp: number | null | undefined): string {
    if (!timestamp) return '—';
    // Backend stores passkey timestamps in seconds (see passkey.service.ts);
    // JS Date wants milliseconds.
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  isBusy(id: string): boolean {
    return this.busyId() === id;
  }

  private toMessage(err: unknown, fallback: string): string {
    if (err instanceof PasskeyError) return err.message;
    if (err instanceof Error) return err.message;
    return fallback;
  }
}
