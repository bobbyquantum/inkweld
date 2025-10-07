import { TestBed } from '@angular/core/testing';

import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;
  let consoleSpy: {
    log: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
    group: jest.SpyInstance;
    groupEnd: jest.SpyInstance;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LoggerService);

    // Spy on console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      group: jest.spyOn(console, 'group').mockImplementation(),
      groupEnd: jest.spyOn(console, 'groupEnd').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
});
