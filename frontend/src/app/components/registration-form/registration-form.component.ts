import { OverlayModule } from '@angular/cdk/overlay';
import {
  type ConnectedPosition,
  Overlay,
  OverlayPositionBuilder,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { KeyValuePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  type OnDestroy,
  type OnInit,
  Output,
  signal,
  type TemplateRef,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  FormField,
  applyWhen,
  email,
  form,
  minLength,
  required,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AuthenticationService,
  type User,
  type UsernameAvailability,
} from '@inkweld/index';
import { AuthTokenService } from '@services/auth/auth-token.service';
import { SetupService } from '@services/core/setup.service';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';
import { firstValueFrom } from 'rxjs';

/**
 * Result of a successful registration
 */
export interface RegistrationResult {
  user: User;
  token?: string;
  /**
   * Short-lived (15 min) WebAuthn-enrolment-only JWT issued by the backend
   * when `requiresApproval=true` AND password login is disabled. The dialog
   * uses it to attach a passkey to the pending account before parking the
   * user at /approval-pending — without it the brand-new account would have
   * no credential at all and the user would be permanently locked out once
   * the dialog closes. Cannot be used for any other authenticated endpoint.
   */
  enrolmentToken?: string;
  requiresApproval: boolean;
}

interface RegistrationFormValue {
  username: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
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
  imports: [
    FormField,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    KeyValuePipe,
    OverlayModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './registration-form.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './registration-form.component.scss',
})
export class RegistrationFormComponent implements OnInit, OnDestroy {
  private readonly httpClient = inject(HttpClient);
  private readonly authService = inject(AuthenticationService);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly userService = inject(UserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly setupService = inject(SetupService);
  private readonly overlay = inject(Overlay);
  private readonly overlayPositionBuilder = inject(OverlayPositionBuilder);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly systemConfig = inject(SystemConfigService);

  readonly isRequireEmail = this.systemConfig.isRequireEmailEnabled;
  /**
   * Whether classic password login is enabled. When false, the form hides
   * the password fields and submits without a password — the user is then
   * expected to enrol a passkey via the parent's post-registration flow.
   */
  readonly isPasswordLoginEnabled = this.systemConfig.isPasswordLoginEnabled;
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
    password?: string;
  }>();

  @ViewChild('passwordField', { static: false, read: ElementRef })
  passwordField?: ElementRef<HTMLInputElement>;

  @ViewChild('passwordTooltipTemplate', { static: false })
  passwordTooltipTemplate?: TemplateRef<unknown>;

  readonly model = signal<RegistrationFormValue>({
    username: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  /** Set by the async username availability check when the username is taken. */
  private readonly usernameTaken = signal(false);
  /** Set when a server validation error has been applied to a field. */
  private readonly usernameServerInvalid = signal(false);
  private readonly passwordServerInvalid = signal(false);

  readonly form = form(this.model, schemaPath => {
    required(schemaPath.username, { message: 'Username is required' });
    minLength(schemaPath.username, 3, {
      message: 'Username must be at least 3 characters',
    });
    validate(schemaPath.username, () =>
      this.usernameTaken()
        ? {
            kind: 'usernameTaken',
            message: 'Username already taken. Please choose another.',
          }
        : null
    );
    validate(schemaPath.username, () =>
      this.usernameServerInvalid()
        ? { kind: 'serverValidation', message: 'Username already taken' }
        : null
    );
    email(schemaPath.email, { message: 'Please enter a valid email address' });
    required(schemaPath.email, {
      message: 'Email address is required',
      when: () => this.isRequireEmail(),
    });

    // Password validators only apply when password login is enabled.
    // In passwordless mode the fields are hidden and the form must be
    // submittable with empty password values.
    applyWhen(
      schemaPath.password,
      () => this.isPasswordLoginEnabled(),
      passwordPath => {
        required(passwordPath, { message: 'Password is required' });
        validate(passwordPath, () => this.passwordValidatorErrors());
        validate(passwordPath, () =>
          this.passwordServerInvalid()
            ? { kind: 'serverValidation', message: 'Password is too weak' }
            : null
        );
      }
    );

    applyWhen(
      schemaPath.confirmPassword,
      () => this.isPasswordLoginEnabled(),
      confirmPath => {
        required(confirmPath, {
          message: 'Please confirm your password',
        });
        validate(confirmPath, ({ value, valueOf }) => {
          const confirm = value();
          if (!confirm) return null;
          const password = valueOf(schemaPath.password);
          return password && confirm !== password
            ? { kind: 'passwordMismatch', message: 'Passwords do not match' }
            : null;
        });
      }
    );
  });

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
      const password = this.model().password;
      if (password) {
        this.updatePasswordRequirements(password);
      }
    });

    // Emit validity changes whenever form validity or registering state changes
    effect(() => {
      const isValid = this.form().valid();
      this.validityChange.emit(isValid);
    });

    // Reset username availability state when the username changes
    effect(() => {
      this.form.username().value();
      // Only reset to unknown if we are not in the middle of an async check
      this.usernameAvailability = 'unknown';
    });

    // Update password requirements when password changes
    effect(() => {
      const password = this.form.password().value();
      this.updatePasswordRequirements(password);
    });

    // Clear general server errors when user modifies any field
    effect(() => {
      this.model();
      if (this.serverValidationErrors['general']) {
        delete this.serverValidationErrors['general'];
      }
    });
  }

  get usernameControl() {
    return this.form.username;
  }

  get passwordControl() {
    return this.form.password;
  }

  get confirmPasswordControl() {
    return this.form.confirmPassword;
  }

  get emailControl() {
    return this.form.email;
  }

  /** Check if the form is valid */
  get isValid(): boolean {
    return this.form().valid();
  }

  /** Check if form is currently submitting */
  get isSubmitting(): boolean {
    return this.isRegistering();
  }

  ngOnInit(): void {
    // Strip password validators in passwordless mode so the form can submit
    // with empty password fields. Done once in ngOnInit (rather than reactively
    // via effect) because the flag is fixed for the lifetime of the dialog —
    // an admin toggling it mid-registration would just be ignored until the
    // user re-opens the dialog, which is the safer UX (no surprise field
    // appearing/disappearing mid-flow).
    if (!this.isPasswordLoginEnabled()) {
      // Clear password values so any leftover text doesn't submit.
      this.model.update(m => ({ ...m, password: '', confirmPassword: '' }));
    }
  }

  ngOnDestroy(): void {
    this.hidePasswordTooltip();
  }

  isPasswordValid(): boolean {
    return Object.values(this.passwordRequirements).every(
      req => !req.enabled || req.met
    );
  }

  selectSuggestion(suggestion: string): void {
    this.form.username().value.set(suggestion);
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

    const username = this.model().username;

    if (!username || username.length < 3) {
      this.usernameAvailability = 'unknown';
      this.usernameSuggestions = [];
      this.usernameTaken.set(false);
      return;
    }

    try {
      // Use custom server URL if provided, otherwise use current server URL
      const baseUrl = this.serverUrl || this.setupService.getServerUrl() || '';
      if (!baseUrl) {
        // No server URL available, can't check
        this.usernameAvailability = 'unknown';
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
        this.usernameTaken.set(false);
      } else {
        this.usernameAvailability = 'unavailable';
        this.usernameSuggestions = response.suggestions || [];
        // Set error on the form control to trigger Material's error state
        this.usernameTaken.set(true);
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
    const errors = this.form.username().errors();
    const requiredErr = errors.find(e => e.kind === 'required');
    if (requiredErr) {
      return 'Username is required';
    }
    const minLengthErr = errors.find(e => e.kind === 'minLength');
    if (minLengthErr) {
      return 'Username must be at least 3 characters';
    }
    const takenErr = errors.find(e => e.kind === 'usernameTaken');
    if (takenErr) {
      return 'Username already taken. Please choose another.';
    }
    return '';
  }

  getPasswordErrorMessage(): string {
    const errors = this.form.password().errors();
    if (errors.some(e => e.kind === 'required')) {
      return 'Password is required';
    }
    if (errors.some(e => e.kind === 'minLength')) {
      return 'Password must be at least 8 characters';
    }
    if (errors.some(e => e.kind === 'uppercase')) {
      return 'Password must contain at least one uppercase letter';
    }
    if (errors.some(e => e.kind === 'lowercase')) {
      return 'Password must contain at least one lowercase letter';
    }
    if (errors.some(e => e.kind === 'number')) {
      return 'Password must contain at least one number';
    }
    if (errors.some(e => e.kind === 'special')) {
      return 'Password must contain at least one special character (@$!%*?&)';
    }
    return '';
  }

  getConfirmPasswordErrorMessage(): string {
    const errors = this.form.confirmPassword().errors();
    if (errors.some(e => e.kind === 'required')) {
      return 'Please confirm your password';
    }
    if (errors.some(e => e.kind === 'passwordMismatch')) {
      return 'Passwords do not match';
    }
    return '';
  }

  getEmailErrorMessage(): string {
    const errors = this.form.email().errors();
    if (errors.some(e => e.kind === 'required')) {
      return 'Email address is required';
    }
    if (errors.some(e => e.kind === 'email')) {
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
    this.usernameServerInvalid.set(false);
    this.passwordServerInvalid.set(false);

    // Mark all fields as touched to trigger validation display
    this.form().markAsTouched();

    // Check form validity before proceeding
    if (this.form().invalid()) {
      const mismatch = this.form
        .confirmPassword()
        .errors()
        .some(e => e.kind === 'passwordMismatch');
      if (mismatch) {
        this.snackBar.open('Passwords do not match', 'Close', {
          duration: 3000,
        });
      }
      return;
    }

    const formValues = this.model();

    const credentials: {
      username: string;
      password?: string;
      name?: string;
      email?: string;
    } = {
      username: formValues.username,
    };

    // Only attach a password when password login is on AND the user typed
    // something. The backend treats an absent/empty password as "passwordless
    // signup" and stores NULL — see backend/src/services/user.service.ts
    // create() and the gating tests in passwordless-gating.test.ts.
    if (this.isPasswordLoginEnabled() && formValues.password) {
      credentials.password = formValues.password;
    }

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

      // Store authentication token for subsequent requests (using prefixed key).
      // We deliberately skip this when requiresApproval — the user is parked
      // at /approval-pending until an admin approves them. In passwordless
      // mode the backend additionally returns `enrolmentToken`, an
      // enrolment-scoped session that the dialog applies transiently to run
      // a WebAuthn ceremony; we do NOT persist it via authTokenService.
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
        enrolmentToken: response.enrolmentToken,
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
    const values = this.model();
    return {
      username: values.username ?? '',
      password: values.password ?? '',
    };
  }

  /**
   * Reset the form to its initial state
   */
  reset(): void {
    this.model.set({
      username: '',
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
    });
    this.usernameAvailability = 'unknown';
    this.usernameSuggestions = [];
    this.serverValidationErrors = {};
    this.usernameTaken.set(false);
    this.usernameServerInvalid.set(false);
    this.passwordServerInvalid.set(false);
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
          return new Error(message);
        }
      }
      return new Error(`Registration failed: ${error.message}`);
    }
    return new Error(
      'An unknown error occurred during registration. Please try again.'
    );
  }

  private passwordValidatorErrors(): { kind: string; message: string } | null {
    const password = this.model().password;
    if (!password) {
      return null;
    }

    const p = this.policy();

    if (password.length < p.minLength) {
      return { kind: 'minLength', message: 'Password is too short' };
    }
    if (p.requireUppercase && !/[A-Z]/.test(password)) {
      return {
        kind: 'uppercase',
        message: 'Password must contain at least one uppercase letter',
      };
    }
    if (p.requireLowercase && !/[a-z]/.test(password)) {
      return {
        kind: 'lowercase',
        message: 'Password must contain at least one lowercase letter',
      };
    }
    if (p.requireNumber && !/\d/.test(password)) {
      return {
        kind: 'number',
        message: 'Password must contain at least one number',
      };
    }
    if (p.requireSymbol && !/[@$!%*?&]/.test(password)) {
      return {
        kind: 'special',
        message:
          'Password must contain at least one special character (@$!%*?&)',
      };
    }

    return null;
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

  // Handle server-side validation errors
  private handleValidationErrors(errors: { [key: string]: string[] }): void {
    this.serverValidationErrors = errors;

    // Apply server errors to form controls
    if (errors['username']) {
      this.usernameServerInvalid.set(true);
      this.form.username().markAsTouched();
    }
    if (errors['password']) {
      this.passwordServerInvalid.set(true);
      this.form.password().markAsTouched();
    }
  }
}
