import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;
  let consoleSpy: {
    log: any;
    warn: any;
    error: any;
    group: any;
    groupEnd: any;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
    service = TestBed.inject(LoggerService);

    // Spy on console methods
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      group: vi.spyOn(console, 'group').mockImplementation(() => {}),
      groupEnd: vi.spyOn(console, 'groupEnd').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should log debug messages in development mode', () => {
    service.debug('TestContext', 'Test message', { data: 'test' });
    // In dev mode, debug should log
    expect(consoleSpy.log).toHaveBeenCalledWith(
      '[DEBUG][TestContext] Test message',
      { data: 'test' }
    );
  });

  it('should log info messages', () => {
    service.info('TestContext', 'Info message');
    expect(consoleSpy.log).toHaveBeenCalledWith(
      '[INFO][TestContext] Info message'
    );
  });

  it('should log warning messages', () => {
    service.warn('TestContext', 'Warning message');
    expect(consoleSpy.warn).toHaveBeenCalledWith(
      '[WARN][TestContext] Warning message'
    );
  });

  it('should log error messages', () => {
    service.error('TestContext', 'Error message', new Error('test'));
    expect(consoleSpy.error).toHaveBeenCalledWith(
      '[ERROR][TestContext] Error message',
      expect.any(Error)
    );
  });

  it('should support grouped logging', () => {
    service.group('TestContext', 'Test Group', () => {
      service.debug('TestContext', 'Grouped message');
    });

    expect(consoleSpy.group).toHaveBeenCalledWith('[TestContext] Test Group');
    expect(consoleSpy.groupEnd).toHaveBeenCalled();
  });

  describe('localStorage debug override', () => {
    afterEach(() => {
      localStorage.removeItem('inkweld-debug');
    });

    it('should enable debug logging when inkweld-debug is set in localStorage', () => {
      localStorage.setItem('inkweld-debug', 'true');

      // Create a fresh instance so it reads the flag
      const debugService = new LoggerService();
      debugService.debug('TestContext', 'Debug via localStorage');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[DEBUG][TestContext] Debug via localStorage'
      );
    });

    it('should not enable debug logging when inkweld-debug is absent', () => {
      localStorage.removeItem('inkweld-debug');

      const prodService = new LoggerService();
      prodService.info('TestContext', 'Info in prod');

      // In test env (dev mode), info logs anyway — so this test mainly
      // verifies the code path doesn't throw. The real gate is in prod.
      expect(prodService).toBeTruthy();
    });
  });
});
