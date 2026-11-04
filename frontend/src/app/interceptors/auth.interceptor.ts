import {
  HttpContextToken,
  type HttpErrorResponse,
  type HttpEvent,
  type HttpHandler,
  type HttpInterceptor,
  type HttpRequest,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { type Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthTokenService } from '../services/auth/auth-token.service';
import { StorageContextService } from '../services/core/storage-context.service';

/**
 * Set to true on a request that must go out without the session token even
 * when it is addressed to the active profile's server, such as a public
 * check made on behalf of a server the user is only about to sign in to.
 */
export const SKIP_AUTH_TOKEN = new HttpContextToken<boolean>(() => false);

/**
 * AuthInterceptor handles authentication concerns:
 * - Adds the Authorization header to requests for the active profile's
 *   server (same origin and, for a server under a path prefix, a path inside
 *   it). Requests anywhere else go out without it.
 * - Redirects to login on a 401 from that server (session expired/invalid),
 *   as long as the session the request carried is still the active one
 *
 * Note: This interceptor does NOT handle caching/offline scenarios.
 * Individual services should handle network errors (status 0, 502, 503, 504)
 * by falling back to cached data when appropriate.
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly router = inject(Router);
  private readonly authTokenService = inject(AuthTokenService);
  private readonly storageContext = inject(StorageContextService);

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    // The session stored for the active profile only goes to that profile's
    // server. Another server being added, the home server's public config or
    // a file on another origin is contacted without it.
    const forActiveServer =
      !request.context.get(SKIP_AUTH_TOKEN) &&
      this.authTokenService.isActiveServerUrl(request.url);
    // The session this request carries: the profile it was sent for and the
    // token it was sent with (none when signed out)
    const configId = this.storageContext.getActiveConfig()?.id;
    const token = forActiveServer ? this.authTokenService.getToken() : null;
    const outgoing = token
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

    return next.handle(outgoing).pipe(
      catchError((error: HttpErrorResponse) => {
        // 401 means the session is invalid - user MUST re-authenticate.
        // Do not fall back to cache for auth errors. Only a 401 from the
        // server the session belongs to says so, and only about the session
        // the request carried: the profile can change, or the user can sign
        // in again, while a request is out.
        if (
          error.status === 401 &&
          forActiveServer &&
          this.isCurrentSession(configId, token)
        ) {
          this.handleRejectedSession(request.url);
        }

        // Always rethrow the error so individual services can still handle it
        // Services should check error.status and decide whether to use cache
        return throwError(() => error);
      })
    );
  }

  /**
   * True while the profile a request was sent for is still active and still
   * holds the token the request carried. A profile never changes server, so
   * this is also the server the request went to.
   */
  private isCurrentSession(
    configId: string | undefined,
    token: string | null
  ): boolean {
    return (
      this.storageContext.getActiveConfig()?.id === configId &&
      this.authTokenService.getToken() === token
    );
  }

  /** Drop the active session and send the user to sign in again */
  private handleRejectedSession(url: string): void {
    // Don't redirect on auth endpoints - let login/register handle their own 401s
    if (url.includes('/auth/login') || url.includes('/auth/register')) return;

    console.warn('Session expired or invalid, redirecting to login');

    // Clear invalid token (using prefixed storage key)
    this.authTokenService.clearToken();

    // Don't redirect if we're already on the home page
    if (this.router.url !== '/') {
      // Navigate to home page (which shows login dialog for unauthenticated users)
      this.router.navigate(['/']).catch(navError => {
        console.error('Failed to navigate to home page:', navError);
      });
    }
  }
}
