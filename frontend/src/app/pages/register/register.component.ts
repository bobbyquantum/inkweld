import { KeyValuePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';
import { OAuthProviderListComponent } from '@components/oauth-provider-list/oauth-provider-list.component';
import { UserAPIService, UserRegisterDto } from '@inkweld/index';
import { UserService } from '@services/user.service';
import { XsrfService } from '@services/xsrf.service';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-register',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    OAuthProviderListComponent,
    KeyValuePipe,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnInit, OnDestroy {
  registerForm: FormGroup;
  isMobile = false;
  isRegistering = false;
  usernameSuggestions: string[] | undefined = [];
  usernameAvailability: 'available' | 'unavailable' | 'unknown' = 'unknown';
  serverValidationErrors: { [key: string]: string[] } = {};

  passwordRequirements = {
    minLength: {
      met: false,
      message: 'At least 8 characters long',
    },
    uppercase: {
      met: false,
      message: 'At least one uppercase letter',
    },
    lowercase: {
      met: false,
      message: 'At least one lowercase letter',
    },
    number: {
      met: false,
      message: 'At least one number',
    },
    special: {
      met: false,
      message: 'At least one special character (@$!%*?&)',
    },
  };

  private userService = inject(UserAPIService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private xsrfService = inject(XsrfService);
  private authService = inject(UserService);
  private fb = inject(FormBuilder);
  private destroy$ = new Subject<void>();

  constructor() {
    this.registerForm = this.fb.group(
      {
        username: ['', [Validators.required, Validators.minLength(3)]],
        password: [
          '',
          [
            Validators.required,
            Validators.minLength(8),
            this.createPasswordValidator(),
          ],
        ],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validators: this.passwordMatchValidator,
      }
    );

    // Listen for value changes to reset validation states
    this.registerForm
      .get('username')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.usernameAvailability = 'unknown';
      });

    // Listen for password changes to update requirements status
    this.registerForm
      .get('password')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((password: string) => {
        this.updatePasswordRequirements(password);
      });
  }

  // Helper methods for the template
  get usernameControl() {
    return this.registerForm.get('username');
  }

  get passwordControl() {
    return this.registerForm.get('password');
  }

  get confirmPasswordControl() {
    return this.registerForm.get('confirmPassword');
  }

  ngOnInit(): void {
    this.isMobile = window.innerWidth < 768;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Custom validator to check if passwords match
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value as string;
    const confirmPassword = control.get('confirmPassword')?.value as string;

    return password && confirmPassword && password !== confirmPassword
      ? { passwordMismatch: true }
      : null;
  }

  isPasswordValid(): boolean {
    return Object.values(this.passwordRequirements).every(req => req.met);
  }

  selectSuggestion(suggestion: string): void {
    this.registerForm.get('username')?.setValue(suggestion);
    this.usernameSuggestions = [];
    void this.checkUsernameAvailability();
  }

  // Check if username is available
  async checkUsernameAvailability(): Promise<void> {
    const username = this.registerForm.get('username')?.value as string;

    if (!username || username.length < 3) {
      this.usernameAvailability = 'unknown';
      this.usernameSuggestions = [];
      return;
    }

    try {
      const response = await firstValueFrom(
        this.userService.userControllerCheckUsernameAvailability(username)
      );

      if (response.available) {
        this.usernameAvailability = 'available';
        this.usernameSuggestions = [];
        this.registerForm.get('username')?.setErrors(null);
      } else {
        this.usernameAvailability = 'unavailable';
        this.usernameSuggestions = response.suggestions || [];
        // Set error on the form control to trigger Material's error state
        this.registerForm.get('username')?.setErrors({ usernameTaken: true });
      }
    } catch (error: unknown) {
      this.usernameAvailability = 'unknown';
      this.usernameSuggestions = [];
      if (error instanceof HttpErrorResponse) {
        this.snackBar.open(
          `Error checking username: ${error.message}`,
          'Close',
          { duration: 3000 }
        );
      } else {
        this.snackBar.open('Error checking username availability', 'Close', {
          duration: 3000,
        });
      }
    }
  }

  // Error message getters
  getUsernameErrorMessage(): string {
    const control = this.usernameControl;
    if (control?.hasError('required')) {
      return 'Username is required';
    }
    if (control?.hasError('minlength')) {
      return 'Username must be at least 3 characters';
    }
    if (control?.hasError('usernameTaken')) {
      return 'Username already taken. Please choose another.';
    }
    return '';
  }

  getPasswordErrorMessage(): string {
    const control = this.passwordControl;
    if (control?.hasError('required')) {
      return 'Password is required';
    }
    if (control?.hasError('minlength')) {
      return 'Password must be at least 8 characters';
    }
    if (control?.hasError('uppercase')) {
      return 'Password must contain at least one uppercase letter';
    }
    if (control?.hasError('lowercase')) {
      return 'Password must contain at least one lowercase letter';
    }
    if (control?.hasError('number')) {
      return 'Password must contain at least one number';
    }
    if (control?.hasError('special')) {
      return 'Password must contain at least one special character (@$!%*?&)';
    }
    // Don't show server validation errors here - they'll be shown in the dedicated list
    return '';
  }

  getConfirmPasswordErrorMessage(): string {
    const control = this.confirmPasswordControl;
    if (control?.hasError('required')) {
      return 'Please confirm your password';
    }
    if (this.registerForm.hasError('passwordMismatch')) {
      return 'Passwords do not match';
    }
    return '';
  }

  async onRegister(): Promise<void> {
    // Clear any previous server validation errors
    this.serverValidationErrors = {};

    // Mark all fields as touched to trigger validation display
    this.registerForm.markAllAsTouched();

    // Check form validity before proceeding
    if (this.registerForm.invalid) {
      if (this.registerForm.hasError('passwordMismatch')) {
        this.snackBar.open('Passwords do not match', 'Close', {
          duration: 3000,
        });
      }
      return;
    }

    // Set loading state
    this.isRegistering = true;

    try {
      const formValues = this.registerForm.value as {
        username: string;
        password: string;
        confirmPassword: string;
      };

      const registerRequest: UserRegisterDto = {
        username: formValues.username,
        password: formValues.password,
      };

      await firstValueFrom(
        this.userService.userControllerRegister(
          this.xsrfService.getXsrfToken(),
          registerRequest
        )
      );

      // Automatically log in after successful registration
      await this.authService.loadCurrentUser();

      this.snackBar.open('Registration successful!', 'Close', {
        duration: 3000,
      });
      void this.router.navigate(['/']);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) {
        // Handle validation errors from the server
        if (
          error.status === 400 &&
          error.error &&
          typeof error.error === 'object' &&
          'errors' in error.error
        ) {
          const errorObj = error.error as {
            errors?: { [key: string]: string[] };
          };
          if (errorObj.errors) {
            this.handleValidationErrors(errorObj.errors);
          } else {
            this.showGeneralError(error);
          }
        } else {
          this.showGeneralError(error);
        }
      } else {
        this.snackBar.open(
          'An unknown error occurred during registration. Please try again.',
          'Close',
          { duration: 5000 }
        );
      }
    } finally {
      // Always reset loading state when done
      this.isRegistering = false;
    }
  }

  private createPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const password = control.value as string;
      if (!password) {
        return null;
      }

      const errors: ValidationErrors = {};

      if (password.length < 8) {
        errors['minLength'] = true;
      }
      if (!/[A-Z]/.test(password)) {
        errors['uppercase'] = true;
      }
      if (!/[a-z]/.test(password)) {
        errors['lowercase'] = true;
      }
      if (!/\d/.test(password)) {
        errors['number'] = true;
      }
      if (!/[@$!%*?&]/.test(password)) {
        errors['special'] = true;
      }

      return Object.keys(errors).length === 0 ? null : errors;
    };
  }

  private updatePasswordRequirements(password: string): void {
    this.passwordRequirements.minLength.met = password.length >= 8;
    this.passwordRequirements.uppercase.met = /[A-Z]/.test(password);
    this.passwordRequirements.lowercase.met = /[a-z]/.test(password);
    this.passwordRequirements.number.met = /\d/.test(password);
    this.passwordRequirements.special.met = /[@$!%*?&]/.test(password);
  }
  private showGeneralError(error: HttpErrorResponse): void {
    this.snackBar.open(`Registration failed: ${error.message}`, 'Close', {
      duration: 5000,
    });
  }

  // Handle server-side validation errors
  private handleValidationErrors(errors: { [key: string]: string[] }): void {
    this.serverValidationErrors = errors;

    // Apply server errors to form controls
    Object.keys(errors).forEach(field => {
      const control = this.registerForm.get(field);
      if (control) {
        // Set the server-side error on the control
        control.setErrors({ serverValidation: true });
        control.markAsTouched();
      }
    });

    // Show a general error message
    this.snackBar.open('Please fix the validation errors', 'Close', {
      duration: 5000,
    });
  }
}
