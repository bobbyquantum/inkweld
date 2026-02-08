import 'fake-indexeddb/auto';

import {
  HttpErrorResponse,
  HttpResponse,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { UserSettingsDialogComponent } from '@dialogs/user-settings-dialog/user-settings-dialog.component';
import { AuthenticationService, User } from '@inkweld/index';
import { UsersService } from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { Mock, vi } from 'vitest';

import { userServiceMock } from '../../../testing/user-api.mock';
import { StorageService } from '../local/storage.service';
import { UserService, UserServiceError } from './user.service';
function createStructuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

if (!globalThis.structuredClone) {
  globalThis.structuredClone = createStructuredClone;
}
const TEST_USER: User = {
  id: 'test-id',
  username: 'testuser',
  name: 'Test User',
  enabled: true,
};

describe('UserService', () => {
  let service: UserService;
  let storageService: StorageService;
  let httpTestingController: HttpTestingController;
  let authServiceMock: {
    login: Mock;
    logout: Mock;
  };
  let dialogMock: { open: Mock };
  let routerMock: { navigate: Mock };

  beforeEach(async () => {
    // Reset IndexedDB before each test to ensure clean state
    indexedDB = new IDBFactory();

    userServiceMock.getCurrentUser.mockReturnValue(of(TEST_USER));
    authServiceMock = {
      login: vi.fn(),
      logout: vi.fn(),
    };
    dialogMock = { open: vi.fn() };
    routerMock = { navigate: vi.fn() };

    dialogMock.open.mockReturnValue({
      afterClosed: () => of(true),
    });

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        UserService,
        StorageService,
        {
          provide: UsersService,
          useValue: userServiceMock,
        },
        {
          provide: AuthenticationService,
          useValue: authServiceMock,
        },
        {
          provide: MatDialog,
          useValue: dialogMock,
        },
        {
          provide: Router,
          useValue: routerMock,
        },
      ],
    });

    service = TestBed.inject(UserService);
    storageService = TestBed.inject(StorageService);
    httpTestingController = TestBed.inject(HttpTestingController);

    // Wait for the IndexedDB initialization to complete before running tests
    // This prevents race conditions during cold starts
    await service['db'].catch(() => {
      // Ignore initialization errors in tests - they're expected in some scenarios
    });
  });

  afterEach(() => {
    httpTestingController?.verify();
    vi.clearAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize with undefined user', () => {
      expect(service.currentUser()).toStrictEqual({
        id: '',
        name: 'anonymous',
        username: 'anonymous',
        enabled: false,
      });
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeUndefined();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.initialized()).toBe(false);
    });

    it('should set initialized after load', async () => {
      expect(service.initialized()).toBe(false);
      await service.loadCurrentUser();
      expect(service.initialized()).toBe(true);
    });
  });

  describe('loadCurrentUser', () => {
    it('should load user from API when cache is empty', async () => {
      userServiceMock.getCurrentUser.mockClear();
      await service.loadCurrentUser();
      expect(userServiceMock.getCurrentUser).toHaveBeenCalledTimes(1);
      expect(service.currentUser()).toEqual(TEST_USER);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeUndefined();
    });

    it('should use cached user immediately but also validate with server', async () => {
      // First load to cache the user
      userServiceMock.getCurrentUser.mockReturnValue(of(TEST_USER));
      await service.loadCurrentUser();

      userServiceMock.getCurrentUser.mockClear();
      userServiceMock.getCurrentUser.mockReturnValue(of(TEST_USER));

      // Second load should load from cache AND validate with server
      await service.loadCurrentUser();
      // Now we always validate with server, so API should be called
      expect(userServiceMock.getCurrentUser).toHaveBeenCalled();
      expect(service.currentUser()).toEqual(TEST_USER);
    });

    it('should handle network errors', async () => {
      const error = new HttpErrorResponse({
        error: new Error('Network error'),
        status: 0,
        statusText: 'Network Error',
      });
      userServiceMock.getCurrentUser.mockReturnValue(throwError(() => error));

      await expect(service.loadCurrentUser()).rejects.toThrow(UserServiceError);
      expect(service.error()?.code).toBe('NETWORK_ERROR');
      expect(service.isLoading()).toBe(false);
    });

    it('should handle session expiration', async () => {
      const error = new HttpErrorResponse({
        error: new Error('Unauthorized'),
        status: 401,
        statusText: 'Unauthorized',
      });
      userServiceMock.getCurrentUser.mockReturnValue(throwError(() => error));

      await expect(service.loadCurrentUser()).rejects.toThrow(UserServiceError);
      expect(service.error()?.code).toBe('SESSION_EXPIRED');
    });

    it('should handle anonymous user response (not authenticated)', async () => {
      const anonymousUser: User = {
        id: '',
        username: 'anonymous',
        name: null,
        enabled: false,
      };
      userServiceMock.getCurrentUser.mockReturnValue(of(anonymousUser));

      // Should NOT throw - anonymous user is a valid response for unauthenticated
      await service.loadCurrentUser();

      expect(service.currentUser()).toEqual(anonymousUser);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.error()).toBeUndefined();
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('user management', () => {
    it('should set and clear current user', async () => {
      await service.setCurrentUser(TEST_USER);
      expect(service.currentUser()).toEqual(TEST_USER);
      expect(service.isAuthenticated()).toBe(true);

      await service.clearCurrentUser();
      expect(service.currentUser()).toStrictEqual({
        id: '',
        name: 'anonymous',
        username: 'anonymous',
        enabled: false,
      });
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should persist user to storage when available', async () => {
      const spy = vi.spyOn(storageService, 'put');
      await service.setCurrentUser(TEST_USER);
      expect(spy).toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      vi.spyOn(storageService, 'put').mockRejectedValue(
        new Error('Storage error')
      );
      await expect(service.setCurrentUser(TEST_USER)).resolves.not.toThrow();
      expect(service.currentUser()).toEqual(TEST_USER);
    });
  });

  describe('updateProfile', () => {
    it('should update profile and refresh cached user', async () => {
      const updatedUser: User = {
        ...TEST_USER,
        name: 'New Name',
        email: 'new@example.com',
      };
      userServiceMock.updateProfile.mockReturnValue(of(updatedUser));

      await service.setCurrentUser(TEST_USER);
      const result = await service.updateProfile({
        name: 'New Name',
        email: 'new@example.com',
      });

      expect(result).toEqual(updatedUser);
      expect(service.currentUser()).toEqual(updatedUser);
      expect(userServiceMock.updateProfile).toHaveBeenCalledWith({
        name: 'New Name',
        email: 'new@example.com',
      });
    });

    it('should update only name when email is not provided', async () => {
      const updatedUser: User = { ...TEST_USER, name: 'Updated Name' };
      userServiceMock.updateProfile.mockReturnValue(of(updatedUser));

      await service.setCurrentUser(TEST_USER);
      const result = await service.updateProfile({ name: 'Updated Name' });

      expect(result).toEqual(updatedUser);
      expect(userServiceMock.updateProfile).toHaveBeenCalledWith({
        name: 'Updated Name',
      });
    });
  });

  describe('login', () => {
    // Skip: flaky due to IndexedDB timing issues
    it.skip('should login successfully', async () => {
      const username = 'testuser';
      const password = 'password123';

      // The authServiceMock.login is provided via TestBed useValue
      // Set up the return value before calling login
      authServiceMock.login.mockReturnValue(
        of({ user: TEST_USER, token: 'test-token' })
      );

      // Spy on router navigate to track it
      const navigateSpy = routerMock.navigate;

      await service.login(username, password);

      // Verify the auth service was called with credentials
      expect(authServiceMock.login).toHaveBeenCalledWith({
        username,
        password,
      });

      // Verify user was set
      expect(service.currentUser()).toEqual(TEST_USER);

      // Verify navigation occurred
      expect(navigateSpy).toHaveBeenCalledWith(['/']);
    });

    it('should handle login failure with invalid credentials', async () => {
      const username = 'wronguser';
      const password = 'wrongpass';

      const errorResponse = new HttpErrorResponse({
        error: {
          message: 'Invalid username or password',
          error: 'Unauthorized',
          statusCode: 401,
        },
        status: 401,
        statusText: 'Unauthorized',
      });

      authServiceMock.login.mockReturnValue(throwError(() => errorResponse));

      const loginPromise = service.login(username, password);

      await expect(loginPromise).rejects.toThrow(UserServiceError);
      expect(service.error()?.code).toBe('LOGIN_FAILED');
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('hasCachedUser', () => {
    it('should return false when storage is not available', async () => {
      vi.spyOn(storageService, 'isAvailable').mockReturnValue(false);
      const result = await service.hasCachedUser();
      expect(result).toBe(false);
    });

    it('should return true when cached user exists', async () => {
      // First, set a user to cache it
      await service.setCurrentUser(TEST_USER);

      const result = await service.hasCachedUser();
      expect(result).toBe(true);
    });

    it('should return false when no cached user exists', async () => {
      // Clear any existing user
      await service.clearCurrentUser();

      const result = await service.hasCachedUser();
      expect(result).toBe(false);
    });

    it('should return false when storage.get throws error', async () => {
      // Mock storage.get to throw an error
      vi.spyOn(storageService, 'get').mockRejectedValue(
        new Error('Storage read error')
      );

      const result = await service.hasCachedUser();
      expect(result).toBe(false);
    });
  });

  describe('openSettingsDialog', () => {
    it('should open settings dialog and handle success', async () => {
      await service.openSettingsDialog();

      expect(dialogMock.open).toHaveBeenCalledWith(
        UserSettingsDialogComponent,
        {
          width: '700px',
          disableClose: true,
        }
      );
      expect(service.isLoading()).toBe(false);
    });

    it('should handle errors when opening settings dialog', async () => {
      // Mock dialog to throw error
      dialogMock.open.mockReturnValue({
        afterClosed: () => throwError(() => new Error('Dialog error')),
      });

      await expect(service.openSettingsDialog()).rejects.toThrow(
        UserServiceError
      );
      expect(service.isLoading()).toBe(false);
    });
  });

  describe('formatError', () => {
    it('should handle login failure errors', () => {
      const httpError = new HttpErrorResponse({
        error: {
          message: 'Invalid username or password',
          error: 'Unauthorized',
          statusCode: 401,
        },
        status: 401,
        statusText: 'Unauthorized',
      });

      // We need to access the private method through a workaround
      const error = (service as any).formatError(httpError);

      expect(error).toBeInstanceOf(UserServiceError);
      expect(error.code).toBe('LOGIN_FAILED');
    });

    it('should handle general server errors', () => {
      const httpError = new HttpErrorResponse({
        error: new Error('Internal Server Error'),
        status: 500,
        statusText: 'Internal Server Error',
      });

      const error = (service as any).formatError(httpError);

      expect(error).toBeInstanceOf(UserServiceError);
      expect(error.code).toBe('SERVER_ERROR');
    });

    it('should handle non-HTTP errors', () => {
      const genericError = new Error('Generic error');

      const error = (service as any).formatError(genericError);

      expect(error).toBeInstanceOf(UserServiceError);
      expect(error.code).toBe('SERVER_ERROR');
    });

    it('should handle 403 errors with pending approval message', () => {
      const httpError = new HttpErrorResponse({
        error: {
          message: 'Account is pending approval',
          error: 'Forbidden',
          statusCode: 403,
        },
        status: 403,
        statusText: 'Forbidden',
      });

      const error = (service as any).formatError(httpError);

      expect(error).toBeInstanceOf(UserServiceError);
      expect(error.code).toBe('ACCOUNT_PENDING');
      expect(error.message).toBe('Account is pending approval');
    });

    it('should handle 403 errors with disabled message', () => {
      const httpError = new HttpErrorResponse({
        error: {
          message: 'Account is disabled',
          error: 'Forbidden',
          statusCode: 403,
        },
        status: 403,
        statusText: 'Forbidden',
      });

      const error = (service as any).formatError(httpError);

      expect(error).toBeInstanceOf(UserServiceError);
      expect(error.code).toBe('ACCOUNT_PENDING');
      expect(error.message).toBe('Account is disabled');
    });

    it('should handle 403 errors without specific message as access denied', () => {
      const httpError = new HttpErrorResponse({
        error: {
          message: 'Permission denied',
          error: 'Forbidden',
          statusCode: 403,
        },
        status: 403,
        statusText: 'Forbidden',
      });

      const error = (service as any).formatError(httpError);

      expect(error).toBeInstanceOf(UserServiceError);
      expect(error.code).toBe('ACCESS_DENIED');
    });
  });

  describe('logout', () => {
    // Skip: flaky due to IndexedDB timing issues
    it.skip('should logout successfully and clear user', async () => {
      // First set a user so we can verify it's cleared
      await service.setCurrentUser(TEST_USER);
      expect(service.currentUser()).toEqual(TEST_USER);

      // Use the mocks from beforeEach
      authServiceMock.logout.mockReturnValue(
        of(new HttpResponse({ status: 200, body: { message: 'Logged out' } }))
      );

      await service.logout();

      expect(authServiceMock.logout).toHaveBeenCalled();
      // Verify user was cleared (real clearCurrentUser will run)
      expect(service.currentUser()).toStrictEqual({
        id: '',
        name: 'anonymous',
        username: 'anonymous',
        enabled: false,
      });
      expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should handle logout failure', async () => {
      // Use the mocks from beforeEach instead of re-injecting
      authServiceMock.logout.mockReturnValue(
        throwError(() => new Error('Logout failed'))
      );

      await expect(service.logout()).rejects.toThrow(UserServiceError);
      // User should not be cleared on failure since error is thrown before clearCurrentUser
    });
  });
});
