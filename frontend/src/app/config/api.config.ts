import { HttpClient } from '@angular/common/http';
import { Provider } from '@angular/core';
import { Configuration, ProjectAPIService, UserAPIService } from '@worm/index';

export function provideApiConfig(): Provider {
  return {
    provide: Configuration,
    useFactory: () => new Configuration({ basePath: '' }),
    deps: [],
    multi: false,
  };
}

// Generic factory function for creating API service providers
function createApiServiceProvider<T>(
  serviceClass: new (
    http: HttpClient,
    basePath: string,
    config: Configuration
  ) => T
): Provider {
  return {
    provide: serviceClass,
    useFactory: (httpClient: HttpClient, configuration: Configuration) => {
      return new serviceClass(httpClient, '', configuration);
    },
    deps: [HttpClient, Configuration],
  };
}

// All API service providers
export const API_PROVIDERS: Provider[] = [
  provideApiConfig(),
  createApiServiceProvider(UserAPIService),
  createApiServiceProvider(ProjectAPIService),
  createApiServiceProvider(ProjectAPIService),
];
