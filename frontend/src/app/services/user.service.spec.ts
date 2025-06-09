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
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { UserSettingsDialogComponent } from '@dialogs/user-settings-dialog/user-settings-dialog.component';
import { AuthService, UserDto } from '@inkweld/index';
import { UserAPIService } from '@inkweld/index';
import { of, throwError } from 'rxjs';

import { userServiceMock } from '../../testing/user-api.mock';
import { StorageService } from './storage.service';
import { UserService, UserServiceError } from './user.service';
function createStructuredClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

if (!globalThis.structuredClone) {
  globalThis.structuredClone = createStructuredClone;
}
const TEST_USER: UserDto = {
  username: 'testuser',
  name: 'Test User',
};

describe('UserService', () => {
  let service: UserService;
  let storageService: StorageService;
  let httpTestingController: HttpTestingController;
  let authServiceMock: {
    authControllerLogin: vi.Mock;
    authControllerLogout: vi.Mock;
  };
  let dialogMock: { open: vi.Mock };
  let routerMock: { navigate: vi.Mock };

  beforeEach(() => {
    userServiceMock.userControllerGetMe.mockReturnValue(of(TEST_USER));
    authServiceMock = {
      authControllerLogin: vi.fn(),
      authControllerLogout: vi.fn(),
    };
    dialogMock = { open: vi.fn() };
    routerMock = { navigate: vi.fn() };

    dialogMock.open.mockReturnValue({
      afterClosed: () => of(true),
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        UserService,
        StorageService,
        {
          provide: UserAPIService,
          useValue: userServiceMock,
        },
        {
          provide: AuthService,
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
  });

  afterEach(() => {
    indexedDB = new IDBFactory();
    httpTestingController.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize with undefined user', () => {
      expect(service.currentUser()).toStrictEqual({
        name: 'anonymous',
        username: 'anonymous',
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
      userServiceMock.userControllerGetMe.mockClear();
      await service.loadCurrentUser();
      expect(userServiceMock.userControllerGetMe).toHaveBeenCalledTimes(1);
      expect(service.currentUser()).toEqual(TEST_USER);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeUndefined();
    });

    it('should use cached user when available', async () => {
      // First load to cache the user
      userServiceMock.userControllerGetMe.mockReturnValue(of(TEST_USER));
      await service.loadCurrentUser();

      userServiceMock.userControllerGetMe.mockClear();

      expect(userServiceMock.userControllerGetMe).not.toHaveBeenCalled();
      // Second load should use cache
      await service.loadCurrentUser();
      expect(userServiceMock.userControllerGetMe).not.toHaveBeenCalled();
      expect(service.currentUser()).toEqual(TEST_USER);
    });

    it('should handle network errors', async () => {
      const error = new HttpErrorResponse({
        error: new Error('Network error'),
        status: 0,
        statusText: 'Network Error',
      });
      userServiceMock.userControllerGetMe.mockReturnValue(
        throwError(() => error)
      );

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
      userServiceMock.userControllerGetMe.mockReturnValue(
        throwError(() => error)
      );

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
        name: 'anonymous',
        username: 'anonymous',
      });
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should persist user to storage when available', async () => {
      const spy = vi.spyOn(storageService, 'put');
      await service.setCurrentUser(TEST_USER);
      expect(spy).toHaveBeenCalled();
    });

      it('should handle storage errors gracefully', async () => {
      vi
        .spyOn(storageService, 'put')
        .mockRejectedValue(new Error('Storage error'));
      await expect(service.setCurrentUser(TEST_USER)).resolves.not.toThrow();
      expect(service.currentUser()).toEqual(TEST_USER);
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const username = 'testuser';
      const password = 'password123';

      authServiceMock.authControllerLogin.mockReturnValue(of(TEST_USER));

      await service.login(username, password);

      // Verify the auth service was called
      expect(authServiceMock.authControllerLogin).toHaveBeenCalledWith('', {
        username,
        password,
      });

      // Verify user was set and navigation happened
      expect(service.currentUser()).toEqual(TEST_USER);
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

      authServiceMock.authControllerLogin.mockReturnValue(
        throwError(() => errorResponse)
      );

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
      const authService = TestBed.inject(AuthService);
      const router = TestBed.inject(Router);
      const service = TestBed.inject(UserService);

      vi
        .spyOn(authService, 'authControllerLogout')
        .mockReturnValue(of(new HttpResponse({ status: 200 })));
      const clearCurrentUserSpy = vi
        .spyOn(service, 'clearCurrentUser')
        .mockResolvedValue();

      await service.logout();

      expect(authService.authControllerLogout).toHaveBeenCalled();
      expect(clearCurrentUserSpy).toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/welcome']);
    });

    it('should handle logout failure', async () => {
      const authService = TestBed.inject(AuthService);
      const service = TestBed.inject(UserService);

      const error = new UserServiceError(
        'SERVER_ERROR',
        'Failed to load user data'
      );
      vi
        .spyOn(authService, 'authControllerLogout')
        .mockReturnValue(throwError(() => new Error('Logout failed')));
      const clearCurrentUserSpy = vi
        .spyOn(service, 'clearCurrentUser')
        .mockResolvedValue();

      await expect(service.logout()).rejects.toThrow(error.message);
      expect(clearCurrentUserSpy).not.toHaveBeenCalled();
    });
  });
});
