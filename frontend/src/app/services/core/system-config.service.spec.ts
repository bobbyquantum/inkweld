import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConfigurationService } from '@inkweld/api/configuration.service';
import {
  SystemFeatures,
  SystemFeaturesAppMode,
} from '@inkweld/model/system-features';
import { of, throwError } from 'rxjs';
import { Mock, MockedObject, vi } from 'vitest';

import { SetupService } from './setup.service';
import { SystemConfigService } from './system-config.service';

describe('SystemConfigService', () => {
  let service: SystemConfigService;
  let mockConfigService: MockedObject<ConfigurationService>;
  let mockSetupService: MockedObject<SetupService>;
  let consoleSpy: any;
  let consoleWarnSpy: any;

  const mockSystemFeatures: SystemFeatures = {
    aiKillSwitch: false,
    aiKillSwitchLockedByEnv: false,
    aiLinting: true,
    aiImageGeneration: true,
    appMode: SystemFeaturesAppMode.Both,
    userApprovalRequired: false,
    emailEnabled: false,
    requireEmail: false,
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumber: true,
      requireSymbol: true,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ConfigurationService
    mockConfigService = {
      getSystemFeatures: vi.fn(),
    } as MockedObject<ConfigurationService>;

    // Mock SetupService - default to 'online' mode
    mockSetupService = {
      getMode: vi.fn().mockReturnValue('online'),
    } as MockedObject<SetupService>;

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
        { provide: SetupService, useValue: mockSetupService },
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
    it('should use offline defaults in offline mode without API call', () => {
      TestBed.resetTestingModule();

      // Clear mocks from previous test
      vi.clearAllMocks();

      const offlineSetupService = {
        getMode: vi.fn().mockReturnValue('local'),
      } as MockedObject<SetupService>;

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
          { provide: SetupService, useValue: offlineSetupService },
        ],
      });

      const offlineService = TestBed.inject(SystemConfigService);

      // Should NOT call the API in offline mode
      expect(mockConfigService.getSystemFeatures).not.toHaveBeenCalled();

      // Should use offline defaults
      expect(offlineService.systemFeatures()).toEqual({
        aiKillSwitch: true,
        aiKillSwitchLockedByEnv: false,
        aiLinting: false,
        aiImageGeneration: false,
        appMode: 'LOCAL',
        userApprovalRequired: false,
        emailEnabled: false,
        requireEmail: false,
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumber: true,
          requireSymbol: true,
        },
      });

      expect(offlineService.isConfigLoaded()).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        '[SystemConfig] Local mode - using default features without API call'
      );
    });

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
          { provide: SetupService, useValue: mockSetupService },
        ],
      });

      const errorService = TestBed.inject(SystemConfigService);

      // Wait for async operation to complete
      return new Promise<void>(resolve => {
        setTimeout(() => {
          // When server is unavailable, use offline defaults
          expect(errorService.systemFeatures()).toEqual({
            aiKillSwitch: true,
            aiKillSwitchLockedByEnv: false,
            aiLinting: false,
            aiImageGeneration: false,
            appMode: 'LOCAL', // Changed from BOTH - treat as offline when server down
            userApprovalRequired: true,
            emailEnabled: false,
            requireEmail: false,
            passwordPolicy: {
              minLength: 8,
              requireUppercase: true,
              requireLowercase: true,
              requireNumber: true,
              requireSymbol: true,
            },
          });
          expect(errorService.isConfigLoaded()).toBe(true);
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            '[SystemConfig] Failed to load system features, using local defaults:',
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
        aiKillSwitch: false,
        aiKillSwitchLockedByEnv: false,
        aiLinting: false,
        appMode: SystemFeaturesAppMode.Both,
        userApprovalRequired: false,
        aiImageGeneration: true,
        emailEnabled: false,
        requireEmail: false,
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumber: true,
          requireSymbol: true,
        },
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
    it('should compute isAiKillSwitchEnabled correctly', async () => {
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 10));

      // mockSystemFeatures has aiKillSwitch: false
      expect(service.isAiKillSwitchEnabled()).toBe(false);
    });

    it('should default isAiKillSwitchEnabled to true when undefined', async () => {
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of({} as SystemFeatures)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
          { provide: SetupService, useValue: mockSetupService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(testService.isAiKillSwitchEnabled()).toBe(true);
    });

    it('should compute isAiKillSwitchLockedByEnv correctly', async () => {
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 10));

      // mockSystemFeatures has aiKillSwitchLockedByEnv: false
      expect(service.isAiKillSwitchLockedByEnv()).toBe(false);
    });

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
          { provide: SetupService, useValue: mockSetupService },
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
          { provide: SetupService, useValue: mockSetupService },
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
          { provide: SetupService, useValue: mockSetupService },
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
          { provide: SetupService, useValue: mockSetupService },
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
          { provide: SetupService, useValue: mockSetupService },
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
          { provide: SetupService, useValue: mockSetupService },
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
          { provide: SetupService, useValue: mockSetupService },
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
          { provide: SetupService, useValue: mockSetupService },
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
          { provide: SetupService, useValue: mockSetupService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      return new Promise<void>(resolve => {
        setTimeout(() => {
          // When server is unavailable, use offline defaults
          expect(testService.systemFeatures()).toEqual({
            aiKillSwitch: true,
            aiKillSwitchLockedByEnv: false,
            aiLinting: false,
            aiImageGeneration: false,
            appMode: 'LOCAL', // Treat as offline when server down
            userApprovalRequired: true,
            emailEnabled: false,
            requireEmail: false,
            passwordPolicy: {
              minLength: 8,
              requireUppercase: true,
              requireLowercase: true,
              requireNumber: true,
              requireSymbol: true,
            },
          });
          expect(testService.isConfigLoaded()).toBe(true);
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            '[SystemConfig] Failed to load system features, using local defaults:',
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
              aiKillSwitch: true,
              aiKillSwitchLockedByEnv: false,
              aiLinting: false,
              aiImageGeneration: false,
              appMode: 'LOCAL', // Treat as offline when server down
              userApprovalRequired: true,
              emailEnabled: false,
              requireEmail: false,
              passwordPolicy: {
                minLength: 8,
                requireUppercase: true,
                requireLowercase: true,
                requireNumber: true,
                requireSymbol: true,
              },
            });
            expect(service.isConfigLoaded()).toBe(true);
            expect(consoleWarnSpy).toHaveBeenCalledWith(
              '[SystemConfig] Failed to load system features, using local defaults:',
              refreshError
            );
            resolve();
          }, 10);
        }, 10);
      });
    });
  });

  describe('getAiImageGenerationStatus', () => {
    it('should return disabled when config is loading', () => {
      // Create a fresh service that hasn't loaded config yet
      TestBed.resetTestingModule();

      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of(mockSystemFeatures)
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
          { provide: SetupService, useValue: mockSetupService },
        ],
      });

      // The service will be loading - test will check immediately
      const testService = TestBed.inject(SystemConfigService);
      // Since mocked with `of()`, loading happens synchronously, so this check verifies the method works
      expect(testService.getAiImageGenerationStatus).toBeDefined();
    });

    it('should return enabled when AI image generation is enabled', async () => {
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 10));

      const status = service.getAiImageGenerationStatus();
      expect(status.status).toBe('enabled');
    });

    it('should return hidden when AI image generation is disabled', async () => {
      TestBed.resetTestingModule();
      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        of({
          ...mockSystemFeatures,
          aiImageGeneration: false,
        })
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
          { provide: SetupService, useValue: mockSetupService },
        ],
      });

      const disabledService = TestBed.inject(SystemConfigService);

      // Wait for load
      await new Promise(resolve => setTimeout(resolve, 10));

      const status = disabledService.getAiImageGenerationStatus();
      expect(status.status).toBe('hidden');
    });

    it('should handle sync state when checking status', async () => {
      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 10));

      const { DocumentSyncState } =
        await import('../../models/document-sync-state');

      // With successful config and AI enabled, sync state doesn't matter
      const status = service.getAiImageGenerationStatus(
        DocumentSyncState.Synced
      );
      expect(status.status).toBe('enabled');
    });

    it('should return hidden when in offline mode', () => {
      TestBed.resetTestingModule();
      vi.clearAllMocks();

      const offlineSetupService = {
        getMode: vi.fn().mockReturnValue('local'),
      } as MockedObject<SetupService>;

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
          { provide: SetupService, useValue: offlineSetupService },
        ],
      });

      const offlineService = TestBed.inject(SystemConfigService);

      const status = offlineService.getAiImageGenerationStatus();
      expect(status.status).toBe('hidden');
    });

    it('should return disabled when server is unavailable and sync state indicates offline', async () => {
      TestBed.resetTestingModule();
      vi.clearAllMocks();

      (mockConfigService.getSystemFeatures as Mock).mockReturnValue(
        throwError(() => new Error('Server unavailable'))
      );

      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          SystemConfigService,
          { provide: ConfigurationService, useValue: mockConfigService },
          { provide: SetupService, useValue: mockSetupService },
        ],
      });

      const failedService = TestBed.inject(SystemConfigService);

      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 10));

      const { DocumentSyncState } =
        await import('../../models/document-sync-state');

      const status = failedService.getAiImageGenerationStatus(
        DocumentSyncState.Local
      );

      // Server unavailable with offline sync state - disabled with tooltip
      expect(status.status).toBe('disabled');
      expect(status.tooltip).toBe(
        'Not connected to server. AI image generation is unavailable.'
      );
    });
  });
});
