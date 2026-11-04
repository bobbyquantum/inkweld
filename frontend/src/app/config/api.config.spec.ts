import { type HttpClient } from '@angular/common/http';
import {
  AuthenticationService,
  Configuration,
  DocumentsService,
  type Param,
  ProjectsService,
  UsersService,
} from '@inkweld/index';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { SetupService } from '../services/core/setup.service';
import {
  API_PROVIDERS,
  encodeApiPathParam,
  provideApiConfig,
} from './api.config';

/** A path parameter as the generated client describes one. */
function pathParam(value: unknown, dataFormat?: string): Param {
  return {
    name: 'id',
    value,
    in: 'path',
    style: 'simple',
    explode: false,
    dataType: 'string',
    dataFormat,
  };
}

describe('api.config', () => {
  describe('encodeApiPathParam', () => {
    it('percent-encodes a path parameter', () => {
      expect(encodeApiPathParam(pathParam('alice'))).toBe('alice');
      expect(encodeApiPathParam(pathParam('a/b?c#d'))).toBe('a%2Fb%3Fc%23d');
      expect(encodeApiPathParam(pathParam(42))).toBe('42');
    });

    it('writes a date-time parameter as an ISO string', () => {
      const date = new Date('2026-01-02T03:04:05.000Z');
      expect(encodeApiPathParam(pathParam(date, 'date-time'))).toBe(
        encodeURIComponent('2026-01-02T03:04:05.000Z')
      );
    });

    // Each row is wrapped, since it.each spreads array rows into arguments.
    it.each([['.'], ['..'], [['..']]])(
      'refuses the dot segment %j',
      (value: unknown) => {
        expect(() => encodeApiPathParam(pathParam(value))).toThrow();
      }
    );
  });

  it('keeps every generated-client path parameter in one segment', () => {
    const setupService = {
      getServerUrl: vi.fn().mockReturnValue('https://example.test'),
    } as unknown as SetupService;
    const provider = provideApiConfig() as unknown as {
      useFactory: (service: SetupService) => Configuration;
    };
    const http = { request: vi.fn().mockReturnValue(of(new Blob())) };
    const users = new UsersService(
      http as unknown as HttpClient,
      'https://example.test',
      provider.useFactory(setupService)
    );

    expect(() => users.getUserAvatar('..')).toThrow();
    expect(() => users.getUserAvatar('.')).toThrow();
    expect(http.request).not.toHaveBeenCalled();

    users.getUserAvatar('a b').subscribe();
    expect(http.request).toHaveBeenCalledWith(
      'get',
      'https://example.test/api/v1/users/a%20b/avatar',
      expect.anything()
    );
  });

  it('creates a dynamic configuration that trims trailing slashes and falls back to the environment url', () => {
    const setupService = {
      getServerUrl: vi.fn().mockReturnValue('https://example.test///'),
    } as unknown as SetupService;
    const provider = provideApiConfig() as unknown as {
      useFactory: (service: SetupService) => Configuration;
    };

    const configuration = provider.useFactory(setupService);

    expect(configuration.basePath).toBe('https://example.test');

    configuration.basePath = 'https://ignored.test';
    expect(configuration.basePath).toBe('https://example.test');

    setupService.getServerUrl = vi.fn().mockReturnValue('');
    expect(configuration.basePath).toBe(environment.apiUrl.replace(/\/+$/, ''));
  });

  it('exposes providers for the configuration and generated API services', () => {
    const httpClient = {} as HttpClient;
    const configuration = new Configuration({
      basePath: 'https://api.example.test',
      withCredentials: false,
    });

    const serviceProviders = API_PROVIDERS.slice(1) as Array<{
      provide: new (...args: never[]) => unknown;
      useFactory: (http: HttpClient, config: Configuration) => unknown;
    }>;

    expect(API_PROVIDERS).toHaveLength(5);
    expect(API_PROVIDERS[0]).toMatchObject({
      provide: Configuration,
      deps: [SetupService],
      multi: false,
    });

    const expectedServices = [
      UsersService,
      ProjectsService,
      DocumentsService,
      AuthenticationService,
    ];

    expect(serviceProviders.map(provider => provider.provide)).toEqual(
      expectedServices
    );

    for (const provider of serviceProviders) {
      const instance = provider.useFactory(httpClient, configuration);
      expect(instance).toBeInstanceOf(provider.provide);
    }
  });
});
