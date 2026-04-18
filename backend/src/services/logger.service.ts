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
    typeof process === 'undefined' ? undefined : process.env?.NODE_ENV
  )?.toLowerCase();
  const isDev = nodeEnv === 'development' || nodeEnv === 'test';

  // Detect Cloudflare Workers
  const isWorkers =
    (globalThis as Record<string, unknown>).caches !== undefined &&
    (globalThis as Record<string, unknown>).WebSocketPair !== undefined;

  return { isDev, isWorkers };
}

/**
 * Get current minimum log level from environment
 */
function getMinLevel(): LogLevel {
  const { isDev } = detectEnvironment();
  const envLevel = typeof process === 'undefined' ? undefined : process.env?.LOG_LEVEL;

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
  error: unknown
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
  const safeMessage = (() => {
    try {
      const json = JSON.stringify(error);
      if (json !== undefined) return json;
    } catch {
      // JSON.stringify throws for BigInt, circular references, etc.
    }
    if (typeof error === 'object' && error !== null) {
      return '[object Object]';
    }
    if (typeof error === 'symbol') {
      return error.toString();
    }
    // error is a primitive (string, number, boolean, bigint, null, undefined)
    const primitive = error as string | number | boolean | bigint | null | undefined;
    return String(primitive);
  })();

  return {
    name: 'UnknownError',
    message: typeof error === 'string' ? error : safeMessage,
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

/** Shared pre-computed metadata threaded from log() into logDev/logProduction. */
type LogMeta = {
  correlationId: string | null | undefined;
  timestamp: string;
  levelStr: LogLevelString;
};

/**
 * Core logging function
 */
function log(
  level: LogLevel,
  context: string,
  message: string,
  error?: unknown,
  data?: Record<string, unknown>,
  explicitCorrelationId?: string
): void {
  const minLevel = getMinLevel();
  if (level < minLevel) return;

  const { isDev } = detectEnvironment();
  const meta: LogMeta = {
    correlationId: explicitCorrelationId ?? getCorrelationId(),
    timestamp: getTimestamp(),
    levelStr: levelToString(level),
  };

  if (isDev) {
    logDev(level, context, message, error, data, meta);
  } else {
    logProduction(level, context, message, error, data, meta);
  }
}

function logDev(
  level: LogLevel,
  context: string,
  message: string,
  error: unknown,
  data: Record<string, unknown> | undefined,
  meta: LogMeta
): void {
  const { correlationId, timestamp, levelStr } = meta;
  const levelColor = colors[levelStr];
  const timeStr = colors.dim + timestamp.split('T')[1].replaceAll('Z', '') + colors.reset;
  const levelLabel = levelColor + colors.bright + levelStr.toUpperCase().padEnd(5) + colors.reset;
  const contextStr = colors.context + `[${context}]` + colors.reset;
  const corrStr = correlationId
    ? colors.dim + ` (${correlationId.slice(0, 8)})` + colors.reset
    : '';

  let logLine = `${timeStr} ${levelLabel} ${contextStr}${corrStr} ${message}`;

  if (data && Object.keys(data).length > 0) {
    logLine += colors.dim + ' ' + JSON.stringify(data) + colors.reset;
  }

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
}

function logProduction(
  level: LogLevel,
  context: string,
  message: string,
  error: unknown,
  data: Record<string, unknown> | undefined,
  meta: LogMeta
): void {
  const { correlationId, timestamp, levelStr } = meta;
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
    error?: unknown,
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
        error?: unknown,
        data?: Record<string, unknown>,
        correlationId?: string
      ) => logger.error(context, message, error, data, correlationId),
    };
  },
};

export default logger;
