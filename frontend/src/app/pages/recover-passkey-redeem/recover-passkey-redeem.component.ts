import { Component, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { PasskeyError } from '@services/auth/passkey.service';
import { PasskeyRecoveryService } from '@services/auth/passkey-recovery.service';

/**
 * Redemption page for a passkey-recovery magic link.
 *
 * URL shape: `/recover-passkey/redeem?token=<opaque>`. The token is read from
 * the query string (NOT a path param) to mirror the password-reset link
 * format and to keep tokens out of server access logs that strip query
 * strings by default.
 *
 * Flow:
 *   1. Page loads with ?token=... → render a "Set up your new passkey" CTA.
 *   2. User clicks the CTA → triggers the WebAuthn ceremony (browser prompt).
 *      We require an explicit click rather than auto-starting on load so the
 *      ceremony is tied to a user gesture (most browsers require this) and
 *      so that link prefetchers don't burn the token.
 *   3. On success → show a success state and prompt the user to log in.
 *      The backend deliberately does NOT issue a session here, so we route
 *      them to the homepage where the login dialog can be opened.
 *   4. On failure → surface the server's error message; the token may still
 *      be valid (e.g. user cancelled the prompt) so we keep the CTA enabled.
 */
@Component({
  selector: 'app-recover-passkey-redeem',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    RouterModule,
  ],
  templateUrl: './recover-passkey-redeem.component.html',
  styleUrl: './recover-passkey-redeem.component.scss',
})
export class RecoverPasskeyRedeemComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly passkeyRecoveryService = inject(PasskeyRecoveryService);

  /** Default credential name; user can override before submitting. */
  passkeyName = 'Recovery passkey';

  private token = '';

  readonly isSubmitting = signal(false);
  readonly success = signal(false);
  readonly error = signal<string | null>(null);
  readonly noToken = signal(false);
  readonly browserUnsupported = signal(false);

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.noToken.set(true);
      return;
    }
    if (!this.passkeyRecoveryService.isSupported()) {
      this.browserUnsupported.set(true);
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.token || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      await this.passkeyRecoveryService.redeemRecovery(
        this.token,
        this.passkeyName.trim() || undefined
      );
      this.success.set(true);
    } catch (err: unknown) {
      // PasskeyError carries a human-readable message — use it directly.
      // CANCELLED keeps the form usable so the user can retry without
      // requesting a brand-new email.
      if (err instanceof PasskeyError) {
        this.error.set(err.message);
      } else {
        this.error.set(
          'Could not enrol your new passkey. The link may be invalid or expired.'
        );
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * After successful enrolment, send the user back to the homepage. We don't
   * auto-open the login dialog because dialog state is owned by the home
   * component; a future enhancement could pass a query param to trigger it.
   */
  async goToLogin(): Promise<void> {
    await this.router.navigate(['/'], {
      queryParams: { showLogin: 'true' },
    });
  }
}
