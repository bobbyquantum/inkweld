import { KeyValuePipe } from '@angular/common';
import { Component, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { PasswordResetService } from '@services/auth/password-reset.service';
import { SystemConfigService } from '@services/core/system-config.service';

interface PasswordRequirement {
  met: boolean;
  message: string;
  enabled: boolean;
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    FormsModule,
    KeyValuePipe,
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
  private readonly systemConfig = inject(SystemConfigService);
  private readonly policy = this.systemConfig.passwordPolicy;

  newPassword = '';
  confirmPassword = '';
  private token = '';

  readonly isSubmitting = signal(false);
  readonly success = signal(false);
  readonly error = signal<string | null>(null);
  readonly noToken = signal(false);

  passwordRequirements: Record<string, PasswordRequirement> = {
    minLength: {
      met: false,
      message: `At least ${this.policy().minLength} characters long`,
      enabled: true,
    },
    uppercase: {
      met: false,
      message: 'At least one uppercase letter',
      enabled: this.policy().requireUppercase,
    },
    lowercase: {
      met: false,
      message: 'At least one lowercase letter',
      enabled: this.policy().requireLowercase,
    },
    number: {
      met: false,
      message: 'At least one number',
      enabled: this.policy().requireNumber,
    },
    special: {
      met: false,
      message: 'At least one special character (@$!%*?&)',
      enabled: this.policy().requireSymbol,
    },
  };

  constructor() {
    // Sync password requirement enabled flags when policy signal changes
    effect(() => {
      const p = this.policy();
      this.passwordRequirements['minLength'].enabled = true;
      this.passwordRequirements['minLength'].message =
        `At least ${p.minLength} characters long`;
      this.passwordRequirements['uppercase'].enabled = p.requireUppercase;
      this.passwordRequirements['lowercase'].enabled = p.requireLowercase;
      this.passwordRequirements['number'].enabled = p.requireNumber;
      this.passwordRequirements['special'].enabled = p.requireSymbol;
      // Re-evaluate met status with current password
      if (this.newPassword) {
        this.updatePasswordRequirements(this.newPassword);
      }
    });
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) {
      this.noToken.set(true);
    }
  }

  onPasswordInput(): void {
    this.updatePasswordRequirements(this.newPassword);
  }

  isFormValid(): boolean {
    return (
      this.isPasswordValid() &&
      this.newPassword.length > 0 &&
      this.newPassword === this.confirmPassword
    );
  }

  isPasswordValid(): boolean {
    return Object.values(this.passwordRequirements).every(
      req => !req.enabled || req.met
    );
  }

  getPasswordError(): string | null {
    if (this.newPassword && !this.isPasswordValid()) {
      const unmet = Object.values(this.passwordRequirements).find(
        req => req.enabled && !req.met
      );
      return unmet ? unmet.message : 'Password does not meet requirements';
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

  private updatePasswordRequirements(password: string): void {
    const p = this.policy();
    this.passwordRequirements['minLength'].met = password.length >= p.minLength;
    this.passwordRequirements['uppercase'].met = /[A-Z]/.test(password);
    this.passwordRequirements['lowercase'].met = /[a-z]/.test(password);
    this.passwordRequirements['number'].met = /\d/.test(password);
    this.passwordRequirements['special'].met = /[@$!%*?&]/.test(password);
    // Sync enabled flags from current policy
    this.passwordRequirements['uppercase'].enabled = p.requireUppercase;
    this.passwordRequirements['lowercase'].enabled = p.requireLowercase;
    this.passwordRequirements['number'].enabled = p.requireNumber;
    this.passwordRequirements['special'].enabled = p.requireSymbol;
  }
}
