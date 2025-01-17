import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { UserService } from '@services/user.service';
import { UserDto } from '@worm/index';
import { of, throwError } from 'rxjs';

import { UserMenuComponent } from './user-menu.component';

describe('UserMenuComponent', () => {
  let component: UserMenuComponent;
  let fixture: ComponentFixture<UserMenuComponent>;
  let httpClientMock: jest.Mocked<HttpClient>;
  let routerMock: jest.Mocked<Router>;
  let userServiceMock: jest.Mocked<UserService>;

  beforeEach(async () => {
    httpClientMock = {
      get: jest.fn(),
      post: jest.fn().mockReturnValue(of({})),
      put: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    routerMock = {
      navigateByUrl: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Router>;

    userServiceMock = {
      openSettingsDialog: jest.fn().mockReturnValue(of(true)),
      currentUser: jest.fn().mockReturnValue(
        of({
          username: 'testuser',
          name: 'Test User',
          avatarImageUrl: 'https://example.com/avatar.png',
        })
      ),
    } as unknown as jest.Mocked<UserService>;

    await TestBed.configureTestingModule({
      imports: [UserMenuComponent],
      providers: [
        { provide: HttpClient, useValue: httpClientMock },
        { provide: Router, useValue: routerMock },
        { provide: UserService, useValue: userServiceMock },
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
    it('should navigate to redirectUrl when provided', () => {
      const mockResponse = { redirectUrl: '/login' };
      httpClientMock.post.mockReturnValue(of(mockResponse));

      component.onLogout();

      expect(httpClientMock.post).toHaveBeenCalledWith(
        '/logout',
        {},
        { withCredentials: true }
      );
      expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/login');
    });

    it('should navigate to welcome when no redirectUrl', () => {
      const mockResponse = { message: 'Logged out' };
      httpClientMock.post.mockReturnValue(of(mockResponse));

      component.onLogout();

      expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/welcome');
    });

    it('should handle logout error', () => {
      const consoleSpy = jest.spyOn(console, 'error');
      httpClientMock.post.mockReturnValue(
        throwError(() => new Error('Failed'))
      );

      component.onLogout();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Logout failed',
        expect.any(Error)
      );
    });
  });

  describe('onSettings()', () => {
    it('should open settings dialog', () => {
      component.onSettings();
      expect(userServiceMock.openSettingsDialog).toHaveBeenCalled();
    });
  });

  describe('user input', () => {
    it('should update when user input changes', () => {
      const mockUser: UserDto = {
        username: 'testuser',
        name: 'Test User',
        avatarImageUrl: 'https://example.com/avatar.png',
      };

      component.user = mockUser;
      fixture.detectChanges();

      expect(component.user).toEqual(mockUser);
    });
  });
});
