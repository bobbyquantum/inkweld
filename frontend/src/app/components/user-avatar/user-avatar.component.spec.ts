import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { OfflineStorageService } from '@services/offline/offline-storage.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserService } from '@services/user/user.service';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  let component: UserAvatarComponent;
  let mockUserService: { getUserAvatar: ReturnType<typeof vi.fn> };
  let mockUnifiedUserService: { getMode: ReturnType<typeof vi.fn> };
  let mockOfflineStorageService: {
    getUserAvatarUrl: ReturnType<typeof vi.fn>;
    saveUserAvatar: ReturnType<typeof vi.fn>;
  };
  let mockSanitizer: { bypassSecurityTrustUrl: ReturnType<typeof vi.fn> };
  let mockChangeDetectorRef: { detectChanges: ReturnType<typeof vi.fn> };

  const createdObjectURLs: string[] = [];
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(async () => {
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn((_blob: Blob) => {
      const url = `blob:mock-${createdObjectURLs.length}`;
      createdObjectURLs.push(url);
      return url;
    });

    URL.revokeObjectURL = vi.fn();

    mockUserService = {
      getUserAvatar: vi
        .fn()
        .mockReturnValue(of(new Blob(['test'], { type: 'image/png' }))),
    };

    mockUnifiedUserService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    mockOfflineStorageService = {
      getUserAvatarUrl: vi.fn().mockResolvedValue(null),
      saveUserAvatar: vi.fn().mockResolvedValue(undefined),
    };

    mockSanitizer = {
      bypassSecurityTrustUrl: vi.fn((url: string) => url as SafeUrl),
    };

    mockChangeDetectorRef = {
      detectChanges: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [UserAvatarComponent],
      providers: [
        { provide: UserService, useValue: mockUserService },
        { provide: UnifiedUserService, useValue: mockUnifiedUserService },
        { provide: OfflineStorageService, useValue: mockOfflineStorageService },
        { provide: DomSanitizer, useValue: mockSanitizer },
        { provide: ChangeDetectorRef, useValue: mockChangeDetectorRef },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(UserAvatarComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    createdObjectURLs.length = 0;
    vi.resetAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('loadAvatar', () => {
    it('should load avatar from cache when available in server mode', async () => {
      const cachedUrl = 'blob:cached-avatar-url';
      mockOfflineStorageService.getUserAvatarUrl.mockResolvedValue(cachedUrl);

      component.username = 'testuser';
      await component.loadAvatar();

      expect(mockOfflineStorageService.getUserAvatarUrl).toHaveBeenCalledWith(
        'testuser'
      );
      expect(mockSanitizer.bypassSecurityTrustUrl).toHaveBeenCalledWith(
        cachedUrl
      );
      expect(mockUserService.getUserAvatar).not.toHaveBeenCalled();
    });

    it('should not call server in offline mode', async () => {
      mockUnifiedUserService.getMode.mockReturnValue('offline');
      mockOfflineStorageService.getUserAvatarUrl.mockResolvedValue(null);

      component.username = 'testuser';
      await component.loadAvatar();

      expect(mockOfflineStorageService.getUserAvatarUrl).toHaveBeenCalledWith(
        'testuser'
      );
      expect(mockUserService.getUserAvatar).not.toHaveBeenCalled();
    });

    it('should load from cache in offline mode when available', async () => {
      mockUnifiedUserService.getMode.mockReturnValue('offline');
      const cachedUrl = 'blob:cached-avatar-url';
      mockOfflineStorageService.getUserAvatarUrl.mockResolvedValue(cachedUrl);

      component.username = 'testuser';
      await component.loadAvatar();

      expect(mockOfflineStorageService.getUserAvatarUrl).toHaveBeenCalledWith(
        'testuser'
      );
      expect(mockSanitizer.bypassSecurityTrustUrl).toHaveBeenCalledWith(
        cachedUrl
      );
    });
  });

  describe('cleanup on destroy', () => {
    it('should cleanup component without error', () => {
      component.username = 'testuser';
      component.ngOnDestroy();
      expect(component).toBeTruthy();
    });
  });

  describe('ngOnChanges', () => {
    it('should trigger loadAvatar when username changes', () => {
      const loadAvatarSpy = vi.spyOn(component, 'loadAvatar');
      component.username = 'testuser';
      component.ngOnChanges({
        username: {
          currentValue: 'testuser',
          previousValue: undefined,
          firstChange: true,
          isFirstChange: () => true,
        },
      });
      expect(loadAvatarSpy).toHaveBeenCalled();
    });

    it('should trigger loadAvatar when hasAvatar changes', () => {
      const loadAvatarSpy = vi.spyOn(component, 'loadAvatar');
      component.username = 'testuser';
      component.hasAvatar = true;
      component.ngOnChanges({
        hasAvatar: {
          currentValue: true,
          previousValue: undefined,
          firstChange: true,
          isFirstChange: () => true,
        },
      });
      expect(loadAvatarSpy).toHaveBeenCalled();
    });
  });

  describe('hasAvatar input', () => {
    it('should skip server request when hasAvatar is false', async () => {
      component.username = 'testuser';
      component.hasAvatar = false;
      await component.loadAvatar();

      expect(mockOfflineStorageService.getUserAvatarUrl).not.toHaveBeenCalled();
      expect(mockUserService.getUserAvatar).not.toHaveBeenCalled();
      expect(component['error']).toBe(true);
    });

    it('should try server request when hasAvatar is true', async () => {
      mockOfflineStorageService.getUserAvatarUrl.mockResolvedValue(null);
      component.username = 'testuser';
      component.hasAvatar = true;
      await component.loadAvatar();

      expect(mockUserService.getUserAvatar).toHaveBeenCalledWith('testuser');
    });

    it('should try server request when hasAvatar is undefined', async () => {
      mockOfflineStorageService.getUserAvatarUrl.mockResolvedValue(null);
      component.username = 'testuser';
      component.hasAvatar = undefined;
      await component.loadAvatar();

      expect(mockUserService.getUserAvatar).toHaveBeenCalledWith('testuser');
    });
  });
});
