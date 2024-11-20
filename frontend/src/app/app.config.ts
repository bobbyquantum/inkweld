import {
  HttpClient,
  provideHttpClient,
  withXsrfConfiguration,
} from '@angular/common/http';
import {
  ApplicationConfig,
  Provider,
  provideZoneChangeDetection,
} from '@angular/core';
import { isDevMode } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { XsrfService } from '@services/xsrf.service';
import {
  Configuration,
  FileAPIService,
  ProjectAPIService,
  UserAPIService,
} from 'worm-api-client';

import { ThemeService } from '../themes/theme.service';
import { routes } from './app.routes';

export function provideApiConfig(): Provider {
  return {
    provide: Configuration,
    useFactory: () =>
      new Configuration({
        basePath: '',
      }),
    deps: [],
    multi: false,
  };
}
export function provideUserService(): Provider {
  return {
    provide: UserAPIService,
    useFactory: (httpClient: HttpClient, configuration: Configuration) => {
      return new UserAPIService(httpClient, '', configuration);
    },
    deps: [HttpClient, Configuration],
  };
}
export function provideProjectService(): Provider {
  return {
    provide: ProjectAPIService,
    useFactory: (httpClient: HttpClient, configuration: Configuration) => {
      return new ProjectAPIService(httpClient, '', configuration);
    },
    deps: [HttpClient, Configuration],
  };
}
export function provideContentService(): Provider {
  return {
    provide: FileAPIService,
    useFactory: (httpClient: HttpClient, configuration: Configuration) => {
      return new FileAPIService(httpClient, '', configuration);
    },
    deps: [HttpClient, Configuration],
  };
}
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(
      withXsrfConfiguration({
        cookieName: 'XSRF-TOKEN',
        headerName: 'X-XSRF-TOKEN',
      })
    ),
    provideApiConfig(),
    provideUserService(),
    provideProjectService(),
    ThemeService,
    XsrfService,
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
export { XsrfService };
