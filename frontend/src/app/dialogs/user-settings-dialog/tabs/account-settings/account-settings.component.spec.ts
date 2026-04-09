import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountSettingsComponent } from './account-settings.component';

describe('AccountSettingsComponent (dialog tab)', () => {
  let component: AccountSettingsComponent;
  let fixture: ComponentFixture<AccountSettingsComponent>;
  let mockUserService: {
    currentUser: ReturnType<typeof vi.fn>;
    updateProfile: ReturnType<typeof vi.fn>;
  };
  let mockSystemConfig: {
    isLocalMode: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: {
    open: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockUserService = {
      currentUser: vi.fn().mockReturnValue({
        id: '1',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        enabled: true,
      }),
      updateProfile: vi.fn().mockResolvedValue({
        id: '1',
        username: 'testuser',
        name: 'Updated Name',
        email: 'updated@example.com',
        enabled: true,
      }),
    };

    mockSystemConfig = {
      isLocalMode: vi.fn().mockReturnValue(false),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AccountSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UserService, useValue: mockUserService },
        { provide: SystemConfigService, useValue: mockSystemConfig },
      ],
    })
      .overrideComponent(AccountSettingsComponent, {
        add: {
          providers: [{ provide: MatSnackBar, useValue: mockSnackBar }],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AccountSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should populate fields from current user on init', () => {
    expect(component.displayName).toBe('Test User');
    expect(component.email).toBe('test@example.com');
  });

  it('should reflect local mode from system config', () => {
    expect(component.isLocalMode()).toBe(false);

    mockSystemConfig.isLocalMode.mockReturnValue(true);
    expect(component.isLocalMode()).toBe(true);
  });

  describe('saveProfile', () => {
    it('should show no changes message when nothing changed', async () => {
      await component.saveProfile();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'No changes to save',
        'Close',
        { duration: 2000 }
      );
      expect(mockUserService.updateProfile).not.toHaveBeenCalled();
    });

    it('should save only changed name', async () => {
      component.displayName = 'New Name';
      await component.saveProfile();

      expect(mockUserService.updateProfile).toHaveBeenCalledWith({
        name: 'New Name',
      });
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Profile updated',
        'Close',
        { duration: 2000 }
      );
    });

    it('should save only changed email', async () => {
      component.email = 'new@example.com';
      await component.saveProfile();

      expect(mockUserService.updateProfile).toHaveBeenCalledWith({
        email: 'new@example.com',
      });
    });

    it('should save both name and email when both changed', async () => {
      component.displayName = 'New Name';
      component.email = 'new@example.com';
      await component.saveProfile();

      expect(mockUserService.updateProfile).toHaveBeenCalledWith({
        name: 'New Name',
        email: 'new@example.com',
      });
    });

    it('should not send email in local mode even if changed', async () => {
      mockSystemConfig.isLocalMode.mockReturnValue(true);
      component.displayName = 'New Name';
      component.email = 'new@example.com';
      await component.saveProfile();

      expect(mockUserService.updateProfile).toHaveBeenCalledWith({
        name: 'New Name',
      });
    });

    it('should handle save errors gracefully', async () => {
      mockUserService.updateProfile.mockRejectedValue(
        new Error('Network error')
      );
      component.displayName = 'New Name';
      await component.saveProfile();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to update profile',
        'Close',
        { duration: 3000 }
      );
    });

    it('should set isSaving during save operation', async () => {
      mockUserService.updateProfile.mockResolvedValue({
        id: '1',
        username: 'testuser',
        name: 'New Name',
        enabled: true,
      });

      component.displayName = 'New Name';
      const savePromise = component.saveProfile();

      // isSaving is set synchronously before any await
      expect(component.isSaving()).toBe(true);

      await savePromise;
      expect(component.isSaving()).toBe(false);
    });
  });

  describe('auth provider display', () => {
    it('should show local auth chip for local users', () => {
      mockUserService.currentUser.mockReturnValue({
        id: '1',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        enabled: true,
        authProvider: 'local',
      });

      fixture = TestBed.createComponent(AccountSettingsComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const localChip = el.querySelector('[data-testid="auth-chip-local"]');
      const githubChip = el.querySelector('[data-testid="auth-chip-github"]');
      expect(localChip).toBeTruthy();
      expect(githubChip).toBeFalsy();
    });

    it('should show github auth chip for github users', () => {
      mockUserService.currentUser.mockReturnValue({
        id: '1',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        enabled: true,
        authProvider: 'github',
      });

      fixture = TestBed.createComponent(AccountSettingsComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const localChip = el.querySelector('[data-testid="auth-chip-local"]');
      const githubChip = el.querySelector('[data-testid="auth-chip-github"]');
      expect(localChip).toBeFalsy();
      expect(githubChip).toBeTruthy();
    });

    it('should show both chips for linked accounts', () => {
      mockUserService.currentUser.mockReturnValue({
        id: '1',
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        enabled: true,
        authProvider: 'local+github',
      });

      fixture = TestBed.createComponent(AccountSettingsComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const localChip = el.querySelector('[data-testid="auth-chip-local"]');
      const githubChip = el.querySelector('[data-testid="auth-chip-github"]');
      expect(localChip).toBeTruthy();
      expect(githubChip).toBeTruthy();
    });

    it('should not show auth section when authProvider is undefined', () => {
      const el: HTMLElement = fixture.nativeElement;
      const section = el.querySelector('[data-testid="auth-provider-section"]');
      expect(section).toBeFalsy();
    });
  });
});
