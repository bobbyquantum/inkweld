import { type HttpClient } from '@angular/common/http';
import {
  AuthenticationService,
  Configuration,
  DocumentsService,
  ProjectsService,
  UsersService,
} from '@inkweld/index';
import { describe, expect, it, vi } from 'vitest';

import { environment } from '../../environments/environment';
import { SetupService } from '../services/core/setup.service';
import { API_PROVIDERS, provideApiConfig } from './api.config';

describe('api.config', () => {
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
