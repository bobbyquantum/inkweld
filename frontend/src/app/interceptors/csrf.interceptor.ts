import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { from, Observable, switchMap, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { XsrfService } from '../services/auth/xsrf.service';

@Injectable()
export class CsrfInterceptor implements HttpInterceptor {
  private xsrfService = inject(XsrfService);
  private document = inject(DOCUMENT);
  private refreshingToken = false;
  private tokenRefreshPromise: Promise<string> | null = null;

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    // Skip CSRF for the token endpoint itself to avoid infinite loops
    if (request.url.includes('/csrf/token')) {
      return next.handle(request);
    }

    // Skip adding the token for safe methods or non-API requests
    if (
      request.method === 'GET' ||
      request.method === 'HEAD' ||
      request.method === 'OPTIONS' ||
      !request.url.startsWith(environment.apiUrl)
    ) {
      return next.handle(request);
    }

    // Try to get token from cookie first (double-submit cookie pattern)
    let token = this.getCookieValue('XSRF-TOKEN');

    // Fall back to stored token if cookie not found
    if (!token) {
      token = this.xsrfService.getXsrfToken();

      // If no token at all, try to fetch one before proceeding
      if (!token) {
        return from(this.getTokenSafely()).pipe(
          switchMap(newToken => {
            const tokenizedRequest = this.addTokenToRequest(request, newToken);
            return next.handle(tokenizedRequest);
          })
        );
      }
    }

    // Add token to request
    const tokenizedRequest = this.addTokenToRequest(request, token);

    // Handle the tokenized request
    return next.handle(tokenizedRequest).pipe(
      catchError((error: HttpErrorResponse) => {
        // If we get a 403 with CSRF error, refresh the token and retry
        if (
          error.status === 403 &&
          error.error &&
          typeof error.error === 'object'
        ) {
          const errorObj = error.error as { message?: string };
          const errorMessage = errorObj.message;
          if (
            errorMessage &&
            typeof errorMessage === 'string' &&
            (errorMessage.includes('csrf') ||
              errorMessage.includes('forbidden'))
          ) {
            console.warn('CSRF token validation failed, fetching new token');

            return from(this.getTokenSafely(true)).pipe(
              switchMap(newToken => {
                const updatedRequest = this.addTokenToRequest(
                  request,
                  newToken
                );
                return next.handle(updatedRequest);
              })
            );
          }
        }

        return throwError(() => error);
      })
    );
  }

  private addTokenToRequest(
    request: HttpRequest<unknown>,
    token: string
  ): HttpRequest<unknown> {
    return request.clone({
      setHeaders: {
        'X-CSRF-TOKEN': token,
      },
    });
  }

  /**
   * Gets the CSRF token, ensuring only one refresh happens at a time
   */
  private async getTokenSafely(forceRefresh = false): Promise<string> {
    // Use existing token if available and not forcing refresh
    const currentToken = this.xsrfService.getXsrfToken();
    if (currentToken && !forceRefresh) {
      return currentToken;
    }

    // If already refreshing, wait for that promise instead of creating a new request
    if (this.refreshingToken && this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    // Start new token refresh
    this.refreshingToken = true;
    this.tokenRefreshPromise = this.xsrfService.refreshToken().finally(() => {
      this.refreshingToken = false;
      this.tokenRefreshPromise = null;
    });

    return this.tokenRefreshPromise;
  }

  /**
   * Helper to get a cookie value by name
   */
  private getCookieValue(name: string): string {
    const value = `; ${this.document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || '';
    }
    return '';
  }
}
