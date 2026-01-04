/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Log level string literals for parsing
 */
export type LogLevelString = 'debug' | 'info' | 'warn' | 'error' | 'none';

/**
 * Structured log entry for JSON output
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevelString;
  context: string;
  message: string;
  correlationId?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * ANSI color codes for terminal output (development mode)
 */
const colors: Record<LogLevelString | 'reset' | 'dim' | 'bright' | 'context', string> = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',

  // Log level colors
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
  none: '\x1b[0m', // Reset (shouldn't be used, but needed for type safety)

  // Context color
  context: '\x1b[35m', // Magenta
};

/**
 * Parse log level from string (environment variable)
 */
function parseLogLevel(level: string | undefined): LogLevel {
  if (!level) return LogLevel.INFO;

  switch (level.toLowerCase()) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'info':
      return LogLevel.INFO;
    case 'warn':
    case 'warning':
      return LogLevel.WARN;
    case 'error':
      return LogLevel.ERROR;
    case 'none':
    case 'silent':
      return LogLevel.NONE;
    default:
      return LogLevel.INFO;
  }
}

/**
 * Detect runtime environment
 */
function detectEnvironment(): { isDev: boolean; isWorkers: boolean } {
  const nodeEnv = (
    typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined
  )?.toLowerCase();
  const isDev = nodeEnv === 'development' || nodeEnv === 'test' || !nodeEnv;

  // Detect Cloudflare Workers
  const isWorkers =
    typeof (globalThis as Record<string, unknown>).caches !== 'undefined' &&
    typeof (globalThis as Record<string, unknown>).WebSocketPair !== 'undefined';

  return { isDev, isWorkers };
}

/**
 * Get current minimum log level from environment
 */
function getMinLevel(): LogLevel {
  const { isDev } = detectEnvironment();
  const envLevel = typeof process !== 'undefined' ? process.env?.LOG_LEVEL : undefined;

  // In development, default to DEBUG; in production, default to INFO
  if (envLevel) {
    return parseLogLevel(envLevel);
  }

  return isDev ? LogLevel.DEBUG : LogLevel.INFO;
}

/**
 * Format error for logging
 */
function formatError(
  error: Error | unknown
): { name: string; message: string; stack?: string } | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  // Handle non-Error objects
  return {
    name: 'UnknownError',
    message: String(error),
  };
}

/**
 * Get ISO timestamp
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Log level to string
 */
function levelToString(level: LogLevel): LogLevelString {
  switch (level) {
    case LogLevel.DEBUG:
      return 'debug';
    case LogLevel.INFO:
      return 'info';
    case LogLevel.WARN:
      return 'warn';
    case LogLevel.ERROR:
      return 'error';
    default:
      return 'info';
  }
}

/**
 * AsyncLocalStorage for correlation ID (Node.js/Bun only)
 * In Workers, we pass correlationId explicitly
 */
let correlationStorage: { getStore: () => { correlationId?: string } | undefined } | null = null;

// Try to import AsyncLocalStorage (works in Node.js and Bun)
try {
  if (typeof process !== 'undefined') {
    // Dynamic import to avoid Workers bundling issues
    const asyncHooks = await import('node:async_hooks');
    const storage = new asyncHooks.AsyncLocalStorage<{ correlationId?: string }>();
    correlationStorage = storage;
  }
} catch {
  // AsyncLocalStorage not available (Workers or import failed)
}

/**
 * Get current correlation ID from async context
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage?.getStore()?.correlationId;
}

/**
 * Run a function with a correlation ID in async context
 */
export function withCorrelationId<T>(correlationId: string, fn: () => T): T {
  if (correlationStorage && 'run' in correlationStorage) {
    return (
      correlationStorage as { run: <R>(store: { correlationId: string }, fn: () => R) => R }
    ).run({ correlationId }, fn);
  }
  // Fallback: just run the function (no async context in Workers)
  return fn();
}

/**
 * Core logging function
 */
