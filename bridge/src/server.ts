import express from 'express';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import httpProxy from 'http-proxy';
import { Duplex } from 'stream';

import { createPersistenceAdapter } from './persistence.js';
import {
  createApiProxy,
  createFrontendProxy,
  preserveOriginalUrl,
  skipWebSocketPaths,
} from './proxy-middleware.js';
import { setPersistence } from './utils';
import { WebSocketHandler } from './websocket-handler.js';

const app = express();
const PORT = 8333;

// Create HTTP server
const server = createServer(app);

const wsHandler = new WebSocketHandler();

// Configure y-websocket persistence
const persistence = createPersistenceAdapter();
setPersistence(persistence);

// Middleware to log incoming requests
app.use((req, _res, next) => {
  console.log(`Received request for: ${req.originalUrl}`);
  next();
});

// Proxy configuration for API and related routes
const apiProxy = createApiProxy();
app.use(
  [
    '/api',
    '/login',
    '/logout',
    '/oauth2',
    '/api-docs',
    '/swagger-ui',
    '/admin',
  ],
  preserveOriginalUrl,
  (req, res, next) => apiProxy(req, res, next)
);

const frontendProxy = createFrontendProxy();
app.use(skipWebSocketPaths, (req, res, next) => frontendProxy(req, res, next));

const viteHmrProxy = httpProxy.createProxyServer({
  target: 'http://localhost:4200',
  ws: true,
});

viteHmrProxy.on('error', (err, req, res) => {
  console.error('Vite HMR Proxy Error:', err);

  if (res instanceof ServerResponse && !res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Proxy error');
  } else if ('end' in res && typeof res.end === 'function') {
    res.end();
  } else {
    console.error('Unknown response type in proxy error handler.');
  }
});

// Handle WebSocket upgrade requests
server.on(
  'upgrade',
  (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = request.url || '';

    if (url.startsWith('/ws')) {
      wsHandler.handleUpgrade(request, socket, head);
    } else if (url.startsWith('/@vite/client')) {
      viteHmrProxy.ws(request, socket, head);
    } else {
      console.log(`Rejecting WebSocket upgrade for: ${url}`);
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
    }
  }
);

// Start the server
server.listen(PORT, () => {
  console.log(`Bridge server is running on http://localhost:${PORT}`);
});
