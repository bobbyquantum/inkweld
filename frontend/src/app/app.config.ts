import { registerLocaleData } from '@angular/common';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
  withNoXsrfProtection,
  withXhr,
} from '@angular/common/http';
import localeEn from '@angular/common/locales/en';
import {
  type ApplicationConfig,
  inject,
  isDevMode,
  LOCALE_ID,
  provideAppInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  TitleStrategy,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideTransloco } from '@jsverse/transloco';
import { CustomRouteReuseStrategy } from '@utils/custom-route-reuse-strategy';

import { ThemeService } from '../themes/theme.service';
import { routes } from './app.routes';
import { API_PROVIDERS } from './config/api.config';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { InkweldTitleStrategy } from './services/core/title-strategy.service';
import { DocumentStorageMigrationService } from './services/local/document-storage-migration.service';
import { TranslocoHttpLoader } from './transloco-loader';

registerLocaleData(localeEn);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Move prose and worldbuilding docs to profile-scoped IndexedDB names before the
    // router can open one. Never rejects, so it cannot block startup.
    provideAppInitializer(async () => {
      await inject(DocumentStorageMigrationService).migrateIfNeeded();
    }),
    provideRouter(routes),
    provideHttpClient(
      withXhr(),
      withNoXsrfProtection(),
      withInterceptorsFromDi()
    ),
    provideTransloco({
      config: {
        availableLangs: [{ id: 'en', label: 'English' }],
        defaultLang: 'en',
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: {
          logMissingKey: isDevMode(),
          useFallbackTranslation: true,
          allowEmpty: false,
        },
        scopes: {
          autoPrefixKeys: false,
        },
      },
      loader: TranslocoHttpLoader,
    }),
    { provide: LOCALE_ID, useValue: 'en' },
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
