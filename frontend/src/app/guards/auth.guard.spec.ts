import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { of, throwError } from 'rxjs';
import { UserAPIService } from 'worm-api-angular-client';

import { authGuard, resetAuthState } from './auth.guard';

describe('authGuard', () => {
  const mockRoute = {} as ActivatedRouteSnapshot;
  const mockState = {} as RouterStateSnapshot;

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  let router: Router;
  let userService: UserAPIService;
  let createUrlTreeSpy: jest.SpyInstance;
  let getCurrentUserSpy: jest.SpyInstance;
  let mockUrlTree: UrlTree;

  beforeEach(() => {
    resetAuthState();

    mockUrlTree = new UrlTree();
    router = {
      createUrlTree: jest.fn().mockReturnValue(mockUrlTree),
    } as unknown as Router;

    userService = {
      getCurrentUser: jest.fn(),
    } as unknown as UserAPIService;

    createUrlTreeSpy = jest.spyOn(router, 'createUrlTree');
    getCurrentUserSpy = jest.spyOn(userService, 'getCurrentUser');

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: UserAPIService, useValue: userService },
      ],
    });
  });

  afterEach(() => {
    resetAuthState();
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });

  it('should return true when getCurrentUser succeeds', async () => {
    const mockUser = { id: '1', username: 'test' };
    getCurrentUserSpy.mockReturnValue(of(mockUser));

    const result = await executeGuard(mockRoute, mockState);

    expect(result).toBe(true);
    expect(getCurrentUserSpy).toHaveBeenCalled();
  });

  it('should redirect to welcome page when getCurrentUser fails with non-502 error', async () => {
    const error = new HttpErrorResponse({ status: 401 });
    getCurrentUserSpy.mockReturnValue(throwError(() => error));

    const result = await executeGuard(mockRoute, mockState);

    expect(result).toBe(mockUrlTree);
    expect(createUrlTreeSpy).toHaveBeenCalledWith(['/welcome']);
  });

  it('should redirect to unavailable page on 502 error', async () => {
    const error = new HttpErrorResponse({ status: 502 });
    getCurrentUserSpy.mockReturnValue(throwError(() => error));

    const result = await executeGuard(mockRoute, mockState);

    expect(result).toBe(mockUrlTree);
    expect(createUrlTreeSpy).toHaveBeenCalledWith(['/unavailable']);
  });

  it('should use cached user if available', async () => {
    // First call to set up cache
    const mockUser = { id: '1', username: 'test' };
    getCurrentUserSpy.mockReturnValue(of(mockUser));
    await executeGuard(mockRoute, mockState);

    // Reset the spy to verify it's not called again
    getCurrentUserSpy.mockClear();

    // Second call should use cache
    const result = await executeGuard(mockRoute, mockState);

    expect(result).toBe(true);
    expect(getCurrentUserSpy).not.toHaveBeenCalled();
  });

  it('should redirect to welcome page when getCurrentUser returns null', async () => {
    getCurrentUserSpy.mockReturnValue(of(null));

    const result = await executeGuard(mockRoute, mockState);

    expect(result).toBe(mockUrlTree);
    expect(createUrlTreeSpy).toHaveBeenCalledWith(['/welcome']);
  });
});
