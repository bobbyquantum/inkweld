import { provideZonelessChangeDetection, SimpleChange } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  let component: UserAvatarComponent;
  let fixture: ComponentFixture<UserAvatarComponent>;
  let mockUserService: {
    getMode: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockUserService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    await TestBed.configureTestingModule({
      imports: [UserAvatarComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UnifiedUserService, useValue: mockUserService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserAvatarComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default size of medium', () => {
    expect(component.size).toBe('medium');
  });

  describe('loadAvatar', () => {
    it('should return early if no username', () => {
      component.username = '';

      component.loadAvatar();

      expect(component['isLoading']).toBeFalsy();
    });

    it('should skip loading and show default avatar in offline mode', () => {
      mockUserService.getMode.mockReturnValue('offline');
      component.username = 'testuser';

      component.loadAvatar();

      expect(component['error']).toBe(true);
      expect(component['isLoading']).toBe(false);
    });

    it('should attempt to load avatar in server mode', () => {
      mockUserService.getMode.mockReturnValue('server');
      component.username = 'testuser';

      component.loadAvatar();

      // Currently shows default avatar since service doesn't implement getUserAvatar
      expect(component['error']).toBe(true);
      expect(component['isLoading']).toBe(false);
    });
  });

  describe('ngOnInit', () => {
    it('should call loadAvatar on init', () => {
      const loadAvatarSpy = vi.spyOn(component, 'loadAvatar');
      component.username = 'testuser';

      component.ngOnInit();

      expect(loadAvatarSpy).toHaveBeenCalled();
    });
  });

  describe('ngOnChanges', () => {
    it('should reload avatar when username changes', () => {
      const loadAvatarSpy = vi.spyOn(component, 'loadAvatar');
      component.username = 'newuser';

      component.ngOnChanges({
        username: new SimpleChange('olduser', 'newuser', false),
      });

      expect(loadAvatarSpy).toHaveBeenCalled();
    });

    it('should not reload avatar if username did not change', () => {
      const loadAvatarSpy = vi.spyOn(component, 'loadAvatar');

      component.ngOnChanges({
        size: new SimpleChange('small', 'medium', false),
      });

      expect(loadAvatarSpy).not.toHaveBeenCalled();
    });
  });
});
