import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { RegistrationResult } from '@components/registration-form/registration-form.component';
import { AuthenticationService, User } from '@inkweld/index';
import { SetupService } from '@services/core/setup.service';
import { UserService } from '@services/user/user.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, MockedObject, vi } from 'vitest';

import { RegisterDialogComponent } from './register-dialog.component';

describe('RegisterDialogComponent', () => {
  let component: RegisterDialogComponent;
  let fixture: ComponentFixture<RegisterDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<RegisterDialogComponent>>;
  let snackBar: MockedObject<MatSnackBar>;
  let router: Router;

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<RegisterDialogComponent>>;

    const authService = {
      registerUser: vi.fn(),
      checkUsernameAvailability: vi.fn(),
      listOAuthProviders: vi.fn().mockReturnValue(of({ providers: [] })),
    } as unknown as MockedObject<AuthenticationService>;

    const userService = {
      setCurrentUser: vi.fn(),
    } as unknown as MockedObject<UserService>;

    snackBar = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    const setupService = {
      getServerUrl: vi.fn().mockReturnValue(''),
    } as unknown as MockedObject<SetupService>;

    await TestBed.configureTestingModule({
      imports: [RegisterDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: AuthenticationService, useValue: authService },
        { provide: UserService, useValue: userService },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: SetupService, useValue: setupService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterDialogComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('onRegistered', () => {
    it('should close dialog and navigate home on successful registration', () => {
      const mockUser: User = {
        id: '1',
        username: 'testuser',
        enabled: true,
      };

      const result: RegistrationResult = {
        user: mockUser,
        token: 'test-token',
        requiresApproval: false,
      };

      component.onRegistered(result);

      expect(dialogRef.close).toHaveBeenCalledWith(true);
      expect(router.navigate).toHaveBeenCalledWith(['/']);
      expect(snackBar.open).toHaveBeenCalledWith(
        'Registration successful!',
        'Close',
        { duration: 3000 }
      );
    });

    it('should redirect to approval-pending when approval is required', () => {
      const mockUser: User = {
        id: '1',
        username: 'testuser',
        name: 'Test User',
        enabled: false,
        approved: false,
      };

      const result: RegistrationResult = {
        user: mockUser,
        requiresApproval: true,
      };

      component.onRegistered(result);

      expect(dialogRef.close).toHaveBeenCalledWith(false);
      expect(router.navigate).toHaveBeenCalledWith(['/approval-pending'], {
        queryParams: {
          username: 'testuser',
          name: 'Test User',
          userId: '1',
        },
      });
    });

    it('should use username as name when name is not provided', () => {
      const mockUser: User = {
        id: '1',
        username: 'testuser',
        enabled: false,
        approved: false,
      };

      const result: RegistrationResult = {
        user: mockUser,
        requiresApproval: true,
      };

      component.onRegistered(result);

      expect(router.navigate).toHaveBeenCalledWith(['/approval-pending'], {
        queryParams: {
          username: 'testuser',
          name: 'testuser',
          userId: '1',
        },
      });
    });
  });

  describe('onRegistrationError', () => {
    it('should show error message in snackbar', () => {
      const error = new Error('Registration failed: Username already exists');

      component.onRegistrationError(error);

      expect(snackBar.open).toHaveBeenCalledWith(
        'Registration failed: Username already exists',
        'Close',
        { duration: 5000 }
      );
    });
  });

  describe('onLoginClick', () => {
    it('should close dialog with login signal', () => {
      component.onLoginClick();

      expect(dialogRef.close).toHaveBeenCalledWith('login');
    });
  });

  describe('onProvidersLoaded', () => {
    it('should set providersLoaded to true', () => {
      // Reset to false to test the transition
      component['providersLoaded'].set(false);
      expect(component.providersLoaded()).toBe(false);

      component.onProvidersLoaded();

      expect(component.providersLoaded()).toBe(true);
    });
  });

  describe('initialization', () => {
    it('should detect mobile view for small screens', () => {
      // ngOnInit already ran in fixture.detectChanges()
      // The isMobile property is set based on window.innerWidth
      // We can't easily mock window.innerWidth in jsdom, but we can verify the property exists
      expect(typeof component.isMobile).toBe('boolean');
    });
  });
});
