import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';
import { PasswordResetService } from '@services/auth/password-reset.service';

@Component({
  selector: 'app-forgot-password',
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
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private readonly passwordResetService = inject(PasswordResetService);

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
      await this.passwordResetService.forgotPassword(this.email.trim());
      this.submitted.set(true);
    } catch (err: unknown) {
      console.error('Forgot password error:', err);
      this.error.set('Something went wrong. Please try again later.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
