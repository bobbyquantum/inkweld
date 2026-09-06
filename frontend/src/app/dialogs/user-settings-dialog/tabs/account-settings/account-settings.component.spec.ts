import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { ProfileVisibility } from '@inkweld/model/profile-visibility';
import { SystemConfigService } from '@services/core/system-config.service';
import { UserService } from '@services/user/user.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../../../testing/transloco-test-provider';
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
    isPasskeysEnabled: ReturnType<typeof vi.fn>;
    isPasskeyManagementAvailable: ReturnType<typeof vi.fn>;
    isPasswordLoginEnabled: ReturnType<typeof vi.fn>;
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
      isPasskeysEnabled: vi.fn().mockReturnValue(true),
      isPasskeyManagementAvailable: vi.fn().mockReturnValue(true),
      isPasswordLoginEnabled: vi.fn().mockReturnValue(true),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), AccountSettingsComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
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

  describe('passkeys section', () => {
    it('should render the passkeys section when passkey management is available', () => {
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('app-passkeys-settings')).toBeTruthy();
    });

    it('should not render the passkeys section when passkey management is unavailable', () => {
      // Local mode has no server-side credential store, so rendering the
      // section would fire a doomed /auth/passkeys request on init.
      mockSystemConfig.isPasskeyManagementAvailable.mockReturnValue(false);

      fixture = TestBed.createComponent(AccountSettingsComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('app-passkeys-settings')).toBeFalsy();
    });
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
    it('should show password chip for local users when password login is enabled', () => {
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
      const passwordChip = el.querySelector(
        '[data-testid="auth-chip-password"]'
      );
      const passkeyChip = el.querySelector('[data-testid="auth-chip-passkey"]');
      const githubChip = el.querySelector('[data-testid="auth-chip-github"]');
      expect(passwordChip).toBeTruthy();
      expect(passkeyChip).toBeFalsy();
      expect(githubChip).toBeFalsy();
    });

    it('should show passkey chip for local users when password login is disabled', () => {
      mockSystemConfig.isPasswordLoginEnabled.mockReturnValue(false);
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
      const passwordChip = el.querySelector(
        '[data-testid="auth-chip-password"]'
      );
      const passkeyChip = el.querySelector('[data-testid="auth-chip-passkey"]');
      expect(passkeyChip).toBeTruthy();
      expect(passwordChip).toBeFalsy();
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
      const passwordChip = el.querySelector(
        '[data-testid="auth-chip-password"]'
      );
      const githubChip = el.querySelector('[data-testid="auth-chip-github"]');
      expect(passwordChip).toBeFalsy();
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
      const passwordChip = el.querySelector(
        '[data-testid="auth-chip-password"]'
      );
      const githubChip = el.querySelector('[data-testid="auth-chip-github"]');
      expect(passwordChip).toBeTruthy();
      expect(githubChip).toBeTruthy();
    });

    it('should not show auth section when authProvider is undefined', () => {
      const el: HTMLElement = fixture.nativeElement;
      const section = el.querySelector('[data-testid="auth-provider-section"]');
      expect(section).toBeFalsy();
    });
  });

  describe('public profile section', () => {
    it('defaults to a private profile when the user has no settings yet', () => {
      expect(component.bio).toBe('');
      expect(component.profileVisibility).toBe(ProfileVisibility.Private);
      expect(component.activityVisibility).toBe(ProfileVisibility.Public);
      expect(component.projectsVisibility).toBe(ProfileVisibility.Private);
      const el: HTMLElement = fixture.nativeElement;
      expect(
        el.querySelector('[data-testid="public-profile-section"]')
      ).toBeTruthy();
      // Section pickers are irrelevant for a private profile.
      expect(
        el.querySelector('[data-testid="profile-sections-group"]')
      ).toBeNull();
    });

    it('hides the section entirely in local mode', () => {
      mockSystemConfig.isLocalMode.mockReturnValue(true);
      fixture = TestBed.createComponent(AccountSettingsComponent);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="public-profile-section"]'
        )
      ).toBeNull();
    });

    it('populates bio and visibility from the current user', () => {
      mockUserService.currentUser.mockReturnValue({
        id: '1',
        username: 'testuser',
        enabled: true,
        bio: 'Hello',
        profileVisibility: ProfileVisibility.Public,
        activityVisibility: ProfileVisibility.Members,
        projectsVisibility: ProfileVisibility.Public,
      });
      fixture = TestBed.createComponent(AccountSettingsComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      expect(c.bio).toBe('Hello');
      expect(c.profileVisibility).toBe(ProfileVisibility.Public);
      expect(c.activityVisibility).toBe(ProfileVisibility.Members);
      expect(c.projectsVisibility).toBe(ProfileVisibility.Public);
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="profile-sections-group"]'
        )
      ).toBeTruthy();
    });

    it('only offers section levels at least as strict as the profile', () => {
      component.onProfileVisibilityChange(ProfileVisibility.Public);
      expect(component.sectionLevels()).toEqual([
        ProfileVisibility.Public,
        ProfileVisibility.Members,
        ProfileVisibility.Private,
      ]);
      component.onProfileVisibilityChange(ProfileVisibility.Members);
      expect(component.sectionLevels()).toEqual([
        ProfileVisibility.Members,
        ProfileVisibility.Private,
      ]);
    });

    it('pulls wider section levels down when the profile narrows', () => {
      component.onProfileVisibilityChange(ProfileVisibility.Public);
      component.activityVisibility = ProfileVisibility.Public;
      component.projectsVisibility = ProfileVisibility.Private;

      component.onProfileVisibilityChange(ProfileVisibility.Members);
      expect(component.activityVisibility).toBe(ProfileVisibility.Members);
      // Already stricter — left alone.
      expect(component.projectsVisibility).toBe(ProfileVisibility.Private);
    });

    it('saves only the changed profile fields', async () => {
      component.bio = '  Slow-burn fantasy.  ';
      component.onProfileVisibilityChange(ProfileVisibility.Public);
      component.activityVisibility = ProfileVisibility.Members;
      await component.saveProfile();

      expect(mockUserService.updateProfile).toHaveBeenCalledWith({
        bio: 'Slow-burn fantasy.',
        profileVisibility: ProfileVisibility.Public,
        activityVisibility: ProfileVisibility.Members,
      });
    });

    it('does not send profile fields in local mode', async () => {
      mockSystemConfig.isLocalMode.mockReturnValue(true);
      component.bio = 'x';
      component.onProfileVisibilityChange(ProfileVisibility.Public);
      component.displayName = 'New Name';
      await component.saveProfile();
      expect(mockUserService.updateProfile).toHaveBeenCalledWith({
        name: 'New Name',
      });
    });
  });
});
