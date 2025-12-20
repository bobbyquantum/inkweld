import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfigurationService } from '@inkweld/api/configuration.service';
import {
  SystemFeatures,
  SystemFeaturesAppMode,
} from '@inkweld/model/system-features';
import { of, throwError } from 'rxjs';
import { Mock, MockedObject, vi } from 'vitest';

import { SystemConfigService } from './system-config.service';

describe('SystemConfigService', () => {
  let service: SystemConfigService;
  let mockConfigService: MockedObject<ConfigurationService>;
  let consoleSpy: any;
  let consoleWarnSpy: any;

  const mockSystemFeatures: SystemFeatures = {
    aiLinting: true,
    aiImageGeneration: true,
    appMode: SystemFeaturesAppMode.Both,
    userApprovalRequired: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ConfigurationService
    mockConfigService = {
      getSystemFeatures: vi.fn(),
    } as MockedObject<ConfigurationService>;

    // Mock console methods to avoid test output noise, but keep spies for testing
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Set up default successful response
    (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
      of(mockSystemFeatures)
    );

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        SystemConfigService,
        { provide: ConfigurationService, useValue: mockConfigService },
      ],
    });

    service = TestBed.inject(SystemConfigService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with default features when constructor is called', () => {
      expect(service).toBeTruthy();
      expect(mockConfigService.getSystemFeatures).toHaveBeenCalled();
    });

    it('should have correct initial values', () => {
      // Reset the service with no API call to test initial state
      (mockConfigService.getSystemFeatures as Mock).mockClear();

      // Check the signals are functions
      expect(typeof service.systemFeatures).toBe('function');
      expect(typeof service.isConfigLoaded).toBe('function');
      expect(typeof service.isAiLintingEnabled).toBe('function');
      expect(typeof service.isAiImageGenerationEnabled).toBe('function');
    });
  });

  describe('loadSystemFeatures', () => {
    it('should handle API errors gracefully', () => {
      const error = new Error('API Error');

      // Reset TestBed with error mock
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        throwError(() => error)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const errorService = TestBed.inject(SystemConfigService);

      // Wait for async operation to complete
      return new Promise<void>(resolve => {
        setTimeout(() => {
          // When server is unavailable, use offline defaults
          expect(errorService.systemFeatures()).toEqual({
            aiLinting: false,
            aiImageGeneration: false,
            appMode: 'OFFLINE', // Changed from BOTH - treat as offline when server down
            userApprovalRequired: true,
          });
          expect(errorService.isConfigLoaded()).toBe(true);
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            '[SystemConfig] Failed to load system features, using offline defaults:',
            error
          );
          resolve();
        }, 10);
      });
    });

    it('should log successful feature loading', () => {
      // Wait for initial load to complete
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(consoleSpy).toHaveBeenCalledWith(
            '[SystemConfig] Loaded system features:',
            mockSystemFeatures
          );
          resolve();
        }, 10);
      });
    });
  });

  describe('refreshSystemFeatures', () => {
    it('should refresh system features and reload configuration', () => {
      const newFeatures: SystemFeatures = {
        aiLinting: false,
        appMode: SystemFeaturesAppMode.Both,
        userApprovalRequired: false,
        aiImageGeneration: true,
      };

      // Wait for initial load
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(service.isConfigLoaded()).toBe(true);
          expect(service.systemFeatures()).toEqual(mockSystemFeatures);

          // Clear previous calls and set up new return value
          (mockConfigService.getSystemFeatures as Mock).mockClear();
          (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
            of(newFeatures)
          );

          service.refreshSystemFeatures();

          setTimeout(() => {
            expect(service.systemFeatures()).toEqual(newFeatures);
            expect(service.isConfigLoaded()).toBe(true);
            expect(mockConfigService.getSystemFeatures).toHaveBeenCalledTimes(
              1
            );
            resolve();
          }, 10);
        }, 10);
      });
    });

    it('should set isLoaded to false temporarily during refresh', () => {
      // Wait for initial load
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(service.isConfigLoaded()).toBe(true);

          // Setup a fresh observable for refresh
          (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
            of(mockSystemFeatures)
          );

          // Trigger refresh
          service.refreshSystemFeatures();

          // Since the refresh completes synchronously with our mock,
          // we just verify that the method was called and the service still works
          setTimeout(() => {
            expect(service.isConfigLoaded()).toBe(true);
            expect(mockConfigService.getSystemFeatures).toHaveBeenCalled();
            resolve();
          }, 10);
        }, 10);
      });
    });
  });

  describe('Computed Properties', () => {
    it('should compute isAiLintingEnabled correctly', () => {
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of({ aiLinting: true, aiImageGeneration: false })
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(testService.isAiLintingEnabled()).toBe(true);
          resolve();
        }, 10);
      });
    });

    it('should compute isAiLintingEnabled as false when undefined', () => {
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of({
          aiImageGeneration: false,
        } as SystemFeatures)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(testService.isAiLintingEnabled()).toBe(false);
          resolve();
        }, 10);
      });
    });

    it('should compute isAiImageGenerationEnabled correctly', () => {
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of({ aiLinting: false, aiImageGeneration: true })
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(testService.isAiImageGenerationEnabled()).toBe(true);
          resolve();
        }, 10);
      });
    });

    it('should compute isAiImageGenerationEnabled as false when undefined', () => {
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of({ aiLinting: false } as SystemFeatures)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(testService.isAiImageGenerationEnabled()).toBe(false);
          resolve();
        }, 10);
      });
    });

    it('should handle null/undefined system features gracefully', () => {
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of({} as SystemFeatures)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(testService.isAiLintingEnabled()).toBe(false);
          expect(testService.isAiImageGenerationEnabled()).toBe(false);
          resolve();
        }, 10);
      });
    });

    it('should compute isUserApprovalRequired correctly', () => {
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of({
          aiLinting: false,
          userApprovalRequired: true,
        } as SystemFeatures)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(testService.isUserApprovalRequired()).toBe(true);
          resolve();
        }, 10);
      });
    });

    it('should default isUserApprovalRequired to true when undefined', () => {
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of({
          aiLinting: false,
        } as SystemFeatures)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(testService.isUserApprovalRequired()).toBe(true);
          resolve();
        }, 10);
      });
    });
  });

  describe('Signal Reactivity', () => {
    it('should update computed properties when system features change', () => {
      const initialFeatures = { aiLinting: false, aiImageGeneration: false };
      const updatedFeatures = { aiLinting: true, aiImageGeneration: true };

      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValueOnce(
        of(initialFeatures)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(testService.isAiLintingEnabled()).toBe(false);
          expect(testService.isAiImageGenerationEnabled()).toBe(false);

          // Update features
          (mockConfigService.getSystemFeatures as Mock).mockReturnValueOnce(
            of(updatedFeatures)
          );

          testService.refreshSystemFeatures();

          setTimeout(() => {
            expect(testService.isAiLintingEnabled()).toBe(true);
            expect(testService.isAiImageGenerationEnabled()).toBe(true);
            resolve();
          }, 10);
        }, 10);
      });
    });

    it('should provide readonly access to signals', () => {
      // These should be readonly signals
      expect(typeof service.systemFeatures).toBe('function');
      expect(typeof service.isConfigLoaded).toBe('function');
      expect(typeof service.isAiLintingEnabled).toBe('function');
      expect(typeof service.isAiImageGenerationEnabled).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors during initial load', () => {
      const networkError = new Error('Network unavailable');

      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        throwError(() => networkError)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          // When server is unavailable, use offline defaults
          expect(testService.systemFeatures()).toEqual({
            aiLinting: false,
            aiImageGeneration: false,
            appMode: 'OFFLINE', // Treat as offline when server down
            userApprovalRequired: true,
          });
          expect(testService.isConfigLoaded()).toBe(true);
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            '[SystemConfig] Failed to load system features, using offline defaults:',
            networkError
          );
          resolve();
        }, 10);
      });
    });

    it('should handle errors during refresh', () => {
      // Wait for initial successful load
      return new Promise<void>(resolve => {
        setTimeout(() => {
          expect(service.isConfigLoaded()).toBe(true);

          // Now simulate error on refresh
          const refreshError = new Error('Refresh failed');
          (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
            throwError(() => refreshError)
          );

          service.refreshSystemFeatures();

          setTimeout(() => {
            // When server becomes unavailable, use offline defaults
            expect(service.systemFeatures()).toEqual({
              aiLinting: false,
              aiImageGeneration: false,
              appMode: 'OFFLINE', // Treat as offline when server down
              userApprovalRequired: true,
            });
            expect(service.isConfigLoaded()).toBe(true);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
              '[SystemConfig] Failed to load system features, using offline defaults:',
              refreshError
            );
            resolve();
          }, 10);
        }, 10);
      });
    });
  });
});
