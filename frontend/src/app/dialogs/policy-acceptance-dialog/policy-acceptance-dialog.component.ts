import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';
import { UsersService } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { SystemConfigService } from '@services/core/system-config.service';
import { firstValueFrom } from 'rxjs';

export interface PolicyAcceptanceDialogData {
  /** The version the user is being asked to accept. */
  version: string;
  /** True when the user accepted an earlier version (wording: "updated"). */
  isUpdate: boolean;
}

/** `accepted` once recorded on the server; `declined` means sign out. */
export type PolicyAcceptanceDialogResult = 'accepted' | 'declined';

/**
 * Blocking prompt shown to a signed-in user whose recorded acceptance does
 * not match the current privacy policy / terms (REQUIRE_POLICY_ACCEPTANCE).
 * Opened by PolicyAcceptanceService with disableClose — the only ways out
 * are agreeing or signing out.
 */
@Component({
  selector: 'app-policy-acceptance-dialog',
  templateUrl: './policy-acceptance-dialog.component.html',
  styleUrl: './policy-acceptance-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { 'data-testid': 'policy-acceptance-dialog' },
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    RouterLink,
    TranslocoModule,
  ],
})
export class PolicyAcceptanceDialogComponent {
  protected readonly data = inject<PolicyAcceptanceDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<
      MatDialogRef<
        PolicyAcceptanceDialogComponent,
        PolicyAcceptanceDialogResult
      >
    >(MatDialogRef);
  private readonly usersApi = inject(UsersService);
  private readonly systemConfig = inject(SystemConfigService);

  readonly hasPrivacyPolicy = this.systemConfig.hasPrivacyPolicy;
  readonly hasTerms = this.systemConfig.hasTerms;
  /**
   * What "I agree" records: the latest version this client knows about. It
   * starts as the one the gate saw and follows the features refresh below.
   */
  readonly version = computed(
    () => this.systemConfig.policyVersion() ?? this.data.version
  );
  readonly isSaving = signal(false);
  /** Set when the documents changed again while the dialog was open. */
  readonly changedWhileOpen = signal(false);
  readonly failed = signal(false);

  async accept(): Promise<void> {
    this.isSaving.set(true);
    this.failed.set(false);
    try {
      await firstValueFrom(
        this.usersApi.acceptPolicy({ version: this.version() })
      );
      this.dialogRef.close('accepted');
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 400) {
        // An admin edited the documents after we opened. Pick up the new
        // version and let the user look again before agreeing.
        this.changedWhileOpen.set(true);
        this.systemConfig.refreshSystemFeatures();
      } else {
        this.failed.set(true);
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  decline(): void {
    this.dialogRef.close('declined');
  }
}
