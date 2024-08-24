import {
  ApplicationConfig,
  Provider,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  Configuration,
  FileAPIService,
  ProjectAPIService,
  UserAPIService,
} from 'worm-api-client';
import { ThemeService } from '../themes/theme.service';
export function provideApiConfig(): Provider {
  return {
    provide: Configuration,
    useFactory: () =>
      new Configuration({
        basePath: 'http://localhost:8333',
      }),
    deps: [],
    multi: false,
  };
}
export function provideUserService(): Provider {
  return {
    provide: UserAPIService,
    useFactory: (httpClient: HttpClient, configuration: Configuration) => {
      return new UserAPIService(
        httpClient,
        'http://localhost:8333',
        configuration
      );
    },
    deps: [HttpClient, Configuration],
  };
}
export function provideProjectService(): Provider {
  return {
    provide: ProjectAPIService,
    useFactory: (httpClient: HttpClient, configuration: Configuration) => {
      return new ProjectAPIService(
        httpClient,
        'http://localhost:8333',
        configuration
      );
    },
    deps: [HttpClient, Configuration],
  };
}
export function provideContentService(): Provider {
  return {
    provide: FileAPIService,
    useFactory: (httpClient: HttpClient, configuration: Configuration) => {
      return new FileAPIService(
        httpClient,
        'http://localhost:8333',
        configuration
      );
    },
    deps: [HttpClient, Configuration],
  };
}
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
    provideApiConfig(),
    provideUserService(),
    provideProjectService(),
    ThemeService,
  ],
};
