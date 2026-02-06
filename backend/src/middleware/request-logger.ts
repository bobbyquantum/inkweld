/**
 * Request logging middleware for Hono
 *
 * Features:
 * - Generates unique correlation IDs for each request
 * - Logs request start and completion with timing
 * - Structured output using the logger service
 * - Works on all runtimes (Bun, Node.js, Cloudflare Workers)
 *
 * The correlation ID is:
 * - Attached to the Hono context as 'correlationId'
 * - Set in AsyncLocalStorage for automatic propagation (Bun/Node only)
 * - Available in the X-Correlation-ID response header
 */
import type { MiddlewareHandler } from 'hono';
import { logger, withCorrelationId, getCorrelationId } from '../services/logger.service';

/**
 * Generate a unique correlation ID
 * Uses crypto.randomUUID when available, falls back to timestamp + random
 */
function generateCorrelationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for environments without crypto.randomUUID
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Paths to skip logging (health checks, static assets)
 */
const SKIP_PATHS = [
  '/health',
  '/api/v1/health',
  '/favicon.ico',
  '/robots.txt',
  '/manifest.json',
  '/ngsw.json',
  '/ngsw-worker.js',
];

/**
 * Check if a path should skip detailed logging
 * (still logs errors, just not routine requests)
 */
function _shouldSkipLogging(path: string): boolean {
  // Skip exact matches
  if (SKIP_PATHS.includes(path)) return true;

  // Skip static asset paths
  if (path.startsWith('/assets/')) return true;
  if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.map')) return true;
  if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.svg')) return true;
  if (path.endsWith('.woff') || path.endsWith('.woff2') || path.endsWith('.ttf')) return true;

  return false;
}

/**
 * Format bytes into human-readable size
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Request logger middleware
 *
 * Usage:
 *   app.use('*', requestLogger());
 *
 * Options:
 * - skipPaths: Additional paths to skip logging (default: health checks, static)
 * - logBody: Whether to log request/response body size (default: true)
 */
export interface RequestLoggerOptions {
  skipPaths?: string[];
  logBody?: boolean;
}

export function requestLogger(options: RequestLoggerOptions = {}): MiddlewareHandler {
  const { skipPaths = [], logBody = true } = options;
  const allSkipPaths = [...SKIP_PATHS, ...skipPaths];
  const log = logger.child('HTTP');

  return async (c, next) => {
    const start = performance.now();
    const method = c.req.method;
    const path = c.req.path;
    const _url = c.req.url;

    // Generate or use existing correlation ID
    const incomingCorrelationId = c.req.header('X-Correlation-ID');
    const correlationId = incomingCorrelationId || generateCorrelationId();

    // Store correlation ID in context for use by other handlers
    c.set('correlationId', correlationId);

    // Check if we should skip logging this request
    const skipLogging = allSkipPaths.some((p) => path === p || path.startsWith(p + '/'));

    // Get request info
    const userAgent = c.req.header('User-Agent');
    const contentLength = c.req.header('Content-Length');
    const requestSize = contentLength ? parseInt(contentLength, 10) : 0;

    // Log request start
    // OAuth/MCP routes log at INFO level for easier debugging of external clients
    const isOAuthRoute =
      path.startsWith('/oauth') ||
      path.startsWith('/.well-known') ||
      path.startsWith('/register') ||
      path.startsWith('/api/v1/ai/mcp');
    if (!skipLogging) {
      const logFn = isOAuthRoute ? log.info.bind(log) : log.debug.bind(log);
      logFn(
        `→ ${method} ${path}`,
        {
          method,
          path,
          ...(userAgent && { userAgent: userAgent.slice(0, 100) }),
          ...(logBody && requestSize > 0 && { requestSize: formatBytes(requestSize) }),
        },
        correlationId
      );
    }

    // Execute request with correlation ID in async context
    const executeRequest = async () => {
      try {
        await next();
      } catch (error) {
        // Log unhandled errors at error level
        const duration = Math.round(performance.now() - start);
        log.error(
          `✗ ${method} ${path} - Unhandled error`,
          error,
          { method, path, durationMs: duration },
          correlationId
        );
        throw error;
      }

      // Calculate duration
      const duration = Math.round(performance.now() - start);
      const status = c.res.status;

      // Add correlation ID to response headers
      c.header('X-Correlation-ID', correlationId);

      // Get response size if available
      const responseLength = c.res.headers.get('Content-Length');
      const responseSize = responseLength ? parseInt(responseLength, 10) : 0;

      // Determine log level based on status
      const isError = status >= 500;
      const isClientError = status >= 400 && status < 500;
      const isRedirect = status >= 300 && status < 400;

      if (skipLogging && !isError) {
        // Skip logging for successful health checks and static assets
        return;
      }

      const logData = {
        method,
        path,
        status,
        durationMs: duration,
        ...(logBody && responseSize > 0 && { responseSize: formatBytes(responseSize) }),
      };

      // Format duration for display
      const durationStr = duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(2)}s`;

      if (isError) {
        log.error(
          `✗ ${method} ${path} ${status} ${durationStr}`,
          undefined,
          logData,
          correlationId
        );
      } else if (isClientError) {
        // Log 4xx as warnings (client errors are expected)
        log.warn(`← ${method} ${path} ${status} ${durationStr}`, logData, correlationId);
      } else {
        // Success or redirect
        const symbol = isRedirect ? '↪' : '←';
        log.info(`${symbol} ${method} ${path} ${status} ${durationStr}`, logData, correlationId);
      }
    };

    // Try to use async context for correlation ID propagation
    // This allows nested service calls to access the correlation ID
    await withCorrelationId(correlationId, executeRequest);
  };
}

/**
 * Get correlation ID from Hono context
 * Use this in route handlers to access the current request's correlation ID
 */
export function getRequestCorrelationId(c: { get: (key: string) => unknown }): string | undefined {
  return (c.get('correlationId') as string) || getCorrelationId();
}

export default requestLogger;
