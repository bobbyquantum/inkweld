import 'fake-indexeddb/auto';

import { TestBed } from '@angular/core/testing';
import { UserDto } from '@worm/index';
import { UserAPIService } from '@worm/index';

import { userServiceMock } from '../../testing/user-api.mock';
import { UserService } from './user.service';

async function insertTestUser(user: UserDto): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('worm', 2);

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('users', 'readwrite');
      const store = tx.objectStore('users');
      const putRequest = store.put(user);

      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () =>
        reject(new Error(JSON.stringify(putRequest.error)));
    };

    request.onerror = () => reject(new Error(JSON.stringify(request.error)));
  });
}

global.structuredClone = val => JSON.parse(JSON.stringify(val));

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        UserService,
        {
          provide: UserAPIService,
          useValue: userServiceMock,
        },
      ],
    });

    service = TestBed.inject(UserService);

    // Initialize fake-indexeddb
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('worm', 2);

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'username' });
        }
      };

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(JSON.stringify(request.error)));
    });

    // Add initial test user and set as current user
    const testUser = {
      username: 'testuser',
      name: 'Test User',
      avatarImageUrl: 'https://example.com/avatar.png',
    };
    await insertTestUser(testUser);
    await service.setCurrentUser(testUser);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('currentUser signal', () => {
    it('should return cached user if available', async () => {
      const testUser = {
        username: 'testuser',
        name: 'Test User',
        avatarImageUrl: 'https://example.com/avatar.png',
      };
      await insertTestUser(testUser);
      await service.setCurrentUser(testUser);
      const user = service.currentUser;
      expect(user()).toEqual({
        username: 'testuser',
        name: 'Test User',
        avatarImageUrl: 'https://example.com/avatar.png',
      });
      // The API should not be called since we set the user in beforeEach
      expect(userServiceMock.userControllerGetMe).toHaveBeenCalledTimes(0);
    });

    it('should fetch from API if no cached user', async () => {
      // Clear cache and reset service
      indexedDB = new IDBFactory();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          UserService,
          {
            provide: UserAPIService,
            useValue: userServiceMock,
          },
        ],
      });
      service = TestBed.inject(UserService);

      const user = service.currentUser;
      // Initialize signal with null
      expect(user()).toBeUndefined();

      // Trigger API fetch
      await service.loadCurrentUser();

      // Wait for signal update
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(user()).toEqual({
        username: 'testuser',
        name: 'Test User',
        avatarImageUrl: 'https://example.com/avatar.png',
      });
      expect(userServiceMock.userControllerGetMe).toHaveBeenCalled();
    });
  });
});
