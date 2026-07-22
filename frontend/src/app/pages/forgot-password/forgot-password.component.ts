import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { PasswordResetService } from '@services/auth/password-reset.service';

@Component({
  selector: 'app-forgot-password',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    RouterModule,
    TranslocoModule,
  ],
  templateUrl: './forgot-password.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private readonly passwordResetService = inject(PasswordResetService);
  private readonly transloco = inject(TranslocoService);

  email = '';
  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    if (!this.email.trim()) {
      this.error.set(this.transloco.translate('validation.emailRequired'));
      return;
    }

    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      await this.passwordResetService.forgotPassword(this.email.trim());
      this.submitted.set(true);
    } catch (err: unknown) {
      console.error('Forgot password error:', err);
      this.error.set(this.transloco.translate('errors.unknown'));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
