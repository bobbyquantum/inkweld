/**
 * Bun-specific app configuration using native bun:sqlite
 * This file imports Bun-only modules and should only be used in Bun runtime
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { requestLogger } from './middleware/request-logger';
import { logger } from './services/logger.service';
import { websocket } from 'hono/bun';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config/env';
import { errorHandler } from './middleware/error-handler';
import {
  bunSqliteDatabaseMiddleware,
  type BunSqliteAppContext,
} from './middleware/database.bun-sqlite.middleware';
import { setupBunDatabase } from './db/bun-sqlite';

// Import common route registration + specialized routes
import { registerCommonRoutes } from './config/routes';
import yjsRoutes from './routes/yjs.routes';

// Import frontend assets for embedding (only used in compiled mode)
let getFrontendAssets: (() => Map<string, string>) | undefined;
let getAllFrontendAssets: (() => Map<string, string>) | undefined;
try {
  // Try generated imports first (has all assets)
  const generatedModule = await import('./.frontend-imports-generated');
  getAllFrontendAssets = generatedModule.getAllFrontendAssets;
} catch {
  // Fall back to manual imports
  try {
    const frontendModule = await import('./frontend-assets');
    getFrontendAssets = frontendModule.getFrontendAssets;
  } catch {
    // Not in embedded mode, that's fine
  }
}

const app = new OpenAPIHono<BunSqliteAppContext>();

// Detect if running as compiled binary
const isCompiled = typeof Bun.main === 'string' && !Bun.main.includes('node_modules');

// Check for embedded frontend files (when compiled with frontend assets)
let embeddedFrontendFiles: Map<string, string | Blob> | null = null;

if (isCompiled) {
  // First, try to get all generated assets
  if (getAllFrontendAssets) {
    const assets = getAllFrontendAssets();
    if (assets.size > 0) {
      logger.info('SPA', `Loaded ${assets.size} assets from generated imports`);
      embeddedFrontendFiles = assets;
    }
  }
  // Fall back to explicitly imported assets
  else if (getFrontendAssets) {
    const assets = getFrontendAssets();
    if (assets.size > 0) {
      logger.info('SPA', `Loaded ${assets.size} explicitly imported frontend assets`);
      embeddedFrontendFiles = assets;
    }
  }

  // Then, add any additional assets from Bun.embeddedFiles
  const bunEmbedded = (Bun.embeddedFiles || [])
    .filter((f) => {
      const name = f.name || '';
      // Include files that look like frontend assets
      return (
        name.endsWith('.html') ||
        name.endsWith('.js') ||
        name.endsWith('.css') ||
        name.endsWith('.png') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.svg') ||
        name.endsWith('.ico') ||
        name.endsWith('.webp') ||
        name.endsWith('.woff') ||
        name.endsWith('.woff2') ||
        name.endsWith('.ttf') ||
        name.endsWith('.json') ||
        name.endsWith('.webmanifest') ||
        name.endsWith('.wasm')
      );
    })
    .map((f) => [f.name, f] as [string, Blob]);

  if (bunEmbedded.length > 0) {
    if (!embeddedFrontendFiles) {
      embeddedFrontendFiles = new Map();
    }
    bunEmbedded.forEach(([name, blob]) => embeddedFrontendFiles.set(name, blob));
    logger.info('SPA', `Added ${bunEmbedded.length} files from Bun.embeddedFiles`);
  }

  if (embeddedFrontendFiles && embeddedFrontendFiles.size > 0) {
    logger.info('SPA', `Total embedded files: ${embeddedFrontendFiles.size}`);
    // Log a few sample keys to debug path matching
    const sampleKeys = Array.from(embeddedFrontendFiles.keys()).slice(0, 5);
    logger.debug('SPA', 'Sample keys:', { sampleKeys });
  }
}

const frontendDistPath = process.env.FRONTEND_DIST;
const hasEmbeddedFrontend = embeddedFrontendFiles && embeddedFrontendFiles.size > 0;
const hasExternalFrontend = frontendDistPath && existsSync(join(frontendDistPath, 'index.html'));
// SPA is enabled only if frontend assets exist AND serving is not disabled
const spaEnabled = config.serveFrontend && (hasEmbeddedFrontend || hasExternalFrontend);

if (!config.serveFrontend) {
  logger.info('SPA', 'Frontend serving disabled via SERVE_FRONTEND=false');
}

const SPA_BYPASS_PREFIXES = ['/api', '/health', '/lint', '/image', '/mcp'];

// Global middleware
app.use('*', requestLogger());
app.use('*', prettyJSON());
app.use('*', secureHeaders());

// Database middleware - attaches Bun SQLite DB instance to context
app.use('*', bunSqliteDatabaseMiddleware);

// OAuth/MCP discovery endpoints need permissive CORS since MCP clients (like Claude.ai)
// need to fetch them from any origin. These endpoints are public metadata.
app.use('/.well-known/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }));
// OAuth endpoints need permissive CORS for MCP clients from any origin
// Use wildcard to ensure all OAuth paths are covered
app.use(
  '/oauth/*',
  cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] })
);
// Also allow /register alias (some MCP clients use this)
app.use('/register', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'] }));
app.use(
  '/api/v1/ai/mcp',
  cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] })
);
app.use(
  '/api/v1/ai/mcp/*',
  cors({ origin: '*', allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] })
);

// CORS configuration for other routes
const allowedOrigins = config.allowedOrigins;
app.use('*', async (c, next) => {
  // Skip if already handled by permissive CORS above
  const path = c.req.path;
  if (
    path.startsWith('/.well-known/') ||
    path.startsWith('/oauth/') ||
    path === '/register' ||
    path.startsWith('/api/v1/ai/mcp')
  ) {
    return next();
  }

  const corsMiddleware = cors({
    origin: allowedOrigins,
    credentials: true, // Enable credentials for session-based auth
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-TOKEN'],
    exposeHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600, // Cache preflight for 10 minutes,
  });

  return corsMiddleware(c, next);
});

// Simple ping endpoint for debugging routing issues (registered before SPA handler)
app.get('/api/v1/ping', (c) => {
  return c.json({
    pong: true,
    timestamp: new Date().toISOString(),
    spaEnabled,
    hasExternalFrontend,
    hasEmbeddedFrontend,
  });
});

// Register common routes
registerCommonRoutes(app);

// Bun-specific: WebSocket routes for Yjs collaboration
app.route('/api/v1/ws', yjsRoutes);

// Root route only when SPA assets are not bundled
if (!spaEnabled) {
  app.get('/', (c) => {
    return c.json({
      name: 'Inkweld API (Bun)',
      version: config.version,
      status: 'running',
    });
  });
}

// API documentation
app.get('/api', (c) => {
  return c.json({
    message: 'Inkweld API - Hono version (Bun)',
    version: config.version,
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      projects: '/api/v1/projects',
      documents: '/api/v1/projects/:username/:slug/docs',
      elements: '/api/v1/projects/:username/:slug/elements',
      epub: '/api/v1/projects/:username/:slug/epub',
      images: '/api/v1/images',
      snapshots: '/api/v1/snapshots',
      health: '/api/v1/health',
      config: '/api/v1/config',
      csrf: '/api/v1/csrf',
      lint: '/api/v1/lint',
      aiImage: '/api/v1/image',
      mcp: '/api/v1/mcp',
      websocket: '/api/v1/ws',
    },
  });
});

// OpenAPI documentation - must be registered AFTER all routes
app.get('/api/openapi.json', (c) => {
  return c.json(
    app.getOpenAPIDocument({
      openapi: '3.0.0',
      info: {
        title: 'Inkweld API',
        version: '1.0.0',
        description: 'Collaborative creative writing platform API (Bun)',
      },
      servers: [
        {
          url: 'http://localhost:8333',
          description: 'Local development server',
        },
      ],
      security: [{ bearerAuth: [] }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'JWT token obtained from POST /api/v1/auth/login. Include as: Authorization: Bearer <token>',
          },
        },
      },
    })
  );
});

if (spaEnabled) {
  // Prefer external frontend (FRONTEND_DIST) over embedded when both are available
  // This is important for Docker where FRONTEND_DIST points to the full built frontend
  // while the embedded frontend may only have index.html without JS bundles
  if (hasExternalFrontend && frontendDistPath) {
    logger.info('SPA', `Using external frontend from: ${frontendDistPath}`);
    const spaHandler = createSpaHandler(frontendDistPath, SPA_BYPASS_PREFIXES);
    app.get('*', spaHandler);
  } else if (hasEmbeddedFrontend && embeddedFrontendFiles) {
    logger.info('SPA', `Using embedded frontend (${embeddedFrontendFiles.size} files)`);
    const spaHandler = createEmbeddedSpaHandler(embeddedFrontendFiles, SPA_BYPASS_PREFIXES);
    app.get('*', spaHandler);
  }
}

// Error handler (must be last)
app.onError(errorHandler);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Initialize database and start server
async function bootstrap() {
  try {
    // In test mode with :memory:, use that; otherwise derive from config.dataPath
    const dbPath =
      process.env.DB_DATABASE === ':memory:'
        ? ':memory:'
        : process.env.DB_PATH || join(config.dataPath, 'inkweld.db');
    await setupBunDatabase(dbPath);
    logger.info('Database', `Bun SQLite database initialized (${dbPath})`);

    const port = config.port;
    logger.info('Server', `Inkweld backend (Bun) ready on port ${port}`);

    // Open browser if requested during setup
    const globals = globalThis as { __openBrowserOnStart?: boolean; __serverPort?: string };
    if (globals.__openBrowserOnStart) {
      const url = `http://localhost:${port}`;
      logger.info('Server', `Opening browser: ${url}`);

      // Use platform-specific open command
      const { spawn } = await import('child_process');
      const platform = process.platform;
      const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';

      spawn(command, [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (error) {
    logger.error('Server', 'Failed to start Bun server', error);
    process.exit(1);
  }
}

// Always initialize database (including in test mode)
bootstrap();

// Build the server config with optional TLS
const serverConfig: {
  port: number;
  fetch: typeof app.fetch;
  websocket: typeof websocket;
  tls?: { cert: ReturnType<typeof Bun.file>; key: ReturnType<typeof Bun.file> };
} = {
  port: config.port,
  fetch: app.fetch,
  websocket, // Required for Bun WebSocket support
};

// Add TLS if enabled and cert files exist
if (config.tls.enabled) {
  const certFile = Bun.file(config.tls.certPath);
  const keyFile = Bun.file(config.tls.keyPath);
  if (certFile.size > 0 && keyFile.size > 0) {
    serverConfig.tls = {
      cert: certFile,
      key: keyFile,
    };
    logger.info('Server', `TLS enabled with cert: ${config.tls.certPath}`);
  } else {
    logger.warn('Server', 'TLS enabled but cert files not found, running without TLS');
  }
}

export default serverConfig;

export { app };

function createSpaHandler(root: string, bypassPrefixes: string[]): MiddlewareHandler {
  const indexFilePath = join(root, 'index.html');
  return async (c, next) => {
    if (c.req.method !== 'GET') {
      return next();
    }

    const pathname = c.req.path;
    if (shouldBypassSpa(pathname, bypassPrefixes)) {
      return next();
    }

    const assetResponse = await serveSpaAsset(root, pathname, c.req.header('Accept-Encoding'));
    if (assetResponse) {
      return assetResponse;
    }

    const indexFile = Bun.file(indexFilePath);
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return next();
  };
}

async function serveSpaAsset(
  root: string,
  pathname: string,
  acceptEncoding?: string
): Promise<Response | null> {
  const relativePath = sanitizeSpaPath(pathname);
  const filePath = join(root, relativePath);

  // Check for pre-compressed Brotli asset if client supports it
  if (acceptEncoding?.includes('br')) {
    const brFilePath = `${filePath}.br`;
    const brFile = Bun.file(brFilePath);
    if (await brFile.exists()) {
      const headers = new Headers();
      headers.set('Content-Type', guessMimeType(relativePath));
      headers.set('Content-Encoding', 'br');
      headers.set(
        'Cache-Control',
        relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
      );
      return new Response(brFile, { headers });
    }
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }

  const headers = new Headers();
  headers.set('Content-Type', file.type || 'application/octet-stream');

  // If the file itself is already compressed (like our large WASM files),
  // we need to tell the browser even if it didn't ask for a .br file
  if (relativePath.endsWith('.wasm')) {
    // Check if it's one of our known large WASM files that we compress in-place
    if (relativePath.includes('typst_ts_web_compiler_bg.wasm')) {
      headers.set('Content-Encoding', 'br');
    }
  }

  headers.set(
    'Cache-Control',
    relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  );

  return new Response(file, { headers });
}

function sanitizeSpaPath(pathname: string): string {
  if (!pathname || pathname === '/') {
    return 'index.html';
  }

  const safeSegments = pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  if (safeSegments.length === 0) {
    return 'index.html';
  }

  return safeSegments.join('/');
}

function shouldBypassSpa(pathname: string, prefixes: string[]): boolean {
  // Normalize path by collapsing multiple slashes (e.g., "//api/v1/health" -> "/api/v1/health")
  const normalizedPath = pathname.replace(/\/+/g, '/');
  return prefixes.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  );
}

function createEmbeddedSpaHandler(
  embeddedFiles: Map<string, string | Blob>,
  bypassPrefixes: string[]
): MiddlewareHandler {
  // Find index.html in embedded files
  logger.debug('SPA', `Searching for index.html in ${embeddedFiles.size} embedded files`);

  let indexFile: string | Blob | undefined;
  for (const [name, content] of embeddedFiles.entries()) {
    const isIndex = name === 'index.html' || name.endsWith('/index.html');
    if (isIndex) {
      logger.debug('SPA', `Found index.html as: ${name}`);
      indexFile = content;
      break;
    }
  }

  if (!indexFile) {
    logger.warn('SPA', 'No index.html found in embedded files', {
      available: Array.from(embeddedFiles.keys()).slice(0, 10),
    });
    return async (c, next) => next();
  }

  return async (c, next) => {
    if (c.req.method !== 'GET') {
      return next();
    }

    const pathname = c.req.path;
    if (shouldBypassSpa(pathname, bypassPrefixes)) {
      return next();
    }

    // Try to serve embedded asset
    const assetResponse = await serveEmbeddedAsset(
      embeddedFiles,
      pathname,
      c.req.header('Accept-Encoding')
    );
    if (assetResponse) {
      return assetResponse;
    }

    // Fall back to index.html for SPA routes
    const content = typeof indexFile === 'string' ? Bun.file(indexFile) : indexFile;
    return new Response(content, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  };
}

async function serveEmbeddedAsset(
  embeddedFiles: Map<string, string | Blob>,
  pathname: string,
  acceptEncoding?: string
): Promise<Response | null> {
  const relativePath = sanitizeSpaPath(pathname);
  logger.debug('SPA', `Looking for asset: "${pathname}" -> "${relativePath}"`);

  // Check for pre-compressed Brotli asset if client supports it
  if (acceptEncoding?.includes('br')) {
    const brPath = `${relativePath}.br`;
    const brFile = embeddedFiles.get(brPath);
    if (brFile) {
      const headers = new Headers();
      headers.set('Content-Type', guessMimeType(relativePath));
      headers.set('Content-Encoding', 'br');
      headers.set(
        'Cache-Control',
        relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
      );
      const content = typeof brFile === 'string' ? Bun.file(brFile) : brFile;
      return new Response(content, { headers });
    }
  }

  // Try exact match first
  let file = embeddedFiles.get(relativePath);

  if (!file) {
    // Try without leading paths
    const basename = relativePath.split('/').pop() || '';
    file = embeddedFiles.get(basename);
    if (file) {
      logger.debug('SPA', `Found by basename: "${basename}"`);
    }
  }

  if (!file) {
    logger.debug('SPA', 'Asset not found', {
      available: Array.from(embeddedFiles.keys()).slice(0, 10),
    });
    return null;
  }

  const headers = new Headers();
  headers.set('Content-Type', guessMimeType(relativePath));

  // WASM files are pre-compressed with Brotli during build (see compress-wasm.js)
  if (relativePath.endsWith('.wasm')) {
    headers.set('Content-Encoding', 'br');
  }

  headers.set(
    'Cache-Control',
    relativePath === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
  );

  const content = typeof file === 'string' ? Bun.file(file) : file;
  return new Response(content, { headers });
}

function guessMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    wasm: 'application/wasm',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

// Function to create and initialize the app for testing
export async function createBunApp() {
  const dbPath =
    process.env.DB_DATABASE === ':memory:'
      ? ':memory:'
      : process.env.DB_PATH || join(config.dataPath, 'inkweld.db');
  await setupBunDatabase(dbPath);
  return app;
}
