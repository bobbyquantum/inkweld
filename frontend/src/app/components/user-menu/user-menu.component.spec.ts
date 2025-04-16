import { HttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { UserDto } from '@inkweld/index';
import { UserService } from '@services/user.service';
import { of, throwError } from 'rxjs';

import { UserMenuComponent } from './user-menu.component';

describe('UserMenuComponent', () => {
  let component: UserMenuComponent;
  let fixture: ComponentFixture<UserMenuComponent>;
  let httpClientMock: jest.Mocked<HttpClient>;
  let routerMock: jest.Mocked<Router>;
  let userServiceMock: jest.Mocked<UserService>;
  const activatedRouteMock = {
    params: of({ username: 'testuser' }),
  };

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
      getUserAvatar: jest.fn().mockReturnValue(of('')),
      currentUser: jest.fn().mockReturnValue(
        of({
          username: 'testuser',
          name: 'Test User',
        })
      ),
    } as unknown as jest.Mocked<UserService>;

    await TestBed.configureTestingModule({
      imports: [UserMenuComponent],
      providers: [
        { provide: HttpClient, useValue: httpClientMock },
        { provide: Router, useValue: routerMock },
        { provide: UserService, useValue: userServiceMock },
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
    it('should handle logout error', () => {
      const consoleSpy = jest.spyOn(console, 'error');
      httpClientMock.post.mockReturnValue(
        throwError(() => new Error('Failed'))
      );

      void component.onLogout();

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
      };

      component.user = mockUser;
      fixture.detectChanges();

      expect(component.user).toEqual(mockUser);
    });
  });
});
