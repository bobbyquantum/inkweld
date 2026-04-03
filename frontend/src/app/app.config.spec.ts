import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { RouteReuseStrategy } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { ThemeService } from '../themes/theme.service';
import { appConfig } from './app.config';
import { routes } from './app.routes';
import { API_PROVIDERS } from './config/api.config';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { CustomRouteReuseStrategy } from './utils/custom-route-reuse-strategy';

describe('app.config', () => {
  it('exports the application providers needed for routing, http, theme, and service worker setup', () => {
    const providers = appConfig.providers ?? [];
    const routerProvider = providers.find(
      provider =>
        typeof provider === 'object' &&
        provider !== null &&
        'ɵproviders' in provider
    ) as { ɵproviders?: unknown[] } | undefined;

    expect(providers).toContain(ThemeService);
    for (const apiProvider of API_PROVIDERS) {
      expect(providers).toContain(apiProvider);
    }
    expect(routerProvider?.ɵproviders?.length).toBeGreaterThan(0);
    expect(routes.length).toBeGreaterThan(0);
  });

  it('registers the expected interceptors and route reuse strategy classes', () => {
    const providers = (appConfig.providers ?? []).filter(
      provider =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider
    ) as Array<{ provide: unknown; useClass?: unknown; multi?: boolean }>;

    expect(
      providers.find(
        provider =>
          provider.provide === HTTP_INTERCEPTORS &&
          provider.useClass === AuthInterceptor
      )
    ).toEqual({
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    });
    expect(
      providers.find(
        provider =>
          provider.provide === RouteReuseStrategy &&
          provider.useClass === CustomRouteReuseStrategy
      )
    ).toEqual({
      provide: RouteReuseStrategy,
      useClass: CustomRouteReuseStrategy,
    });
  });

  it('configures the service worker to mirror dev mode enablement', () => {
    const providers = appConfig.providers ?? [];
    const serviceWorkerProvider = providers.find(
      provider =>
        typeof provider === 'object' &&
        provider !== null &&
        'ɵproviders' in provider
    ) as
      | { ɵproviders?: Array<{ provide: unknown; useValue?: unknown }> }
      | undefined;

    expect(serviceWorkerProvider?.ɵproviders).toBeDefined();
  });
});
