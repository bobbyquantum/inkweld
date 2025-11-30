import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthTokenService } from '../services/auth/auth-token.service';

/**
 * HTTP interceptor that adds JWT Bearer token to requests
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  const authTokenService = inject(AuthTokenService);
  const token = authTokenService.getToken();

  // Skip adding token for auth endpoints (login/register)
  if (req.url.includes('/auth/login') || req.url.includes('/auth/register')) {
    return next(req);
  }

  // If token exists, clone request and add Authorization header
  if (token) {
    const clonedRequest = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    });
    return next(clonedRequest);
  }

  return next(req);
};
