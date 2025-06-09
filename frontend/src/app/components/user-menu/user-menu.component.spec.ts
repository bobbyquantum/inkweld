import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { UserDto } from '@inkweld/index';
import { UnifiedUserService } from '@services/unified-user.service';
import { of } from 'rxjs';

import { UserMenuComponent } from './user-menu.component';

describe('UserMenuComponent', () => {
  let component: UserMenuComponent;
  let fixture: ComponentFixture<UserMenuComponent>;
  let httpClientMock: vi.Mocked<HttpClient>;
  let routerMock: vi.Mocked<Router>;
  let userServiceMock: vi.Mocked<UnifiedUserService>;
  const activatedRouteMock = {
    params: of({ username: 'testuser' }),
  };

  const mockUser = {
    username: 'testuser',
    name: 'Test User',
  };

  beforeEach(async () => {
    httpClientMock = {
      get: vi.fn(),
      post: vi.fn().mockReturnValue(of({})),
      put: vi.fn(),
      delete: vi.fn(),
    } as unknown as vi.Mocked<HttpClient>;

    routerMock = {
      navigateByUrl: vi.fn().mockResolvedValue(true),
    } as unknown as vi.Mocked<Router>;

    userServiceMock = {
      logout: vi.fn().mockResolvedValue(undefined),
      getMode: vi.fn().mockReturnValue('offline'),
      currentUser: signal(mockUser),
    } as unknown as vi.Mocked<UnifiedUserService>;

    await TestBed.configureTestingModule({
      imports: [UserMenuComponent],
      providers: [
        { provide: HttpClient, useValue: httpClientMock },
        { provide: Router, useValue: routerMock },
        { provide: UnifiedUserService, useValue: userServiceMock },
        { provide: ActivatedRoute, useValue: activatedRouteMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('onLogout()', () => {
    it('should handle logout error', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      userServiceMock.logout.mockRejectedValue(new Error('Failed'));

      await component.onLogout();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Logout failed',
        expect.any(Error)
      );
    });
  });

  describe('onSettings()', () => {
    it('should log settings not implemented message', () => {
      const consoleSpy = vi.spyOn(console, 'log');
      component.onSettings();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Settings not yet implemented for unified service'
      );
    });
  });

  describe('user input', () => {
    it('should update when user input changes', () => {
      const mockUser: UserDto = {
        username: 'testuser',
        name: 'Test User',
      };

      component.user = mockUser;
      fixture.detectChanges();

      expect(component.user).toEqual(mockUser);
    });
  });
});
