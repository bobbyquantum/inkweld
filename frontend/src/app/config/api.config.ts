import { HttpClient } from '@angular/common/http';
import { Provider } from '@angular/core';
import {
  AuthenticationService,
  Configuration,
  DocumentsService,
  ProjectsService,
  SecurityService,
  UsersService,
} from '@inkweld/index';

import { environment } from '../../environments/environment';
import { SetupService } from '../services/core/setup.service';

/**
 * Creates a dynamic Configuration that reads basePath from SetupService
 * This allows the API base path to change at runtime based on user configuration
 */
function createDynamicConfiguration(setupService: SetupService): Configuration {
  const config = new Configuration({
    basePath: environment.apiUrl, // Initial value
    withCredentials: false, // Using Bearer tokens, not cookies
  });

  // Replace the basePath property with a dynamic getter
  Object.defineProperty(config, 'basePath', {
    get: function () {
      // Always read dynamically from SetupService on every access
      const serverUrl = setupService.getServerUrl();
      const result = serverUrl || environment.apiUrl;
      console.log('[Dynamic API Config] Using basePath:', result);
      return result;
    },
    set: function (value: string) {
      // Ignore setter - we always use the getter
      console.log(
        '[Dynamic API Config] Attempted to set basePath to:',
        value,
        '(ignored)'
      );
    },
    enumerable: true,
    configurable: true,
  });

  return config;
}

export function provideApiConfig(): Provider {
  return {
    provide: Configuration,
    useFactory: (setupService: SetupService) =>
      createDynamicConfiguration(setupService),
    deps: [SetupService],
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
      // Use configuration.basePath which now reads dynamically from SetupService
      return new serviceClass(
        httpClient,
        configuration.basePath || environment.apiUrl,
        configuration
      );
    },
    deps: [HttpClient, Configuration],
  };
}

// All API service providers
export const API_PROVIDERS: Provider[] = [
  provideApiConfig(),
  createApiServiceProvider(UsersService),
  createApiServiceProvider(ProjectsService),
  createApiServiceProvider(DocumentsService),
  createApiServiceProvider(AuthenticationService),
  createApiServiceProvider(SecurityService),
];
