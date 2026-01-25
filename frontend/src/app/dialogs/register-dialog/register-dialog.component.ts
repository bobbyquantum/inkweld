import { OverlayModule } from '@angular/cdk/overlay';
import {
  ConnectedPosition,
  Overlay,
  OverlayPositionBuilder,
  OverlayRef,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { KeyValuePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { OAuthProviderListComponent } from '@components/oauth-provider-list/oauth-provider-list.component';
import { AuthenticationService, UsernameAvailability } from '@inkweld/index';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { SetupService } from '@services/core/setup.service';
import { UserService } from '@services/user/user.service';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-register-dialog',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    OAuthProviderListComponent,
    KeyValuePipe,
    OverlayModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './register-dialog.component.html',
  styleUrl: './register-dialog.component.scss',
})
export class RegisterDialogComponent implements OnInit, OnDestroy {
  private dialogRef = inject(MatDialogRef<RegisterDialogComponent>);
  private httpClient = inject(HttpClient);
  private authService = inject(AuthenticationService);
  private authTokenService = inject(AuthTokenService);
  private userService = inject(UserService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private fb = inject(FormBuilder).nonNullable;
  private setupService = inject(SetupService);
  private overlay = inject(Overlay);
  private overlayPositionBuilder = inject(OverlayPositionBuilder);
  private viewContainerRef = inject(ViewContainerRef);
  private changeDetectorRef = inject(ChangeDetectorRef);

  @ViewChild('passwordField', { static: false, read: ElementRef })
  passwordField?: ElementRef<HTMLInputElement>;

  @ViewChild('passwordTooltipTemplate', { static: false })
  passwordTooltipTemplate?: TemplateRef<unknown>;

  // Form interface
  readonly registerForm = this.fb.group(
    {
      username: this.fb.control('', {
        validators: [Validators.required, Validators.minLength(3)],
      }),
      password: this.fb.control('', {
        validators: [
          Validators.required,
          Validators.minLength(8),
          this.createPasswordValidator(),
        ],
      }),
      confirmPassword: this.fb.control('', {
        validators: [
          Validators.required,
          this.createConfirmPasswordValidator(),
        ],
      }),
    },
    {
      validators: [this.passwordMatchValidator],
    }
  );

  isMobile = false;
  readonly isRegistering = signal(false);
  usernameSuggestions: string[] | undefined = [];
  usernameAvailability: 'available' | 'unavailable' | 'unknown' = 'unknown';
  serverValidationErrors: { [key: string]: string[] } = {};
  readonly providersLoaded = signal(false);

  // Password focus state for showing requirements callout
  isPasswordFocused = false;
  private overlayRef?: OverlayRef;

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

  private destroy$ = new Subject<void>();

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

    // Listen for value changes to reset validation states
    this.registerForm
      .get('username')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.usernameAvailability = 'unknown';
      });

    // Listen for password changes to update requirements status
    // and re-validate confirmPassword for match checking
    this.registerForm
      .get('password')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((password: string) => {
        this.updatePasswordRequirements(password);
        // Trigger confirmPassword validation when password changes
        this.registerForm.get('confirmPassword')?.updateValueAndValidity();
      });
  }

  ngOnDestroy(): void {
    this.hidePasswordTooltip();
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

  onPasswordFocus(): void {
    this.isPasswordFocused = true;
    this.showPasswordTooltip();
  }

  onPasswordBlur(): void {
    this.isPasswordFocused = false;
    this.hidePasswordTooltip();
  }

  onPasswordInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const password = input.value;
    this.updatePasswordRequirements(password);
  }

  private showPasswordTooltip(): void {
    if (
      this.overlayRef ||
      !this.passwordField ||
      !this.passwordTooltipTemplate
    ) {
      return;
    }

    // Define position strategies: prefer right, then left, then top
    const positions: ConnectedPosition[] = [
      {
        originX: 'end',
        originY: 'center',
        overlayX: 'start',
        overlayY: 'center',
        offsetX: 8,
      },
      {
        originX: 'start',
        originY: 'center',
        overlayX: 'end',
        overlayY: 'center',
        offsetX: -8,
      },
      {
        originX: 'center',
        originY: 'top',
        overlayX: 'center',
        overlayY: 'bottom',
        offsetY: -8,
      },
    ];

    const positionStrategy = this.overlayPositionBuilder
      .flexibleConnectedTo(this.passwordField)
      .withPositions(positions)
      .withViewportMargin(16)
      .withPush(false);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: false,
    });

    this.overlayRef.attach(
      new TemplatePortal(this.passwordTooltipTemplate, this.viewContainerRef)
    );
  }

  private hidePasswordTooltip(): void {
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = undefined;
    }
  }

  // Handle providers loaded event
  onProvidersLoaded(): void {
    // Signal handles change detection properly, no setTimeout needed
    this.providersLoaded.set(true);
    this.changeDetectorRef.detectChanges();
  }

  // Check if username is available
  async checkUsernameAvailability(): Promise<void> {
    const username = this.registerForm.get('username')?.value as string;

    if (!username || username.length < 3) {
      this.usernameAvailability = 'unknown';
      this.usernameSuggestions = [];
      this.changeDetectorRef.detectChanges();
      return;
    }

    try {
      // Build the URL based on server mode configuration
      const serverUrl = this.setupService.getServerUrl() || '';
      const checkUrl = `${serverUrl}/api/v1/users/check-username?username=${encodeURIComponent(
        username
      )}`;

      const response = await firstValueFrom(
        this.httpClient.get<UsernameAvailability>(checkUrl)
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
      this.changeDetectorRef.detectChanges();
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
      this.changeDetectorRef.detectChanges();
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
    return '';
  }

  getConfirmPasswordErrorMessage(): string {
    const control = this.confirmPasswordControl;
    if (control?.hasError('required')) {
      return 'Please confirm your password';
    }
    // Check control-level error first, then form-level for backwards compatibility
    if (
      control?.hasError('passwordMismatch') ||
      this.registerForm.hasError('passwordMismatch')
    ) {
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

    // Ensure providers are loaded before allowing registration
    if (!this.providersLoaded()) {
      return;
    }

    // Set loading state
    this.isRegistering.set(true);

    try {
      const formValues = this.registerForm.value as {
        username: string;
        password: string;
        confirmPassword: string;
      };

      const registerRequest = {
        username: formValues.username,
        password: formValues.password,
      };

      const response = await firstValueFrom(
        this.authService.registerUser(registerRequest)
      );

      // Check if approval is required
      if (response.requiresApproval) {
        // Close dialog and redirect to dedicated pending approval page
        this.dialogRef.close(false);
        void this.router.navigate(['/approval-pending'], {
          queryParams: {
            username: response.user.username,
            name: response.user.name || response.user.username,
            userId: response.user.id,
          },
        });
      } else {
        // Store authentication token for subsequent requests (using prefixed key)
        if (response.token) {
          this.authTokenService.setToken(response.token);
        }

        // Set the user in the user service so isAuthenticated() returns true
        if (response.user) {
          await this.userService.setCurrentUser(response.user);
        }

        this.snackBar.open('Registration successful!', 'Close', {
          duration: 3000,
        });
        this.dialogRef.close(true); // Close with success result
        void this.router.navigate(['/']);
      }
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
      this.isRegistering.set(false);
    }
  }

  onLoginClick(): void {
    this.dialogRef.close('login'); // Signal to open login dialog
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

  private createConfirmPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const confirmPassword = control.value as string;
      if (!confirmPassword) {
        return null; // Required validator handles empty case
      }

      // Get the password value from the parent group
      const password = control.parent?.get('password')?.value as
        | string
        | undefined;

      if (password && confirmPassword !== password) {
        return { passwordMismatch: true };
      }

      return null;
    };
  }

  private updatePasswordRequirements(password: string): void {
    const oldState = Object.fromEntries(
      Object.entries(this.passwordRequirements).map(([key, req]) => [
        key,
        req.met,
      ])
    );

    this.passwordRequirements.minLength.met = password.length >= 8;
    this.passwordRequirements.uppercase.met = /[A-Z]/.test(password);
    this.passwordRequirements.lowercase.met = /[a-z]/.test(password);
    this.passwordRequirements.number.met = /\d/.test(password);
    this.passwordRequirements.special.met = /[@$!%*?&]/.test(password);

    const newState = Object.fromEntries(
      Object.entries(this.passwordRequirements).map(([key, req]) => [
        key,
        req.met,
      ])
    );

    const hasChanged = JSON.stringify(oldState) !== JSON.stringify(newState);
    if (hasChanged) {
      // Trigger change detection for the overlay
      this.changeDetectorRef.detectChanges();
    }
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
