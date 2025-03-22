import { HttpClient } from '@angular/common/http';
import { Provider } from '@angular/core';
import {
  AuthService,
  Configuration,
  CSRFService,
  DocumentAPIService,
  ProjectAPIService,
  ProjectFilesService,
  UserAPIService,
} from '@inkweld/index';

import { environment } from '../../environments/environment';

export function provideApiConfig(): Provider {
  return {
    provide: Configuration,
    useFactory: () =>
      new Configuration({
        basePath: environment.apiUrl,
        withCredentials: true,
      }),
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
      return new serviceClass(httpClient, environment.apiUrl, configuration);
    },
    deps: [HttpClient, Configuration],
  };
}

// All API service providers
export const API_PROVIDERS: Provider[] = [
  provideApiConfig(),
  createApiServiceProvider(UserAPIService),
  createApiServiceProvider(ProjectAPIService),
  createApiServiceProvider(DocumentAPIService),
  createApiServiceProvider(ProjectFilesService),
  createApiServiceProvider(AuthService),
  createApiServiceProvider(CSRFService),
];
