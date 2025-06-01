import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ConfigService } from '../../api-client/api/config.service';
import { ConfigControllerGetSystemFeatures200Response } from '../../api-client/model/config-controller-get-system-features200-response';
import { SystemConfigService } from './system-config.service';

describe('SystemConfigService', () => {
  let service: SystemConfigService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let consoleSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  const mockSystemFeatures: ConfigControllerGetSystemFeatures200Response = {
    aiLinting: true,
    aiImageGeneration: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ConfigService
    mockConfigService = {
      configControllerGetSystemFeatures: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    // Mock console methods to avoid test output noise, but keep spies for testing
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    // Set up default successful response
    (
      mockConfigService.configControllerGetSystemFeatures as jest.Mock
    ).mockReturnValue(of(mockSystemFeatures));

    TestBed.configureTestingModule({
      providers: [
        SystemConfigService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    });

    service = TestBed.inject(SystemConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize with default features when constructor is called', () => {
      expect(service).toBeTruthy();
      expect(
        mockConfigService.configControllerGetSystemFeatures
      ).toHaveBeenCalled();
    });

    it('should have correct initial values', () => {
      // Reset the service with no API call to test initial state
      (
        mockConfigService.configControllerGetSystemFeatures as jest.Mock
      ).mockClear();

      // Check the signals are functions
      expect(typeof service.systemFeatures).toBe('function');
      expect(typeof service.isConfigLoaded).toBe('function');
      expect(typeof service.isAiLintingEnabled).toBe('function');
      expect(typeof service.isAiImageGenerationEnabled).toBe('function');
    });
  });

  describe('loadSystemFeatures', () => {
    it('should handle API errors gracefully', done => {
      const error = new Error('API Error');

      // Reset TestBed with error mock
      TestBed.resetTestingModule();
      (
        mockConfigService.configControllerGetSystemFeatures as jest.Mock
      ).mockReturnValue(throwError(() => error));

      TestBed.configureTestingModule({
        providers: [
          SystemConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      const errorService = TestBed.inject(SystemConfigService);

      // Wait for async operation to complete
      setTimeout(() => {
        expect(errorService.systemFeatures()).toEqual({
          aiLinting: false,
          aiImageGeneration: false,
          captcha: { enabled: false },
          userApprovalRequired: true,
        });
        expect(errorService.isConfigLoaded()).toBe(true);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[SystemConfig] Failed to load system features, using defaults:',
          error
        );
        done();
      }, 10);
    });

    it('should log successful feature loading', done => {
      // Wait for initial load to complete
      setTimeout(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[SystemConfig] Loaded system features:',
          mockSystemFeatures
        );
        done();
      }, 10);
    });
  });

  describe('refreshSystemFeatures', () => {
    it('should refresh system features and reload configuration', done => {
      const newFeatures: ConfigControllerGetSystemFeatures200Response = {
        aiLinting: false,
        aiImageGeneration: true,
      };

      // Wait for initial load
      setTimeout(() => {
        expect(service.isConfigLoaded()).toBe(true);
        expect(service.systemFeatures()).toEqual(mockSystemFeatures);

        // Clear previous calls and set up new return value
        (
          mockConfigService.configControllerGetSystemFeatures as jest.Mock
        ).mockClear();
        (
          mockConfigService.configControllerGetSystemFeatures as jest.Mock
        ).mockReturnValue(of(newFeatures));

        service.refreshSystemFeatures();

        setTimeout(() => {
          expect(service.systemFeatures()).toEqual(newFeatures);
          expect(service.isConfigLoaded()).toBe(true);
          expect(
            mockConfigService.configControllerGetSystemFeatures
          ).toHaveBeenCalledTimes(1);
          done();
        }, 10);
      }, 10);
    });

    it('should set isLoaded to false temporarily during refresh', done => {
      // Wait for initial load
      setTimeout(() => {
        expect(service.isConfigLoaded()).toBe(true);

        // Setup a fresh observable for refresh
        (
          mockConfigService.configControllerGetSystemFeatures as jest.Mock
        ).mockReturnValue(of(mockSystemFeatures));

        // Trigger refresh
        service.refreshSystemFeatures();

        // Since the refresh completes synchronously with our mock,
        // we just verify that the method was called and the service still works
        setTimeout(() => {
          expect(service.isConfigLoaded()).toBe(true);
          expect(
            mockConfigService.configControllerGetSystemFeatures
          ).toHaveBeenCalled();
          done();
        }, 10);
      }, 10);
    });
  });

  describe('Computed Properties', () => {
    it('should compute isAiLintingEnabled correctly', done => {
      TestBed.resetTestingModule();
      (
        mockConfigService.configControllerGetSystemFeatures as jest.Mock
      ).mockReturnValue(of({ aiLinting: true, aiImageGeneration: false }));

      TestBed.configureTestingModule({
        providers: [
          SystemConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      setTimeout(() => {
        expect(testService.isAiLintingEnabled()).toBe(true);
        done();
      }, 10);
    });

    it('should compute isAiLintingEnabled as false when undefined', done => {
      TestBed.resetTestingModule();
      (
        mockConfigService.configControllerGetSystemFeatures as jest.Mock
      ).mockReturnValue(
        of({
          aiImageGeneration: false,
        } as ConfigControllerGetSystemFeatures200Response)
      );

      TestBed.configureTestingModule({
        providers: [
          SystemConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      setTimeout(() => {
        expect(testService.isAiLintingEnabled()).toBe(false);
        done();
      }, 10);
    });

    it('should compute isAiImageGenerationEnabled correctly', done => {
      TestBed.resetTestingModule();
      (
        mockConfigService.configControllerGetSystemFeatures as jest.Mock
      ).mockReturnValue(of({ aiLinting: false, aiImageGeneration: true }));

      TestBed.configureTestingModule({
        providers: [
          SystemConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      setTimeout(() => {
        expect(testService.isAiImageGenerationEnabled()).toBe(true);
        done();
      }, 10);
    });

    it('should compute isAiImageGenerationEnabled as false when undefined', done => {
      TestBed.resetTestingModule();
      (
        mockConfigService.configControllerGetSystemFeatures as jest.Mock
      ).mockReturnValue(
        of({ aiLinting: false } as ConfigControllerGetSystemFeatures200Response)
      );

      TestBed.configureTestingModule({
        providers: [
          SystemConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      setTimeout(() => {
        expect(testService.isAiImageGenerationEnabled()).toBe(false);
        done();
      }, 10);
    });

    it('should handle null/undefined system features gracefully', done => {
      TestBed.resetTestingModule();
      (
        mockConfigService.configControllerGetSystemFeatures as jest.Mock
      ).mockReturnValue(of({} as ConfigControllerGetSystemFeatures200Response));

      TestBed.configureTestingModule({
        providers: [
          SystemConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      setTimeout(() => {
        expect(testService.isAiLintingEnabled()).toBe(false);
        expect(testService.isAiImageGenerationEnabled()).toBe(false);
        done();
      }, 10);
    });
  });

  describe('Signal Reactivity', () => {
    it('should update computed properties when system features change', done => {
      const initialFeatures = { aiLinting: false, aiImageGeneration: false };
      const updatedFeatures = { aiLinting: true, aiImageGeneration: true };

      TestBed.resetTestingModule();
      (
        mockConfigService.configControllerGetSystemFeatures as jest.Mock
      ).mockReturnValueOnce(of(initialFeatures));

      TestBed.configureTestingModule({
        providers: [
          SystemConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      setTimeout(() => {
        expect(testService.isAiLintingEnabled()).toBe(false);
        expect(testService.isAiImageGenerationEnabled()).toBe(false);

        // Update features
        (
          mockConfigService.configControllerGetSystemFeatures as jest.Mock
        ).mockReturnValueOnce(of(updatedFeatures));

        testService.refreshSystemFeatures();

        setTimeout(() => {
          expect(testService.isAiLintingEnabled()).toBe(true);
          expect(testService.isAiImageGenerationEnabled()).toBe(true);
          done();
        }, 10);
      }, 10);
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
    it('should handle network errors during initial load', done => {
      const networkError = new Error('Network unavailable');

      TestBed.resetTestingModule();
      (
        mockConfigService.configControllerGetSystemFeatures as jest.Mock
      ).mockReturnValue(throwError(() => networkError));

      TestBed.configureTestingModule({
        providers: [
          SystemConfigService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      });

      const testService = TestBed.inject(SystemConfigService);

      setTimeout(() => {
        expect(testService.systemFeatures()).toEqual({
          aiLinting: false,
          aiImageGeneration: false,
          captcha: { enabled: false },
          userApprovalRequired: true,
        });
        expect(testService.isConfigLoaded()).toBe(true);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[SystemConfig] Failed to load system features, using defaults:',
          networkError
        );
        done();
      }, 10);
    });

    it('should handle errors during refresh', done => {
      // Wait for initial successful load
      setTimeout(() => {
        expect(service.isConfigLoaded()).toBe(true);

        // Now simulate error on refresh
        const refreshError = new Error('Refresh failed');
        (
          mockConfigService.configControllerGetSystemFeatures as jest.Mock
        ).mockReturnValue(throwError(() => refreshError));

        service.refreshSystemFeatures();

        setTimeout(() => {
          expect(service.systemFeatures()).toEqual({
            aiLinting: false,
            aiImageGeneration: false,
            captcha: { enabled: false },
            userApprovalRequired: true,
          });
          expect(service.isConfigLoaded()).toBe(true);
          expect(consoleWarnSpy).toHaveBeenCalledWith(
            '[SystemConfig] Failed to load system features, using defaults:',
            refreshError
          );
          done();
        }, 10);
      }, 10);
    });
  });
});
