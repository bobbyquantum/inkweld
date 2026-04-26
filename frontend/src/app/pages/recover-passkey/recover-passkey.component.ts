import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';
import { PasskeyRecoveryService } from '@services/auth/passkey-recovery.service';
import { SystemConfigService } from '@services/core/system-config.service';

/**
 * "Lost your passkey?" page — collects the user's email and asks the backend
 * to send a recovery magic-link.
 *
 * Modelled on `ForgotPasswordComponent` but talks to the passkey-recovery
 * endpoints instead of the password-reset ones. The two flows are deliberately
 * symmetric so deployments can offer either, both, or neither without the UX
 * feeling inconsistent.
 *
 * Gating: the route resolver should redirect users away from here if
 * `isEmailRecoveryEnabled()` is false. This component additionally renders a
 * disabled state if it's hit directly while the flag is off, so a stale
 * bookmark doesn't 404.
 */
@Component({
  selector: 'app-recover-passkey',
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
  templateUrl: './recover-passkey.component.html',
  styleUrl: './recover-passkey.component.scss',
})
export class RecoverPasskeyComponent {
  private readonly passkeyRecoveryService = inject(PasskeyRecoveryService);
  private readonly systemConfig = inject(SystemConfigService);

  readonly isEmailRecoveryEnabled = this.systemConfig.isEmailRecoveryEnabled;

  email = '';
  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    if (!this.email.trim()) {
      this.error.set('Please enter your email address.');
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      await this.passkeyRecoveryService.requestRecovery(this.email.trim());
      // Backend always returns 200 to prevent enumeration — surface the same
      // generic confirmation regardless of whether a user was actually found.
      this.submitted.set(true);
    } catch (err: unknown) {
      console.error('Passkey recovery request error:', err);
      this.error.set('Something went wrong. Please try again later.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
