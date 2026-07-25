import { KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { PasswordResetService } from '@services/auth/password-reset.service';
import { SystemConfigService } from '@services/core/system-config.service';

interface PasswordRequirement {
  met: boolean;
  /** Translation key rendered reactively in the template via the transloco pipe. */
  messageKey: string;
  /** Interpolation params for messageKey (e.g. { min: 8 } for reqMinLength). */
  messageParams: Record<string, unknown>;
  enabled: boolean;
}

@Component({
  selector: 'app-reset-password',
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
    TranslocoModule,
  ],
  templateUrl: './reset-password.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly passwordResetService = inject(PasswordResetService);
  private readonly systemConfig = inject(SystemConfigService);
  private readonly transloco = inject(TranslocoService);
  private readonly policy = this.systemConfig.passwordPolicy;

  newPassword = '';
  confirmPassword = '';
  private token = '';

  readonly isSubmitting = signal(false);
  readonly success = signal(false);
  readonly error = signal<string | null>(null);
  readonly noToken = signal(false);

  passwordRequirements!: Record<string, PasswordRequirement>;

  constructor() {
    // Transloco translations load asynchronously via HTTP. Calling
    // transloco.translate() here in the constructor would return the raw key
    // (e.g. 'auth.registration.reqMinLength') before the loader resolves,
    // leaving the rendered requirement text blank/key-shaped. Instead we
    // store the key + params and render via the `| transloco` pipe in the
    // template, which re-evaluates when the translation map loads.
    this.passwordRequirements = {
      minLength: {
        met: false,
        messageKey: 'auth.registration.reqMinLength',
        messageParams: { min: this.policy().minLength },
        enabled: true,
      },
      uppercase: {
        met: false,
        messageKey: 'auth.registration.reqUppercase',
        messageParams: {},
        enabled: this.policy().requireUppercase,
      },
      lowercase: {
        met: false,
        messageKey: 'auth.registration.reqLowercase',
        messageParams: {},
        enabled: this.policy().requireLowercase,
      },
      number: {
        met: false,
        messageKey: 'auth.registration.reqNumber',
        messageParams: {},
        enabled: this.policy().requireNumber,
      },
      special: {
        met: false,
        messageKey: 'auth.registration.reqSpecial',
        messageParams: {},
        enabled: this.policy().requireSymbol,
      },
    };
    // Sync password requirement enabled flags when policy signal changes.
    effect(() => {
      const p = this.policy();
      this.passwordRequirements['minLength'].enabled = true;
      this.passwordRequirements['minLength'].messageParams = {
        min: p.minLength,
      };
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
      return unmet
        ? unmet.message
        : this.transloco.translate('auth.registration.passwordTooWeak');
    }
    if (this.confirmPassword && this.newPassword !== this.confirmPassword) {
      return this.transloco.translate('auth.registration.passwordsMismatch');
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
        this.error.set(
          httpError?.['error'] || this.transloco.translate('errors.unknown')
        );
      } else {
        this.error.set(this.transloco.translate('errors.unknown'));
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
