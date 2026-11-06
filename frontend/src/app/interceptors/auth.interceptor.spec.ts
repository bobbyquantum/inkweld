import {
  HttpContext,
  HttpErrorResponse,
  type HttpEvent,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { DOCUMENT, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { type Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { translocoTestProvider } from '../../testing/transloco-test-provider';
import { AuthTokenService } from '../services/auth/auth-token.service';
import { PublicProjectContextService } from '../services/core/public-project-context.service';
import { StorageContextService } from '../services/core/storage-context.service';
import { AuthInterceptor, SKIP_AUTH_TOKEN } from './auth.interceptor';

/** A document served from `base`, like one with a `<base href>` */
function documentAt(base: string): Document {
  const doc = document.implementation.createHTMLDocument('test');
  const baseEl = doc.createElement('base');
  baseEl.setAttribute('href', base);
  doc.head.appendChild(baseEl);
  return doc;
}

describe('AuthInterceptor', () => {
  let interceptor: AuthInterceptor;
  let router: {
    url: string;
    navigate: ReturnType<typeof vi.fn>;
  };
  let storageContext: StorageContextService;
  let authTokenService: AuthTokenService;
  const originalApiUrl = environment.apiUrl;

  /** Configure the testing module; `doc` replaces the page's document */
  function setup(doc?: Document): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        AuthInterceptor,
        { provide: Router, useValue: router },
        ...(doc ? [{ provide: DOCUMENT, useValue: doc }] : []),
      ],
    });
    interceptor = TestBed.inject(AuthInterceptor);
    storageContext = TestBed.inject(StorageContextService);
    authTokenService = TestBed.inject(AuthTokenService);
  }

  /** Make a server profile active and signed in; returns its id */
  function signInTo(serverUrl: string, token = 'session-token'): string {
    const config = storageContext.addServerConfig(serverUrl);
    storageContext.switchToConfig(config.id);
    authTokenService.setToken(token);
    return config.id;
  }

  /** Pass a request through the interceptor; returns what was sent on */
  function send(
    request: HttpRequest<unknown>,
    response: Observable<HttpEvent<unknown>> = of(
      new HttpResponse({ status: 200 })
    )
  ): { sent: HttpRequest<unknown>; result: Observable<HttpEvent<unknown>> } {
    const handler = { handle: vi.fn().mockReturnValue(response) };
    const result = interceptor.intercept(request, handler);
    return {
      sent: handler.handle.mock.calls[0][0] as HttpRequest<unknown>,
      result,
    };
  }

  function authorizationSentTo(url: string): string | null {
    return send(new HttpRequest('GET', url)).sent.headers.get('Authorization');
  }

  /** Answer a request with a 401 and wait for the interceptor to react */
  async function rejectWith401(url: string): Promise<void> {
    const error = new HttpErrorResponse({ status: 401, url });
    const { result } = send(
      new HttpRequest('GET', url),
      throwError(() => error)
    );
    const received = await new Promise<unknown>(resolve => {
      result.subscribe({ error: (err: unknown) => resolve(err) });
    });
    await Promise.resolve();
    expect(received).toBe(error);
  }

  /** Origin of the page the tests run in */
  const pageOrigin = (): string => new URL(document.baseURI).origin;

  beforeEach(() => {
    localStorage.clear();
    router = { url: '/', navigate: vi.fn().mockResolvedValue(true) };
    setup();
  });

  afterEach(() => {
    environment.apiUrl = originalApiUrl;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(interceptor).toBeTruthy();
  });

  describe('attaching the session token', () => {
    it('adds it to absolute URLs on the active server', () => {
      signInTo('https://api.example.com');

      expect(
        authorizationSentTo('https://api.example.com/api/v1/users/me')
      ).toBe('Bearer session-token');
      expect(authorizationSentTo('https://API.example.com:443/api/v1/x')).toBe(
        'Bearer session-token'
      );
    });

    it('adds it to relative URLs when the server is the page origin', () => {
      signInTo(pageOrigin());

      expect(authorizationSentTo('/api/v1/users/me')).toBe(
        'Bearer session-token'
      );
      expect(authorizationSentTo('assets/i18n/en/common.json')).toBe(
        'Bearer session-token'
      );
    });

    it('leaves it off requests to other origins', () => {
      signInTo('https://home.example.com');

      // Adding a server: the username check goes to the new server
      expect(
        authorizationSentTo(
          'https://other-server.example/api/v1/users/check-username?username=alice'
        )
      ).toBeNull();
      expect(
        authorizationSentTo('http://home.example.com/api/v1/x')
      ).toBeNull();
      expect(
        authorizationSentTo('https://home.example.com:8443/api/v1/x')
      ).toBeNull();
      expect(
        authorizationSentTo('https://home.example.com.other.example/api/v1/x')
      ).toBeNull();
    });

    it('leaves it off relative URLs when the server is on another origin', () => {
      signInTo('https://api.example.com');

      expect(authorizationSentTo('/api/v1/users/me')).toBeNull();
      expect(authorizationSentTo('assets/i18n/en/common.json')).toBeNull();
    });

    it('keeps it inside the path prefix of a path-prefixed server', () => {
      signInTo('https://example.com/inkweld');

      expect(authorizationSentTo('https://example.com/inkweld/api/v1/x')).toBe(
        'Bearer session-token'
      );
      expect(authorizationSentTo('https://example.com/api/v1/x')).toBeNull();
      expect(
        authorizationSentTo('https://example.com/inkweld-b/api')
      ).toBeNull();
      expect(
        authorizationSentTo('https://example.com/inkweld/../other/api')
      ).toBeNull();
      // Encoded separators that a proxy decoding the path would follow
      expect(
        authorizationSentTo(
          'https://example.com/inkweld/api/v1/users/..%2F..%2F..%2F..%2Fother%2Fx/profile'
        )
      ).toBeNull();
    });

    it('adds it to relative URLs under a Home Assistant ingress prefix', () => {
      const ingress = 'https://ha.local:8123/api/hassio_ingress/abc123';
      setup(documentAt(`${ingress}/`));
      signInTo(ingress);

      expect(authorizationSentTo('api/v1/users/me')).toBe(
        'Bearer session-token'
      );
      expect(authorizationSentTo(`${ingress}/api/v1/users/me`)).toBe(
        'Bearer session-token'
      );
      // Root-absolute paths are the host's own API, outside the prefix
      expect(authorizationSentTo('/api/v1/users/me')).toBeNull();
      expect(
        authorizationSentTo('https://ha.local:8123/api/hassio_ingress/other/x')
      ).toBeNull();
    });

    it('treats an empty server URL as the page origin and base href', () => {
      // Docker / native binary builds: no apiUrl, the server serves the app
      environment.apiUrl = '';
      setup(documentAt('https://writers.example.com/inkweld/'));
      signInTo('');

      expect(authorizationSentTo('api/v1/users/me')).toBe(
        'Bearer session-token'
      );
      expect(
        authorizationSentTo('https://writers.example.com/inkweld/api/v1/x')
      ).toBe('Bearer session-token');
      expect(
        authorizationSentTo('https://writers.example.com/api/v1/x')
      ).toBeNull();
      expect(authorizationSentTo('https://other.example/api/v1/x')).toBeNull();
    });

    it('treats an empty server URL as the build apiUrl when there is one', () => {
      environment.apiUrl = 'https://api.example.com';
      signInTo('');

      expect(authorizationSentTo('https://api.example.com/api/v1/x')).toBe(
        'Bearer session-token'
      );
      expect(authorizationSentTo('/api/v1/x')).toBeNull();
    });

    it('never adds it for a Browser profile', () => {
      const local = storageContext.addLocalConfig({
        name: 'Writer',
        username: 'writer',
      });
      storageContext.switchToConfig(local.id);
      authTokenService.setToken('stale-token');

      expect(authorizationSentTo('/api/v1/users/me')).toBeNull();
      expect(authorizationSentTo(`${pageOrigin()}/api/v1/x`)).toBeNull();
    });

    it('leaves it off requests marked with SKIP_AUTH_TOKEN', () => {
      signInTo('https://api.example.com');
      const request = new HttpRequest(
        'GET',
        'https://api.example.com/api/v1/users/check-username?username=a',
        { context: new HttpContext().set(SKIP_AUTH_TOKEN, true) }
      );

      expect(send(request).sent.headers.get('Authorization')).toBeNull();
    });

    it('sends nothing when the active profile is signed out', () => {
      const config = storageContext.addServerConfig('https://api.example.com');
      storageContext.switchToConfig(config.id);

      expect(
        authorizationSentTo('https://api.example.com/api/v1/x')
      ).toBeNull();
    });

    it('passes successful responses through', () => {
      signInTo('https://api.example.com');
      const response = new HttpResponse({ status: 200 });
      const { result } = send(
        new HttpRequest('GET', 'https://api.example.com/api/v1/x'),
        of(response)
      );

      let received: unknown;
      result.subscribe(event => {
        received = event;
      });

      expect(received).toBe(response);
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('a 401 response', () => {
    it('signs out and goes home when it comes from the active server', async () => {
      router.url = '/projects';
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      signInTo('https://api.example.com');

      await rejectWith401('https://api.example.com/api/v1/users/me');

      expect(authTokenService.getToken()).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('stays on the home page when already there', async () => {
      router.url = '/';
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      signInTo('https://api.example.com');

      await rejectWith401('https://api.example.com/api/v1/users/me');

      expect(authTokenService.getToken()).toBeNull();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keeps the session when it comes from another server', async () => {
      router.url = '/projects';
      signInTo('https://home.example.com');

      await rejectWith401('https://other-server.example/api/v1/users/me');

      expect(authTokenService.getToken()).toBe('session-token');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keeps the session when it comes from outside the server prefix', async () => {
      router.url = '/projects';
      signInTo('https://example.com/inkweld');

      await rejectWith401('https://example.com/other/api/v1/users/me');

      expect(authTokenService.getToken()).toBe('session-token');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keeps the session of a profile switched to while it was in flight', async () => {
      router.url = '/projects';
      signInTo('https://home.example.com', 'home-token');
      const response = new Subject<HttpEvent<unknown>>();
      const { result } = send(
        new HttpRequest('GET', 'https://home.example.com/api/v1/users/me'),
        response
      );
      const failed = new Promise<void>(resolve => {
        result.subscribe({ error: () => resolve() });
      });

      // The user moves on to another server before the answer arrives
      const otherId = signInTo('https://other-server.example', 'other-token');
      response.error(new HttpErrorResponse({ status: 401 }));
      await failed;

      expect(storageContext.getActiveConfig()?.id).toBe(otherId);
      expect(authTokenService.getToken()).toBe('other-token');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keeps the session of another author switched to on the same server', async () => {
      router.url = '/projects';
      const aliceId = signInTo('https://ink.example.com', 'alice-token');
      storageContext.updateConfigUserProfile(aliceId, {
        name: 'Alice',
        username: 'alice',
      });
      const response = new Subject<HttpEvent<unknown>>();
      const { result } = send(
        new HttpRequest('GET', 'https://ink.example.com/api/v1/users/me'),
        response
      );
      const failed = new Promise<void>(resolve => {
        result.subscribe({ error: () => resolve() });
      });

      // Bob signs in on the same server before alice's answer arrives
      const { config: bob } = storageContext.adoptServerLogin({
        name: 'Bob',
        username: 'bob',
      });
      authTokenService.setToken('bob-token');
      response.error(new HttpErrorResponse({ status: 401 }));
      await failed;

      expect(bob.id).not.toBe(aliceId);
      expect(storageContext.getActiveConfig()?.id).toBe(bob.id);
      expect(authTokenService.getToken()).toBe('bob-token');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keeps a token that replaced the one the request carried', async () => {
      router.url = '/projects';
      signInTo('https://ink.example.com', 'expired-token');
      const response = new Subject<HttpEvent<unknown>>();
      const { sent, result } = send(
        new HttpRequest('GET', 'https://ink.example.com/api/v1/users/me'),
        response
      );
      const failed = new Promise<void>(resolve => {
        result.subscribe({ error: () => resolve() });
      });
      expect(sent.headers.get('Authorization')).toBe('Bearer expired-token');

      // The user signs in again before the answer arrives
      authTokenService.setToken('fresh-token');
      response.error(new HttpErrorResponse({ status: 401 }));
      await failed;

      expect(authTokenService.getToken()).toBe('fresh-token');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('still goes home when the request was sent while signed out', async () => {
      router.url = '/projects';
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = storageContext.addServerConfig('https://api.example.com');
      storageContext.switchToConfig(config.id);

      await rejectWith401('https://api.example.com/api/v1/users/me');

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('keeps the session when the request was sent without it', async () => {
      router.url = '/projects';
      signInTo('https://api.example.com');
      const error = new HttpErrorResponse({ status: 401 });
      const { result } = send(
        new HttpRequest('GET', 'https://api.example.com/api/v1/users/x', {
          context: new HttpContext().set(SKIP_AUTH_TOKEN, true),
        }),
        throwError(() => error)
      );
      await new Promise<void>(resolve => {
        result.subscribe({ error: () => resolve() });
      });

      expect(authTokenService.getToken()).toBe('session-token');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('does nothing for a Browser profile', async () => {
      router.url = '/projects';
      const local = storageContext.addLocalConfig({
        name: 'Writer',
        username: 'writer',
      });
      storageContext.switchToConfig(local.id);

      await rejectWith401('/api/v1/users/me');

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('is left to the login and register endpoints', async () => {
      router.url = '/projects';
      signInTo('https://api.example.com');

      await rejectWith401('https://api.example.com/api/v1/auth/login');
      await rejectWith401('https://api.example.com/api/v1/auth/register');

      expect(authTokenService.getToken()).toBe('session-token');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('handles a failed navigation gracefully', async () => {
      router.url = '/projects';
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      router.navigate.mockRejectedValue(new Error('Navigation failed'));
      signInTo('https://api.example.com');

      await rejectWith401('https://api.example.com/api/v1/users/me');
      await Promise.resolve();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to navigate to home page:',
        expect.any(Error)
      );
    });
  });

  it('rethrows other errors without signing out', async () => {
    router.url = '/projects';
    signInTo('https://api.example.com');
    const error = new HttpErrorResponse({ status: 500 });
    const { result } = send(
      new HttpRequest('GET', 'https://api.example.com/api/v1/x'),
      throwError(() => error)
    );

    const received = await new Promise<unknown>(resolve => {
      result.subscribe({ error: (err: unknown) => resolve(err) });
    });

    expect(received).toBe(error);
    expect(authTokenService.getToken()).toBe('session-token');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  describe('public project browsing', () => {
    beforeEach(() => {
      vi.spyOn(
        TestBed.inject(PublicProjectContextService),
        'active'
      ).mockReturnValue(true);
    });

    it('strips a saved session and marks the request as a public read', () => {
      signInTo(pageOrigin());
      const request = new HttpRequest('GET', '/api/test').clone({
        setHeaders: { Authorization: 'Bearer saved-session' },
      });

      const { sent } = send(request);

      expect(sent.headers.has('Authorization')).toBe(false);
      expect(sent.headers.get('X-Inkweld-Public-View')).toBe('true');
    });

    it('keeps the saved session and does not redirect after a public 401', async () => {
      signInTo(pageOrigin());
      router.url = '/public/alice/novel';

      await rejectWith401('/api/v1/projects/alice/novel');

      expect(authTokenService.getToken()).toBe('session-token');
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
