import express from 'express';
import { createServer, IncomingMessage } from 'http';
import { Duplex } from 'stream';
import { setPersistence } from 'y-websocket/bin/utils';

import { createPersistenceAdapter } from './persistence.js';
import {
  createApiProxy,
  createFrontendProxy,
  preserveOriginalUrl,
  skipWebSocketPaths,
} from './proxy-middleware.js';
import { WebSocketHandler } from './websocket-handler.js';

const app = express();
const PORT = 8333;

// Create HTTP server
const server = createServer(app);

// Set up WebSocket handler
const wsHandler = new WebSocketHandler();

// Configure y-websocket persistence
const persistence = createPersistenceAdapter();
setPersistence(persistence);

// Middleware to log incoming requests
app.use((req, res, next) => {
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

// Proxy configuration for frontend (Angular app)
const frontendProxy = createFrontendProxy();
app.use(skipWebSocketPaths, (req, res, next) => frontendProxy(req, res, next));

// Handle WebSocket upgrade requests
server.on(
  'upgrade',
  (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    wsHandler.handleUpgrade(request, socket, head);
  }
);

// Start the server
server.listen(PORT, () => {
  console.log(`Bridge server is running on http://localhost:${PORT}`);
});
