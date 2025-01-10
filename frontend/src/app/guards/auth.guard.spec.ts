import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { UserAPIService } from '@worm/index';
import { throwError } from 'rxjs';

import { userServiceMock } from '../../testing/user-api.mock';
import { authGuard, resetAuthState } from './auth.guard';

describe('authGuard', () => {
  const mockRoute = {} as ActivatedRouteSnapshot;
  const mockState = {} as RouterStateSnapshot;

  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  let router: Router;
  let createUrlTreeSpy: jest.SpyInstance;
  let mockUrlTree: UrlTree;

  beforeEach(() => {
    resetAuthState();

    mockUrlTree = new UrlTree();
    router = {
      createUrlTree: jest.fn().mockReturnValue(mockUrlTree),
    } as unknown as Router;

    createUrlTreeSpy = jest.spyOn(router, 'createUrlTree');

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: UserAPIService, useValue: userServiceMock },
      ],
    });
  });

  afterEach(() => {
    resetAuthState();
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });

  it('should redirect to welcome page when getCurrentUser fails with non-502 error', async () => {
    const error = new HttpErrorResponse({ status: 401 });
    userServiceMock.userControllerGetMe.mockReturnValue(
      throwError(() => error)
    );

    const result = await executeGuard(mockRoute, mockState);

    expect(result).toBe(mockUrlTree);
    expect(createUrlTreeSpy).toHaveBeenCalledWith(['/welcome']);
  });
});
