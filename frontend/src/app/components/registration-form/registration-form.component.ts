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
  effect,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnDestroy,
  OnInit,
  Output,
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AuthenticationService,
  User,
  UsernameAvailability,
} from '@inkweld/index';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';

/**
 * Result of a successful registration
 */
export interface RegistrationResult {
  user: User;
  token?: string;
  requiresApproval: boolean;
}

/**
 * Shared registration form component.
 *
 * This component provides a reusable registration form with:
 * - Username field with availability checking
 * - Password field with complexity requirements
 * - Confirm password field with match validation
 * - Server validation error handling
 *
 * It can be used in dialogs or embedded in other components.
 *
 * @example
 * ```html
 * <app-registration-form
 *   [showSubmitButton]="true"
 *   submitButtonText="Create Account"
 *   (registered)="onRegistered($event)"
 *   (registrationError)="onError($event)">
 * </app-registration-form>
 * ```
 */
@Component({
  selector: 'app-registration-form',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    KeyValuePipe,
    OverlayModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './registration-form.component.html',
  styleUrl: './registration-form.component.scss',
})
export class RegistrationFormComponent implements OnInit, OnDestroy {
  private httpClient = inject(HttpClient);
  private authService = inject(AuthenticationService);
  private authTokenService = inject(AuthTokenService);
  private userService = inject(UserService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder).nonNullable;
  private setupService = inject(SetupService);
  private overlay = inject(Overlay);
  private overlayPositionBuilder = inject(OverlayPositionBuilder);
  private viewContainerRef = inject(ViewContainerRef);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private systemConfig = inject(SystemConfigService);

  readonly isRequireEmail = this.systemConfig.isRequireEmailEnabled;
  private readonly policy = this.systemConfig.passwordPolicy;

  /** Whether to show the submit button (can be hidden if parent handles submission) */
  @Input() showSubmitButton = true;

  /** Text for the submit button */
  @Input() submitButtonText = 'Register';

  /** Text shown while registering */
  @Input() registeringText = 'Creating account...';

  /** Whether the form should be compact (less spacing) */
  @Input() compact = false;

  /**
   * When true, the component doesn't perform registration API calls.
   * Instead, it emits the form values via `submitRequest` output for the parent to handle.
   * This is useful when registration is part of a larger flow (e.g., migration).
   */
  @Input() externalSubmit = false;

  /**
   * When true, disables the username availability check.
   * Useful when using externalSubmit and the parent handles validation.
   */
  @Input() skipUsernameCheck = false;

  /**
   * Optional server URL to use for username availability check.
   * If not provided, uses the current server URL from setupService.
   * This is useful when checking against a server that isn't yet configured (e.g., during migration).
   */
  @Input() serverUrl?: string;

  /**
   * Optional prefix for test IDs (e.g., 'migration-' -> 'migration-username-input').
   * When empty, test IDs use default names (e.g., 'username-input').
   */
  @Input() testIdPrefix = '';

  /** Emitted when registration is successful */
  @Output() registered = new EventEmitter<RegistrationResult>();

  /** Emitted when registration fails */
  @Output() registrationError = new EventEmitter<Error>();

  /** Emitted when form validity changes */
  @Output() validityChange = new EventEmitter<boolean>();

  /**
   * Emitted when user submits the form in externalSubmit mode.
   * Contains the form values for the parent to handle registration.
   */
  @Output() submitRequest = new EventEmitter<{
    username: string;
    password: string;
  }>();

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
      displayName: this.fb.control(''),
      email: this.fb.control('', {
        validators: [Validators.email],
      }),
      password: this.fb.control('', {
        validators: [Validators.required, this.createPasswordValidator()],
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

  readonly isRegistering = signal(false);
  usernameSuggestions: string[] | undefined = [];
  usernameAvailability: 'available' | 'unavailable' | 'unknown' = 'unknown';
  serverValidationErrors: { [key: string]: string[] } = {};

  // Password focus state for showing requirements callout
  isPasswordFocused = false;
  private overlayRef?: OverlayRef;

  passwordRequirements: Record<
    string,
    { met: boolean; message: string; enabled: boolean }
  > = {
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

  private destroy$ = new Subject<void>();

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
      // Re-validate if password has a value
      const password = this.registerForm.get('password')?.value;
      if (password) {
        this.updatePasswordRequirements(password);
        this.registerForm.get('password')?.updateValueAndValidity();
      }
    });
  }

  get usernameControl() {
    return this.registerForm.get('username');
  }

  get passwordControl() {
    return this.registerForm.get('password');
  }

  get confirmPasswordControl() {
    return this.registerForm.get('confirmPassword');
  }

  get emailControl() {
    return this.registerForm.get('email');
  }

  /** Check if the form is valid */
  get isValid(): boolean {
    return this.registerForm.valid;
  }

  /** Check if form is currently submitting */
  get isSubmitting(): boolean {
    return this.isRegistering();
  }

