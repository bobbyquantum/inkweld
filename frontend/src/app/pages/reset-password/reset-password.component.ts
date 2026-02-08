import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { PasswordResetService } from '@services/auth/password-reset.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
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
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly passwordResetService = inject(PasswordResetService);

  newPassword = '';
  confirmPassword = '';
  private token = '';

  readonly isSubmitting = signal(false);
  readonly success = signal(false);
  readonly error = signal<string | null>(null);
  readonly noToken = signal(false);

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.noToken.set(true);
    }
  }

  isFormValid(): boolean {
    return (
      this.newPassword.length >= 6 && this.newPassword === this.confirmPassword
    );
  }

  getPasswordError(): string | null {
    if (this.newPassword && this.newPassword.length < 6) {
      return 'Password must be at least 6 characters';
    }
    if (this.confirmPassword && this.newPassword !== this.confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  }

  async onSubmit(): Promise<void> {
    if (!this.isFormValid()) return;

    this.isSubmitting.set(true);
    this.error.set(null);

    try {
      await this.passwordResetService.resetPassword(
        this.token,
        this.newPassword
      );
      this.success.set(true);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'error' in err &&
        typeof (err as Record<string, unknown>)['error'] === 'object'
      ) {
        const httpError = (err as Record<string, Record<string, string>>)[
          'error'
        ];
        this.error.set(httpError?.['error'] || 'Invalid or expired reset link');
      } else {
        this.error.set('Something went wrong. Please try again.');
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
