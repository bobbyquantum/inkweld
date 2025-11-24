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

import { userServiceMock } from '../../testing/user-api.mock';
import { StorageService } from './storage.service';
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

    it('should use cached user when available', async () => {
      // First load to cache the user
      userServiceMock.getCurrentUser.mockReturnValue(of(TEST_USER));
      await service.loadCurrentUser();

      userServiceMock.getCurrentUser.mockClear();

      expect(userServiceMock.getCurrentUser).not.toHaveBeenCalled();
      // Second load should use cache
      await service.loadCurrentUser();
      expect(userServiceMock.getCurrentUser).not.toHaveBeenCalled();
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

  describe('login', () => {
    it('should login successfully', async () => {
      const username = 'testuser';
      const password = 'password123';

      authServiceMock.login.mockReturnValue(
        of({ user: TEST_USER, token: 'test-token' })
      );

      // Mock setCurrentUser to avoid IndexedDB issues
      const setCurrentUserSpy = vi
        .spyOn(service, 'setCurrentUser')
        .mockResolvedValue();

      await service.login(username, password);

      // Verify the auth service was called
      expect(authServiceMock.login).toHaveBeenCalledWith({
        username,
        password,
      });

      // Verify setCurrentUser was called with the user
      expect(setCurrentUserSpy).toHaveBeenCalledWith(TEST_USER);
      expect(routerMock.navigate).toHaveBeenCalledWith(['/']);
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
  });

  describe('logout', () => {
    it('should logout successfully and clear user', async () => {
      // Use the mocks from beforeEach instead of re-injecting
      authServiceMock.logout.mockReturnValue(
        of(new HttpResponse({ status: 200, body: { message: 'Logged out' } }))
      );
      const clearCurrentUserSpy = vi
        .spyOn(service, 'clearCurrentUser')
        .mockResolvedValue();

      await service.logout();

      expect(authServiceMock.logout).toHaveBeenCalled();
      expect(clearCurrentUserSpy).toHaveBeenCalled();
      expect(routerMock.navigate).toHaveBeenCalledWith(['/welcome']);
    });

    it('should handle logout failure', async () => {
      // Use the mocks from beforeEach instead of re-injecting
      authServiceMock.logout.mockReturnValue(
        throwError(() => new Error('Logout failed'))
      );
      const clearCurrentUserSpy = vi
        .spyOn(service, 'clearCurrentUser')
        .mockResolvedValue();

      await expect(service.logout()).rejects.toThrow(UserServiceError);
      expect(clearCurrentUserSpy).not.toHaveBeenCalled();
    });
  });
});
