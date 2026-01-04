/**
 * Tests for the logger service
 */
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { logger } from '../src/services/logger.service';

describe('LoggerService', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('log methods', () => {
    it('should call console.log for debug messages', () => {
      process.env.LOG_LEVEL = 'debug';
      process.env.NODE_ENV = 'development';

      logger.debug('TestContext', 'Debug message');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should call console.log for info messages', () => {
      process.env.LOG_LEVEL = 'info';
      process.env.NODE_ENV = 'development';

      logger.info('TestContext', 'Info message');

      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should call console.warn for warn messages', () => {
      process.env.LOG_LEVEL = 'warn';
      process.env.NODE_ENV = 'development';

      logger.warn('TestContext', 'Warn message');

      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should call console.error for error messages', () => {
      process.env.LOG_LEVEL = 'error';
      process.env.NODE_ENV = 'development';

      logger.error('TestContext', 'Error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should include error stack in error messages', () => {
      process.env.LOG_LEVEL = 'error';
      process.env.NODE_ENV = 'development';

      const testError = new Error('Test error');
      logger.error('TestContext', 'Error occurred', testError);

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('log level filtering', () => {
    it('should not log debug when level is info', () => {
      process.env.LOG_LEVEL = 'info';
      process.env.NODE_ENV = 'development';

      logger.debug('TestContext', 'Should not appear');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log info or debug when level is warn', () => {
      process.env.LOG_LEVEL = 'warn';
      process.env.NODE_ENV = 'development';

      logger.debug('TestContext', 'Should not appear');
      logger.info('TestContext', 'Should not appear');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should only log errors when level is error', () => {
      process.env.LOG_LEVEL = 'error';
      process.env.NODE_ENV = 'development';

      logger.debug('TestContext', 'Should not appear');
      logger.info('TestContext', 'Should not appear');
      logger.warn('TestContext', 'Should not appear');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      logger.error('TestContext', 'Should appear');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log nothing when level is none', () => {
      process.env.LOG_LEVEL = 'none';
      process.env.NODE_ENV = 'development';

      logger.debug('TestContext', 'Should not appear');
      logger.info('TestContext', 'Should not appear');
      logger.warn('TestContext', 'Should not appear');
      logger.error('TestContext', 'Should not appear');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('child logger', () => {
    it('should create child logger with preset context', () => {
      process.env.LOG_LEVEL = 'debug';
      process.env.NODE_ENV = 'development';

      const childLog = logger.child('ChildContext');
      childLog.info('Child info message');

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      expect(logCall).toContain('ChildContext');
    });
  });

  describe('data serialization', () => {
    it('should include additional data in log output', () => {
      process.env.LOG_LEVEL = 'debug';
      process.env.NODE_ENV = 'development';

      logger.info('TestContext', 'Message with data', { userId: '123', action: 'test' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0][0] as string;
      expect(logCall).toContain('userId');
      expect(logCall).toContain('123');
    });
  });

  describe('production mode (JSON output)', () => {
    it('should output valid JSON in production mode', () => {
      process.env.LOG_LEVEL = 'info';
      process.env.NODE_ENV = 'production';

      logger.info('TestContext', 'Production log message', { key: 'value' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0][0] as string;

      // Should be valid JSON
      const parsed = JSON.parse(logCall);
      expect(parsed.level).toBe('info');
      expect(parsed.context).toBe('TestContext');
      expect(parsed.message).toBe('Production log message');
      expect(parsed.data).toEqual({ key: 'value' });
      expect(parsed.timestamp).toBeDefined();
    });

    it('should include error details in JSON output', () => {
      process.env.LOG_LEVEL = 'error';
      process.env.NODE_ENV = 'production';

      const testError = new Error('Test error message');
      logger.error('TestContext', 'Error occurred', testError);

      expect(consoleErrorSpy).toHaveBeenCalled();
      const logCall = consoleErrorSpy.mock.calls[0][0] as string;

      const parsed = JSON.parse(logCall);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.name).toBe('Error');
      expect(parsed.error.message).toBe('Test error message');
      expect(parsed.error.stack).toBeDefined();
    });
  });

  describe('correlation ID', () => {
    it('should include correlation ID when provided', () => {
      process.env.LOG_LEVEL = 'info';
      process.env.NODE_ENV = 'production';

      logger.info(
        'TestContext',
        'Message with correlation',
        { key: 'value' },
        'test-correlation-id'
      );

      expect(consoleLogSpy).toHaveBeenCalled();
      const logCall = consoleLogSpy.mock.calls[0][0] as string;

      const parsed = JSON.parse(logCall);
      expect(parsed.correlationId).toBe('test-correlation-id');
    });
  });
});
