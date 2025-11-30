import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { SetupService } from '../services/core/setup.service';

/**
 * AuthInterceptor handles authentication concerns:
 * - Adds Authorization header to requests if token exists
 * - Redirects to login on 401 errors (session expired/invalid)
 *
 * Note: This interceptor does NOT handle caching/offline scenarios.
 * Individual services should handle network errors (status 0, 502, 503, 504)
 * by falling back to cached data when appropriate.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private router = inject(Router);
  private setupService = inject(SetupService);

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    // Add Authorization header if token exists
    const token = localStorage.getItem('auth_token');
    if (token) {
      request = request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        // Only handle 401 errors in server mode
        // 401 means the session is invalid - user MUST re-authenticate
        // Do not fall back to cache for auth errors
        if (error.status === 401 && this.setupService.getMode() === 'server') {
          console.warn('Session expired or invalid, redirecting to login');

          // Clear invalid token
          localStorage.removeItem('auth_token');

          // Don't redirect if we're already on the welcome/login page
          const currentUrl = this.router.url;
          if (
            !currentUrl.startsWith('/welcome') &&
            !currentUrl.startsWith('/register') &&
            currentUrl !== '/'
          ) {
            // Navigate to welcome page
            this.router.navigate(['/welcome']).catch(navError => {
              console.error('Failed to navigate to welcome page:', navError);
            });
          }
        }

        // Always rethrow the error so individual services can still handle it
        // Services should check error.status and decide whether to use cache
        return throwError(() => error);
      })
    );
  }
}
