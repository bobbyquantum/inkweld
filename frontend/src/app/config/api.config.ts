import { HttpClient } from '@angular/common/http';
import { type Provider } from '@angular/core';
import {
  AuthenticationService,
  Configuration,
  DocumentsService,
  type Param,
  ProjectsService,
  UsersService,
} from '@inkweld/index';
import { stripTrailingSlashes } from '@utils/string-utils';
import { encodePathSegment } from '@utils/url-path';

import { environment } from '../../environments/environment';
import { SetupService } from '../services/core/setup.service';

/**
 * Encode a path parameter of the generated API client the way hand-built
 * paths encode a segment ({@link encodePathSegment}): percent-encoded, with
 * `.` and `..` refused, so a parameter always stays one segment. The client
 * calls this for path parameters only. Dates are written as the generated
 * default writes them.
 */
export function encodeApiPathParam(param: Param): string {
  const value =
    param.dataFormat === 'date-time' && param.value instanceof Date
      ? param.value.toISOString()
      : String(param.value);
  return encodePathSegment(value);
}

/**
 * Creates a dynamic Configuration that reads basePath from SetupService
 * This allows the API base path to change at runtime based on user configuration
 */
function createDynamicConfiguration(setupService: SetupService): Configuration {
  const config = new Configuration({
    basePath: environment.apiUrl, // Initial value
    withCredentials: false, // Using Bearer tokens, not cookies
    encodeParam: encodeApiPathParam,
  });

  // Replace the basePath property with a dynamic getter
  Object.defineProperty(config, 'basePath', {
    get: function () {
      // Always read dynamically from SetupService on every access
      const serverUrl = setupService.getServerUrl();
      const result = serverUrl || environment.apiUrl;
      // Strip trailing slashes to prevent double-slash URLs (e.g., "https://example.com//api/v1/...")
      return stripTrailingSlashes(result);
    },
    set: function (_value: string) {
      // Ignore setter - we always use the getter
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
];