function log(
  level: LogLevel,
  context: string,
  message: string,
  error?: Error | unknown,
  data?: Record<string, unknown>,
  explicitCorrelationId?: string
): void {
  const minLevel = getMinLevel();

  // Check if this level should be logged
  if (level < minLevel) return;

  const { isDev } = detectEnvironment();
  const correlationId = explicitCorrelationId ?? getCorrelationId();
  const timestamp = getTimestamp();
  const levelStr = levelToString(level);

  if (isDev) {
    // Human-readable colored output for development
    const levelColor = colors[levelStr];
    const timeStr = colors.dim + timestamp.split('T')[1].replace('Z', '') + colors.reset;
    const levelLabel = levelColor + colors.bright + levelStr.toUpperCase().padEnd(5) + colors.reset;
    const contextStr = colors.context + `[${context}]` + colors.reset;
    const corrStr = correlationId
      ? colors.dim + ` (${correlationId.slice(0, 8)})` + colors.reset
      : '';

    // Build the log line
    let logLine = `${timeStr} ${levelLabel} ${contextStr}${corrStr} ${message}`;

    // Add data if present
    if (data && Object.keys(data).length > 0) {
      logLine += colors.dim + ' ' + JSON.stringify(data) + colors.reset;
    }

    // Output based on level
    if (level === LogLevel.ERROR) {
      console.error(logLine);
      if (error) {
        const formatted = formatError(error);
        if (formatted?.stack) {
          console.error(colors.dim + formatted.stack + colors.reset);
        }
      }
    } else if (level === LogLevel.WARN) {
      console.warn(logLine);
    } else {
      console.log(logLine);
    }
  } else {
    // Structured JSON output for production
    const entry: LogEntry = {
      timestamp,
      level: levelStr,
      context,
      message,
    };

    if (correlationId) entry.correlationId = correlationId;
    if (data && Object.keys(data).length > 0) entry.data = data;
    if (error) entry.error = formatError(error);

    const jsonLine = JSON.stringify(entry);

    if (level === LogLevel.ERROR) {
      console.error(jsonLine);
    } else if (level === LogLevel.WARN) {
      console.warn(jsonLine);
    } else {
      console.log(jsonLine);
    }
  }
}

/**
 * Logger interface for application-wide logging
 */
export const logger = {
  /**
   * Log a debug message (development only by default)
   */
  debug(
    context: string,
    message: string,
    data?: Record<string, unknown>,
    correlationId?: string
  ): void {
    log(LogLevel.DEBUG, context, message, undefined, data, correlationId);
  },

  /**
   * Log an info message
   */
  info(
    context: string,
    message: string,
    data?: Record<string, unknown>,
    correlationId?: string
  ): void {
    log(LogLevel.INFO, context, message, undefined, data, correlationId);
  },

  /**
   * Log a warning message
   */
  warn(
    context: string,
    message: string,
    data?: Record<string, unknown>,
    correlationId?: string
  ): void {
    log(LogLevel.WARN, context, message, undefined, data, correlationId);
  },

  /**
   * Log an error message with optional error object
   */
  error(
    context: string,
    message: string,
    error?: Error | unknown,
    data?: Record<string, unknown>,
    correlationId?: string
  ): void {
    log(LogLevel.ERROR, context, message, error, data, correlationId);
  },

  /**
   * Create a child logger with a preset context
   */
  child(context: string) {
    return {
      debug: (message: string, data?: Record<string, unknown>, correlationId?: string) =>
        logger.debug(context, message, data, correlationId),
      info: (message: string, data?: Record<string, unknown>, correlationId?: string) =>
        logger.info(context, message, data, correlationId),
      warn: (message: string, data?: Record<string, unknown>, correlationId?: string) =>
        logger.warn(context, message, data, correlationId),
      error: (
        message: string,
        error?: Error | unknown,
        data?: Record<string, unknown>,
        correlationId?: string
      ) => logger.error(context, message, error, data, correlationId),
    };
  },
};

export default logger;
