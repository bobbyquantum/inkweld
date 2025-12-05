import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { User } from '@inkweld/model/user';
import { AdminService, AdminUser } from '@services/admin/admin.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { AdminComponent } from './admin.component';

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
  {
    id: '3',
    username: 'disabled',
    email: 'disabled@example.com',
    isAdmin: false,
    enabled: false,
    approved: true,
    githubId: null,
  },
];

const PENDING_USERS: AdminUser[] = [
  {
    id: '4',
    username: 'pending',
    email: 'pending@example.com',
    isAdmin: false,
    enabled: false,
    approved: false,
    githubId: null,
  },
];

const CURRENT_USER: User = {
  id: '1',
  username: 'admin',
  name: 'Admin User',
  enabled: true,
};

describe('AdminComponent', () => {
  let component: AdminComponent;
  let adminServiceMock: {
    users: ReturnType<typeof signal<AdminUser[]>>;
    pendingUsers: ReturnType<typeof signal<AdminUser[]>>;
    isLoading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<Error | undefined>>;
    listUsers: Mock;
    listPendingUsers: Mock;
    approveUser: Mock;
    rejectUser: Mock;
    enableUser: Mock;
    disableUser: Mock;
    setUserAdmin: Mock;
    deleteUser: Mock;
  };
  let userServiceMock: {
    currentUser: ReturnType<typeof signal<User | null>>;
  };
  let snackBarMock: { open: Mock };
  let dialogMock: { open: Mock };

  beforeEach(async () => {
    adminServiceMock = {
      users: signal<AdminUser[]>([]),
      pendingUsers: signal<AdminUser[]>([]),
      isLoading: signal(false),
      error: signal<Error | undefined>(undefined),
      listUsers: vi.fn().mockResolvedValue(TEST_USERS),
      listPendingUsers: vi.fn().mockResolvedValue(PENDING_USERS),
      approveUser: vi
        .fn()
        .mockResolvedValue({ ...PENDING_USERS[0], approved: true }),
      rejectUser: vi.fn().mockResolvedValue(undefined),
      enableUser: vi
        .fn()
        .mockResolvedValue({ ...TEST_USERS[2], enabled: true }),
      disableUser: vi
        .fn()
        .mockResolvedValue({ ...TEST_USERS[1], enabled: false }),
      setUserAdmin: vi
        .fn()
        .mockResolvedValue({ ...TEST_USERS[1], isAdmin: true }),
      deleteUser: vi.fn().mockResolvedValue(undefined),
    };

    userServiceMock = {
      currentUser: signal<User | null>(CURRENT_USER),
    };

    snackBarMock = { open: vi.fn() };
    dialogMock = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(true),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AdminService, useValue: adminServiceMock },
        { provide: UnifiedUserService, useValue: userServiceMock },
        { provide: MatSnackBar, useValue: snackBarMock },
        { provide: MatDialog, useValue: dialogMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load users on init', () => {
      component.ngOnInit();

      expect(adminServiceMock.listUsers).toHaveBeenCalled();
      expect(adminServiceMock.listPendingUsers).toHaveBeenCalled();
    });
  });

  describe('loadUsers', () => {
    beforeEach(() => {
      // Reset mocks to ensure clean state
      adminServiceMock.listUsers.mockReset();
      adminServiceMock.listPendingUsers.mockReset();
      adminServiceMock.listUsers.mockResolvedValue(TEST_USERS);
      adminServiceMock.listPendingUsers.mockResolvedValue(PENDING_USERS);
    });

    it('should load both users and pending users', async () => {
      await component.loadUsers();

      expect(adminServiceMock.listUsers).toHaveBeenCalled();
      expect(adminServiceMock.listPendingUsers).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      adminServiceMock.listUsers.mockRejectedValueOnce(new Error('Failed'));

      // Should not throw, even on error
      await expect(component.loadUsers()).resolves.not.toThrow();
    });
  });

  describe('computed lists', () => {
    beforeEach(() => {
      adminServiceMock.users.set(TEST_USERS);
      adminServiceMock.pendingUsers.set(PENDING_USERS);
    });

    it('should compute active users (approved and enabled)', () => {
      expect(component.activeUsers().length).toBe(2); // admin and user1
      expect(component.activeUsers().every(u => u.approved && u.enabled)).toBe(
        true
      );
    });

    it('should compute disabled users (approved but not enabled)', () => {
      expect(component.disabledUsers().length).toBe(1);
      expect(component.disabledUsers()[0].username).toBe('disabled');
    });

    it('should compute admin users', () => {
      expect(component.adminUsers().length).toBe(1);
      expect(component.adminUsers()[0].isAdmin).toBe(true);
    });
  });

  describe('approveUser', () => {
    beforeEach(() => {
      adminServiceMock.approveUser.mockReset();
      adminServiceMock.approveUser.mockResolvedValue({
        ...PENDING_USERS[0],
        approved: true,
      });
      adminServiceMock.listUsers.mockResolvedValue(TEST_USERS);
      adminServiceMock.listPendingUsers.mockResolvedValue([]);
    });

    it('should approve user and reload users', async () => {
      await component.approveUser(PENDING_USERS[0]);

      expect(adminServiceMock.approveUser).toHaveBeenCalledWith('4');
      expect(adminServiceMock.listUsers).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      adminServiceMock.approveUser.mockRejectedValueOnce(new Error('Failed'));

      // Should not throw
      await expect(
        component.approveUser(PENDING_USERS[0])
      ).resolves.not.toThrow();
      expect(adminServiceMock.approveUser).toHaveBeenCalledWith('4');
    });
  });

  describe('rejectUser', () => {
    beforeEach(() => {
      adminServiceMock.rejectUser.mockReset();
      adminServiceMock.rejectUser.mockResolvedValue(undefined);
      adminServiceMock.listUsers.mockResolvedValue(TEST_USERS);
      adminServiceMock.listPendingUsers.mockResolvedValue([]);
    });

    it('should reject user after confirmation and reload users', async () => {
      await component.rejectUser(PENDING_USERS[0]);

      expect(dialogMock.open).toHaveBeenCalled();
      expect(adminServiceMock.rejectUser).toHaveBeenCalledWith('4');
      expect(adminServiceMock.listUsers).toHaveBeenCalled();
    });

    it('should not reject if confirmation is cancelled', async () => {
      dialogMock.open.mockReturnValueOnce({
        afterClosed: () => of(false),
      });

      await component.rejectUser(PENDING_USERS[0]);

      expect(adminServiceMock.rejectUser).not.toHaveBeenCalled();
    });
  });

  describe('enableUser', () => {
    beforeEach(() => {
      adminServiceMock.enableUser.mockReset();
      adminServiceMock.enableUser.mockResolvedValue({
        ...TEST_USERS[2],
        enabled: true,
      });
      adminServiceMock.listUsers.mockResolvedValue(TEST_USERS);
      adminServiceMock.listPendingUsers.mockResolvedValue([]);
    });

    it('should enable user and reload users', async () => {
      await component.enableUser(TEST_USERS[2]);

      expect(adminServiceMock.enableUser).toHaveBeenCalledWith('3');
      expect(adminServiceMock.listUsers).toHaveBeenCalled();
    });
  });

  describe('disableUser', () => {
    it('should disable user after confirmation', async () => {
      await component.disableUser(TEST_USERS[1]);

      expect(dialogMock.open).toHaveBeenCalled();
      expect(adminServiceMock.disableUser).toHaveBeenCalledWith('2');
    });

    it('should not disable if confirmation is cancelled', async () => {
      dialogMock.open.mockReturnValueOnce({
        afterClosed: () => of(false),
      });

      await component.disableUser(TEST_USERS[1]);

      expect(adminServiceMock.disableUser).not.toHaveBeenCalled();
    });
  });

  describe('toggleAdmin', () => {
    it('should grant admin privileges after confirmation', async () => {
      await component.toggleAdmin(TEST_USERS[1]); // not admin

      expect(dialogMock.open).toHaveBeenCalled();
      expect(adminServiceMock.setUserAdmin).toHaveBeenCalledWith('2', true);
    });

    it('should revoke admin privileges after confirmation', async () => {
      await component.toggleAdmin(TEST_USERS[0]); // is admin

      expect(dialogMock.open).toHaveBeenCalled();
      expect(adminServiceMock.setUserAdmin).toHaveBeenCalledWith('1', false);
    });
  });

  describe('deleteUser', () => {
    it('should delete user after confirmation', async () => {
      await component.deleteUser(TEST_USERS[1]);

      expect(dialogMock.open).toHaveBeenCalled();
      expect(adminServiceMock.deleteUser).toHaveBeenCalledWith('2');
    });
  });

  describe('getUserStatus', () => {
    it('should return Pending for unapproved users', () => {
      const status = component.getUserStatus(PENDING_USERS[0]);
      expect(status.label).toBe('Pending');
      expect(status.cssClass).toBe('status-pending');
    });

    it('should return Disabled for disabled users', () => {
      const status = component.getUserStatus(TEST_USERS[2]);
      expect(status.label).toBe('Disabled');
      expect(status.cssClass).toBe('status-disabled');
    });

    it('should return Admin for admin users', () => {
      const status = component.getUserStatus(TEST_USERS[0]);
      expect(status.label).toBe('Admin');
      expect(status.cssClass).toBe('status-admin');
    });

    it('should return Active for normal active users', () => {
      const status = component.getUserStatus(TEST_USERS[1]);
      expect(status.label).toBe('Active');
      expect(status.cssClass).toBe('status-active');
    });
  });

  describe('isCurrentUser', () => {
    it('should return true for current user', () => {
      expect(component.isCurrentUser(TEST_USERS[0])).toBe(true);
    });

    it('should return false for other users', () => {
      expect(component.isCurrentUser(TEST_USERS[1])).toBe(false);
    });
  });
});
