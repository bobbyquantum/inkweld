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

// ---------------------------------------------------------------------------
// In-process Loki transport (Node.js / Bun only)
//
// Activated by setting LOKI_URL, LOKI_USERNAME, and LOKI_API_KEY env vars.
// Not used in Cloudflare Workers — the loki-tail-worker handles that path.
//
// Logs are buffered and flushed to Loki every LOKI_FLUSH_INTERVAL_MS ms
// (default 5 s) or whenever the buffer reaches LOKI_BATCH_SIZE entries
// (default 50). On SIGTERM / SIGINT the buffer is flushed synchronously
// (best-effort) before the process exits.
// ---------------------------------------------------------------------------

const LOKI_BATCH_SIZE = 50;
const LOKI_FLUSH_INTERVAL_MS = 5_000;

interface LokiStreamValues {
  stream: Record<string, string>;
  values: [string, string][];
}

/** Convert a millisecond timestamp to the nanosecond string Loki expects. */
function msToNsStr(ms: number): string {
  return String(BigInt(Math.floor(ms)) * 1_000_000n);
}

class LokiTransport {
  private readonly pushUrl: string;
  private readonly authHeader: string;
  private readonly environment: string;
  private buffer: LogEntry[] = [];
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(url: string, username: string, apiKey: string, environment: string) {
    this.pushUrl = `${url.replace(/\/$/, '')}/loki/api/v1/push`;
    this.authHeader = `Basic ${btoa(`${username}:${apiKey}`)}`;
    this.environment = environment;

    this.timer = setInterval(() => {
      this.flush().catch(() => {});
    }, LOKI_FLUSH_INTERVAL_MS);

    // Keep the timer from preventing process exit
    if (typeof this.timer === 'object' && this.timer !== null && 'unref' in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }

    // Flush on graceful shutdown
    process.on('SIGTERM', () => {
      this.flush().catch(() => {});
    });
    process.on('SIGINT', () => {
      this.flush().catch(() => {});
    });
  }

  enqueue(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= LOKI_BATCH_SIZE) {
      this.flush().catch(() => {});
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);

    // Group entries into Loki streams by level
    const streamMap = new Map<string, [string, string][]>();
    for (const entry of batch) {
      if (!streamMap.has(entry.level)) streamMap.set(entry.level, []);
      const nsTs = msToNsStr(new Date(entry.timestamp).getTime());
      streamMap.get(entry.level)!.push([nsTs, JSON.stringify(entry)]);
    }

    const payload: { streams: LokiStreamValues[] } = {
      streams: Array.from(streamMap.entries()).map(([level, values]) => ({
        stream: { job: 'inkweld', environment: this.environment, level, source: 'bun' },
        values,
      })),
    };

    try {
      await fetch(this.pushUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: this.authHeader },
        body: JSON.stringify(payload),
      });
    } catch {
      // Silently ignore — Loki push failures must not cause log loops
    }
  }

  destroy(): void {
    clearInterval(this.timer);
  }
}

/** Lazily initialised Loki transport singleton (null when Loki is not configured). */
let _lokiTransport: LokiTransport | null = null;
let _lokiTransportChecked = false;

function getLokiTransport(): LokiTransport | null {
  if (_lokiTransportChecked) return _lokiTransport;
  _lokiTransportChecked = true;

  // Workers use the tail worker instead — skip in-process transport there.
  const { isWorkers } = detectEnvironment();
  if (isWorkers || typeof process === 'undefined') return null;

  const url = process.env.LOKI_URL;
  const username = process.env.LOKI_USERNAME;
  const apiKey = process.env.LOKI_API_KEY;

  if (url && username && apiKey) {
    _lokiTransport = new LokiTransport(
      url,
      username,
      apiKey,
      process.env.LOKI_ENVIRONMENT ?? 'unknown'
    );
  }

  return _lokiTransport;
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
    const timeStr = colors.dim + timestamp.split('T')[1].replaceAll('Z', '') + colors.reset;
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

    // Forward to Loki if the in-process transport is configured
    getLokiTransport()?.enqueue(entry);
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
