import 'fake-indexeddb/auto';

import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UserDto } from '@worm/index';
import { UserAPIService } from '@worm/index';
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
  avatarImageUrl: 'https://example.com/avatar.png',
};

describe('UserService', () => {
  let service: UserService;
  let storageService: StorageService;

  beforeEach(() => {
    userServiceMock.userControllerGetMe.mockReturnValue(of(TEST_USER));

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
      ],
    });

    service = TestBed.inject(UserService);
    storageService = TestBed.inject(StorageService);
  });

  afterEach(() => {
    indexedDB = new IDBFactory();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize with undefined user', () => {
      expect(service.currentUser()).toBeUndefined();
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
      expect(service.currentUser()).toBeUndefined();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should persist user to storage when available', async () => {
      const spy = jest.spyOn(storageService, 'put');
      await service.setCurrentUser(TEST_USER);
      expect(spy).toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      jest
        .spyOn(storageService, 'put')
        .mockRejectedValue(new Error('Storage error'));
      await expect(service.setCurrentUser(TEST_USER)).resolves.not.toThrow();
      expect(service.currentUser()).toEqual(TEST_USER);
    });
  });
});
