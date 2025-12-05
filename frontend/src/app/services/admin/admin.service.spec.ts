import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminService as ApiAdminService } from '@inkweld/index';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { AdminService, AdminServiceError, AdminUser } from './admin.service';

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

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminService,
        { provide: ApiAdminService, useValue: apiMock },
        { provide: LoggerService, useValue: loggerMock },
      ],
    });

    service = TestBed.inject(AdminService);
  });

  describe('listUsers', () => {
    it('should fetch all users and update state', async () => {
      apiMock.adminListUsers.mockReturnValue(of(TEST_USERS));

      const result = await service.listUsers();

      expect(result).toEqual(TEST_USERS);
      expect(service.users()).toEqual(TEST_USERS);
      expect(service.isLoading()).toBe(false);
      expect(service.error()).toBeUndefined();
    });

    it('should set isLoading during fetch', async () => {
      apiMock.adminListUsers.mockReturnValue(of(TEST_USERS));

      const promise = service.listUsers();
      // isLoading is set synchronously before await
      expect(service.isLoading()).toBe(true);

      await promise;
      expect(service.isLoading()).toBe(false);
    });

    it('should handle errors and set error state', async () => {
      const httpError = new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
      });
      apiMock.adminListUsers.mockReturnValue(throwError(() => httpError));

      await expect(service.listUsers()).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('FORBIDDEN');
      expect(service.isLoading()).toBe(false);
      expect(loggerMock.error).toHaveBeenCalled();
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
      const networkError = new HttpErrorResponse({
        error: new ErrorEvent('Network error', {
          message: 'Connection failed',
        }),
        status: 0,
      });
      apiMock.adminListUsers.mockReturnValue(throwError(() => networkError));

      await expect(service.listUsers()).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('NETWORK_ERROR');
    });

    it('should handle 401 unauthorized', async () => {
      const httpError = new HttpErrorResponse({
        status: 401,
        statusText: 'Unauthorized',
      });
      apiMock.adminListUsers.mockReturnValue(throwError(() => httpError));

      await expect(service.listUsers()).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('UNAUTHORIZED');
      expect(service.error()?.message).toBe('Not authenticated');
    });

    it('should handle 403 forbidden', async () => {
      const httpError = new HttpErrorResponse({
        status: 403,
        statusText: 'Forbidden',
      });
      apiMock.adminListUsers.mockReturnValue(throwError(() => httpError));

      await expect(service.listUsers()).rejects.toThrow(AdminServiceError);
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
      const httpError = new HttpErrorResponse({
        status: 500,
        statusText: 'Internal Server Error',
        error: { error: 'Custom error message' },
      });
      apiMock.adminListUsers.mockReturnValue(throwError(() => httpError));

      await expect(service.listUsers()).rejects.toThrow(AdminServiceError);
      expect(service.error()?.code).toBe('SERVER_ERROR');
      expect(service.error()?.message).toBe('Custom error message');
    });

    it('should handle generic server errors without custom message', async () => {
      const httpError = new HttpErrorResponse({
        status: 500,
        statusText: 'Internal Server Error',
      });
      apiMock.adminListUsers.mockReturnValue(throwError(() => httpError));

      await expect(service.listUsers()).rejects.toThrow(AdminServiceError);
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
