import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
  withNoXsrfProtection,
  withXhr,
} from '@angular/common/http';
import {
  type ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { isDevMode } from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  TitleStrategy,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { ThemeService } from '../themes/theme.service';
import { routes } from './app.routes';
import { API_PROVIDERS } from './config/api.config';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { InkweldTitleStrategy } from './services/core/title-strategy.service';
import { CustomRouteReuseStrategy } from './utils/custom-route-reuse-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideHttpClient(
      withXhr(),
      withNoXsrfProtection(),
      withInterceptorsFromDi()
    ),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true,
    },

    {
      provide: RouteReuseStrategy,
      useClass: CustomRouteReuseStrategy,
    },
    {
      provide: TitleStrategy,
      useClass: InkweldTitleStrategy,
    },
    ...API_PROVIDERS,
    ThemeService,
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerImmediately',
    }),
  ],
};