  ngOnInit(): void {
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

    // Emit validity changes
    this.registerForm.statusChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.validityChange.emit(this.registerForm.valid);
      });

    // Clear general server errors when user modifies any field
    this.registerForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.serverValidationErrors['general']) {
          delete this.serverValidationErrors['general'];
        }
      });

    // Set email as required if REQUIRE_EMAIL is enabled
    this.updateEmailRequiredValidator();
  }

  /**
   * Update the email field's required validator based on the REQUIRE_EMAIL config.
   */
  private updateEmailRequiredValidator(): void {
    const emailControl = this.emailControl;
    if (!emailControl) return;

    if (this.isRequireEmail()) {
      emailControl.setValidators([Validators.required, Validators.email]);
    } else {
      emailControl.setValidators([Validators.email]);
    }
    emailControl.updateValueAndValidity();
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
    return Object.values(this.passwordRequirements).every(
      req => !req.enabled || req.met
    );
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

  // Check if username is available
  async checkUsernameAvailability(): Promise<void> {
    // Skip if external submit mode with username check disabled
    if (this.skipUsernameCheck) {
      return;
    }

    const username = this.registerForm.get('username')?.value as string;

    if (!username || username.length < 3) {
      this.usernameAvailability = 'unknown';
      this.usernameSuggestions = [];
      this.changeDetectorRef.detectChanges();
      return;
    }

    try {
      // Use custom server URL if provided, otherwise use current server URL
      const baseUrl = this.serverUrl || this.setupService.getServerUrl() || '';
      if (!baseUrl) {
        // No server URL available, can't check
        this.usernameAvailability = 'unknown';
        this.changeDetectorRef.detectChanges();
        return;
      }
      const checkUrl = `${baseUrl}/api/v1/users/check-username?username=${encodeURIComponent(
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

  getEmailErrorMessage(): string {
    const control = this.emailControl;
    if (control?.hasError('required')) {
      return 'Email address is required';
    }
    if (control?.hasError('email')) {
      return 'Please enter a valid email address';
    }
    return '';
  }

  /**
   * Submit the registration form.
   * Can be called externally by parent components.
   *
   * If `externalSubmit` is true, emits `submitRequest` with form values
   * instead of performing the registration API call.
   */
  async submit(): Promise<void> {
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

    const formValues = this.registerForm.value as {
      username: string;
      password: string;
      confirmPassword: string;
      displayName: string;
      email: string;
    };

    const credentials: {
      username: string;
      password: string;
      name?: string;
      email?: string;
    } = {
      username: formValues.username,
      password: formValues.password,
    };

    if (formValues.displayName?.trim()) {
      credentials.name = formValues.displayName.trim();
    }
    if (formValues.email?.trim()) {
      credentials.email = formValues.email.trim();
    }

    // If external submit mode, just emit the values and let parent handle it
    if (this.externalSubmit) {
      this.submitRequest.emit(credentials);
      return;
    }

    // Set loading state
    this.isRegistering.set(true);

    try {
      const response = await firstValueFrom(
        this.authService.registerUser(credentials)
      );

      // Store authentication token for subsequent requests (using prefixed key)
      if (response.token && !response.requiresApproval) {
        this.authTokenService.setToken(response.token);
      }

      // Set the user in the user service so isAuthenticated() returns true
      if (response.user && !response.requiresApproval) {
        await this.userService.setCurrentUser(response.user);
      }

      // Emit success
      this.registered.emit({
        user: response.user,
        token: response.token,
        requiresApproval: response.requiresApproval ?? false,
      });
    } catch (error: unknown) {
      const wrappedError = this.handleRegistrationError(error);
      this.registrationError.emit(wrappedError);
    } finally {
      // Always reset loading state when done
      this.isRegistering.set(false);
    }
  }

  /**
   * Get the current form values
   */
  getFormValues(): { username: string; password: string } {
    const values = this.registerForm.value;
    return {
      username: values.username ?? '',
      password: values.password ?? '',
    };
  }

  /**
   * Reset the form to its initial state
   */
  reset(): void {
    this.registerForm.reset();
    this.usernameAvailability = 'unknown';
    this.usernameSuggestions = [];
    this.serverValidationErrors = {};
  }

  /**
   * Set the loading/registering state.
   * Useful when parent handles registration in externalSubmit mode.
   */
  setLoading(loading: boolean): void {
    this.isRegistering.set(loading);
  }

  /**
   * Set an error message to display.
   * Useful when parent handles registration in externalSubmit mode.
   */
  setError(error: string): void {
    this.serverValidationErrors = { general: [error] };
    this.changeDetectorRef.detectChanges();
  }

  private handleRegistrationError(error: unknown): Error {
    if (error instanceof HttpErrorResponse) {
      // Handle validation errors from the server
      if (
        error.status === 400 &&
        error.error &&
        typeof error.error === 'object'
      ) {
        // Structured field-level errors: { errors: { field: string[] } }
        if ('errors' in error.error) {
          const errorObj = error.error as {
            errors?: { [key: string]: string[] };
          };
          if (errorObj.errors) {
            this.handleValidationErrors(errorObj.errors);
            return new Error('Please fix the validation errors');
          }
        }
        // Simple error message: { error: string }
        const errorBody = error.error as Record<string, unknown>;
        if ('error' in errorBody && typeof errorBody['error'] === 'string') {
          const message = errorBody['error'];
          this.serverValidationErrors = { general: [message] };
          this.changeDetectorRef.detectChanges();
          return new Error(message);
        }
      }
      return new Error(`Registration failed: ${error.message}`);
    }
    return new Error(
      'An unknown error occurred during registration. Please try again.'
    );
  }

  private createPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const password = control.value as string;
      if (!password) {
        return null;
      }

      const p = this.policy();
      const errors: ValidationErrors = {};

      if (password.length < p.minLength) {
        errors['minLength'] = true;
      }
      if (p.requireUppercase && !/[A-Z]/.test(password)) {
        errors['uppercase'] = true;
      }
      if (p.requireLowercase && !/[a-z]/.test(password)) {
        errors['lowercase'] = true;
      }
      if (p.requireNumber && !/\d/.test(password)) {
        errors['number'] = true;
      }
      if (p.requireSymbol && !/[@$!%*?&]/.test(password)) {
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
  }
}
