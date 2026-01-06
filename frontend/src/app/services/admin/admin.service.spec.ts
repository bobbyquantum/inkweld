import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminService as ApiAdminService } from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { SetupService } from '../core/setup.service';
import {
  AdminService,
  AdminServiceError,
  AdminUser,
  PaginatedUsersResponse,
} from './admin.service';

const TEST_USERS: AdminUser[] = [
  {
    id: '1',
    username: 'admin',
    email: 'admin@example.com',
    isAdmin: true,
    enabled: true,
    approved: true,
    githubId: null,
  },
  {
    id: '2',
    username: 'user1',
    email: 'user1@example.com',
    isAdmin: false,
    enabled: true,
    approved: true,
    githubId: null,
  },
];

const PAGINATED_RESPONSE: PaginatedUsersResponse = {
  users: TEST_USERS,
  total: TEST_USERS.length,
  hasMore: false,
};

const PENDING_USERS: AdminUser[] = [
  {
    id: '3',
    username: 'pending',
    email: 'pending@example.com',
    isAdmin: false,
    enabled: false,
    approved: false,
    githubId: null,
  },
];

describe('AdminService', () => {
  let service: AdminService;
  let httpMock: HttpTestingController;
  let apiMock: {
    adminListUsers: Mock;
    adminListPendingUsers: Mock;
    adminApproveUser: Mock;
    adminRejectUser: Mock;
    adminEnableUser: Mock;
    adminDisableUser: Mock;
    adminSetUserAdmin: Mock;
    adminDeleteUser: Mock;
  };
  let loggerMock: { error: Mock };

  beforeEach(() => {
    apiMock = {
      adminListUsers: vi.fn(),
      adminListPendingUsers: vi.fn(),
      adminApproveUser: vi.fn(),
      adminRejectUser: vi.fn(),
      adminEnableUser: vi.fn(),
      adminDisableUser: vi.fn(),
      adminSetUserAdmin: vi.fn(),
      adminDeleteUser: vi.fn(),
    };

    loggerMock = {
      error: vi.fn(),
    };

    const setupServiceMock = {
      getServerUrl: vi.fn().mockReturnValue(''),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminService,
        { provide: ApiAdminService, useValue: apiMock },
        { provide: LoggerService, useValue: loggerMock },
        { provide: SetupService, useValue: setupServiceMock },
      ],
    });

    service = TestBed.inject(AdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  describe('listUsers', () => {
    it('should fetch all users and update state', async () => {
      const promise = service.listUsers();

      const req = httpMock.expectOne('/api/v1/users');
      expect(req.request.method).toBe('GET');
      req.flush(PAGINATED_RESPONSE);

      const result = await promise;

      expect(result).toEqual(PAGINATED_RESPONSE);
      expect(service.users()).toEqual(TEST_USERS);
      expect(service.totalUsers()).toBe(TEST_USERS.length);
      expect(service.hasMoreUsers()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeUndefined();
    });

    it('should set isLoading during fetch', async () => {
      const promise = service.listUsers();
      // isLoading is set synchronously before await
      expect(service.isLoading()).toBe(true);

      const req = httpMock.expectOne('/api/v1/users');
      req.flush(PAGINATED_RESPONSE);

      await promise;
      expect(service.isLoading()).toBe(false);
    });

    it('should handle errors and set error state', async () => {
      const promise = service.listUsers();

      const req = httpMock.expectOne('/api/v1/users');
      req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

      await expect(promise).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('FORBIDDEN');
      expect(service.isLoading()).toBe(false);
      expect(loggerMock.error).toHaveBeenCalled();
    });

    it('should support search parameter', async () => {
      const promise = service.listUsers({ search: 'admin' });

      const req = httpMock.expectOne('/api/v1/users?search=admin');
      expect(req.request.method).toBe('GET');
      req.flush(PAGINATED_RESPONSE);

      await promise;
    });

    it('should support pagination parameters', async () => {
      const promise = service.listUsers({ limit: 10, offset: 20 });

      const req = httpMock.expectOne('/api/v1/users?limit=10&offset=20');
      expect(req.request.method).toBe('GET');
      req.flush(PAGINATED_RESPONSE);

      await promise;
    });

    it('should append users when loading more (offset > 0)', async () => {
      // First, set some initial users
      service['users'].set(TEST_USERS);

      const moreUsers: AdminUser[] = [
        {
          id: '4',
          username: 'user3',
          email: 'user3@example.com',
          isAdmin: false,
          enabled: true,
          approved: true,
          githubId: null,
        },
      ];

      const promise = service.listUsers({ offset: 2 });

      const req = httpMock.expectOne('/api/v1/users?offset=2');
      req.flush({ users: moreUsers, total: 3, hasMore: false });

      await promise;

      // Should have appended the new users
      expect(service.users().length).toBe(TEST_USERS.length + 1);
    });
  });

  describe('loadAllUsers', () => {
    it('should fetch both users and pending users and update state atomically', async () => {
      apiMock.adminListPendingUsers.mockReturnValue(of(PENDING_USERS));

      const result = service.loadAllUsers();

      // Request for users should be made (no query params when no options provided)
      const req = httpMock.expectOne('/api/v1/users');
      expect(req.request.method).toBe('GET');
      req.flush(PAGINATED_RESPONSE);

      await result;

      expect(service.users()).toEqual(TEST_USERS);
      expect(service.pendingUsers()).toEqual(PENDING_USERS);
      expect(service.totalUsers()).toBe(TEST_USERS.length);
      expect(service.hasMoreUsers()).toBe(false);
      expect(service.isLoading()).toBe(false);
    });

    it('should handle errors in loadAllUsers', async () => {
      const httpError = new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
      });
      apiMock.adminListPendingUsers.mockReturnValue(
        throwError(() => httpError)
      );

      const resultPromise = service.loadAllUsers();

      // Both requests could be made, but one will fail (no query params when no options provided)
      const req = httpMock.expectOne('/api/v1/users');
      req.flush(PAGINATED_RESPONSE);

      await expect(resultPromise).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('FORBIDDEN');
      expect(service.isLoading()).toBe(false);
    });

    it('should support search parameter in loadAllUsers', async () => {
      apiMock.adminListPendingUsers.mockReturnValue(of(PENDING_USERS));

      const result = service.loadAllUsers({ search: 'test', limit: 10 });

      const req = httpMock.expectOne('/api/v1/users?search=test&limit=10');
      expect(req.request.method).toBe('GET');
      req.flush(PAGINATED_RESPONSE);

      await result;

      expect(service.users()).toEqual(TEST_USERS);
    });
  });

  describe('listPendingUsers', () => {
    it('should fetch pending users and update state', async () => {
      apiMock.adminListPendingUsers.mockReturnValue(of(PENDING_USERS));

      const result = await service.listPendingUsers();

      expect(result).toEqual(PENDING_USERS);
      expect(service.pendingUsers()).toEqual(PENDING_USERS);
      expect(service.isLoading()).toBe(false);
    });

    it('should handle errors', async () => {
      const httpError = new HttpErrorResponse({
        status: 401,
        statusText: 'Unauthorized',
      });
      apiMock.adminListPendingUsers.mockReturnValue(
        throwError(() => httpError)
      );

      await expect(service.listPendingUsers()).rejects.toThrow(
        AdminServiceError
      );
      expect(service.error()?.code).toBe('UNAUTHORIZED');
    });
  });

  describe('approveUser', () => {
    it('should approve user and update state', async () => {
      const approvedUser: AdminUser = {
        ...PENDING_USERS[0],
        approved: true,
        enabled: true,
      };
      apiMock.adminApproveUser.mockReturnValue(of(approvedUser));

      // Set initial state
      service['pendingUsers'].set([...PENDING_USERS]);
      service['users'].set([...TEST_USERS, PENDING_USERS[0]]);

      const result = await service.approveUser('3');

      expect(result).toEqual(approvedUser);
      expect(service.pendingUsers().find(u => u.id === '3')).toBeUndefined();
      expect(service.users().find(u => u.id === '3')).toEqual(approvedUser);
    });

    it('should handle 404 error', async () => {
      const httpError = new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
      });
      apiMock.adminApproveUser.mockReturnValue(throwError(() => httpError));

      await expect(service.approveUser('999')).rejects.toThrow(
        AdminServiceError
      );
      expect(service.error()?.code).toBe('NOT_FOUND');
    });
  });

  describe('rejectUser', () => {
    it('should reject user and remove from state', async () => {
      apiMock.adminRejectUser.mockReturnValue(of(undefined));

      service['pendingUsers'].set([...PENDING_USERS]);
      service['users'].set([...TEST_USERS, PENDING_USERS[0]]);

      await service.rejectUser('3');

      expect(service.pendingUsers().find(u => u.id === '3')).toBeUndefined();
      expect(service.users().find(u => u.id === '3')).toBeUndefined();
    });

    it('should handle errors', async () => {
      const httpError = new HttpErrorResponse({
        status: 500,
        statusText: 'Server Error',
        error: { error: 'Database error' },
      });
      apiMock.adminRejectUser.mockReturnValue(throwError(() => httpError));

      await expect(service.rejectUser('3')).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('SERVER_ERROR');
      expect(service.error()?.message).toBe('Database error');
    });
  });

  describe('enableUser', () => {
    it('should enable user and update state', async () => {
      const enabledUser: AdminUser = {
        ...TEST_USERS[1],
        enabled: true,
      };
      apiMock.adminEnableUser.mockReturnValue(of(enabledUser));
      service['users'].set([...TEST_USERS]);

      const result = await service.enableUser('2');

      expect(result).toEqual(enabledUser);
      expect(service.users().find(u => u.id === '2')).toEqual(enabledUser);
    });
  });

  describe('disableUser', () => {
    it('should disable user and update state', async () => {
      const disabledUser: AdminUser = {
        ...TEST_USERS[1],
        enabled: false,
      };
      apiMock.adminDisableUser.mockReturnValue(of(disabledUser));
      service['users'].set([...TEST_USERS]);

      const result = await service.disableUser('2');

      expect(result).toEqual(disabledUser);
      expect(service.users().find(u => u.id === '2')?.enabled).toBe(false);
    });
  });

  describe('setUserAdmin', () => {
    it('should grant admin status', async () => {
      const adminUser: AdminUser = {
        ...TEST_USERS[1],
        isAdmin: true,
      };
      apiMock.adminSetUserAdmin.mockReturnValue(of(adminUser));
      service['users'].set([...TEST_USERS]);

      const result = await service.setUserAdmin('2', true);

      expect(result.isAdmin).toBe(true);
      expect(apiMock.adminSetUserAdmin).toHaveBeenCalledWith('2', {
        isAdmin: true,
      });
    });

    it('should revoke admin status', async () => {
      const regularUser: AdminUser = {
        ...TEST_USERS[0],
        isAdmin: false,
      };
      apiMock.adminSetUserAdmin.mockReturnValue(of(regularUser));
      service['users'].set([...TEST_USERS]);

      const result = await service.setUserAdmin('1', false);

      expect(result.isAdmin).toBe(false);
      expect(apiMock.adminSetUserAdmin).toHaveBeenCalledWith('1', {
        isAdmin: false,
      });
    });

    it('should handle errors', async () => {
      const httpError = new HttpErrorResponse({
        status: 500,
        statusText: 'Server Error',
      });
      apiMock.adminSetUserAdmin.mockReturnValue(throwError(() => httpError));

      await expect(service.setUserAdmin('1', true)).rejects.toThrow(
        AdminServiceError
      );
      expect(loggerMock.error).toHaveBeenCalledWith(
        'AdminService',
        'Failed to set user admin status',
        expect.any(AdminServiceError)
      );
    });
  });

  describe('deleteUser', () => {
    it('should delete user and remove from all lists', async () => {
      apiMock.adminDeleteUser.mockReturnValue(of(undefined));
      service['users'].set([...TEST_USERS]);
      service['pendingUsers'].set([...PENDING_USERS]);

      await service.deleteUser('2');

      expect(service.users().find(u => u.id === '2')).toBeUndefined();
      expect(service.users().length).toBe(1);
    });

    it('should also remove from pending users list', async () => {
      apiMock.adminDeleteUser.mockReturnValue(of(undefined));
      service['users'].set([...TEST_USERS, PENDING_USERS[0]]);
      service['pendingUsers'].set([...PENDING_USERS]);

      await service.deleteUser('3');

      expect(service.pendingUsers().find(u => u.id === '3')).toBeUndefined();
      expect(service.users().find(u => u.id === '3')).toBeUndefined();
    });

    it('should handle errors', async () => {
      const httpError = new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
      });
      apiMock.adminDeleteUser.mockReturnValue(throwError(() => httpError));

      await expect(service.deleteUser('1')).rejects.toThrow(AdminServiceError);
      expect(loggerMock.error).toHaveBeenCalledWith(
        'AdminService',
        'Failed to delete user',
        expect.any(AdminServiceError)
      );
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      const promise = service.listUsers();

      const req = httpMock.expectOne('/api/v1/users');
      req.error(new ProgressEvent('error'), { status: 0 });

      await expect(promise).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('should handle 401 unauthorized', async () => {
      const promise = service.listUsers();

      const req = httpMock.expectOne('/api/v1/users');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      await expect(promise).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('UNAUTHORIZED');
      expect(service.error()?.message).toBe('Not authenticated');
    });

    it('should handle 403 forbidden', async () => {
      const promise = service.listUsers();

      const req = httpMock.expectOne('/api/v1/users');
      req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });

      await expect(promise).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('FORBIDDEN');
      expect(service.error()?.message).toBe('Admin access required');
    });

    it('should handle 404 not found', async () => {
      const httpError = new HttpErrorResponse({
        status: 404,
        statusText: 'Not Found',
      });
      apiMock.adminApproveUser.mockReturnValue(throwError(() => httpError));

      await expect(service.approveUser('999')).rejects.toThrow(
        AdminServiceError
      );
      expect(service.error()?.code).toBe('NOT_FOUND');
      expect(service.error()?.message).toBe('User not found');
    });

    it('should handle generic server errors with custom message', async () => {
      const promise = service.listUsers();

      const req = httpMock.expectOne('/api/v1/users');
      req.flush(
        { error: 'Custom error message' },
        { status: 500, statusText: 'Internal Server Error' }
      );

      await expect(promise).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('SERVER_ERROR');
      expect(service.error()?.message).toBe('Custom error message');
    });

    it('should handle generic server errors without custom message', async () => {
      const promise = service.listUsers();

      const req = httpMock.expectOne('/api/v1/users');
      req.flush('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(promise).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('SERVER_ERROR');
      expect(service.error()?.message).toBe('An unexpected error occurred');
    });
  });

  describe('AdminServiceError', () => {
    it('should have correct name and properties', () => {
      const error = new AdminServiceError('FORBIDDEN', 'Test message');

      expect(error.name).toBe('AdminServiceError');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Test message');
      expect(error instanceof Error).toBe(true);
    });
  });
});
