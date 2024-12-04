import express, { NextFunction, Request, Response } from 'express';
import { createServer, IncomingMessage } from 'http';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { WebSocket, WebSocketServer } from 'ws';
import { setPersistence, setupWSConnection } from 'y-websocket/bin/utils';
import * as Y from 'yjs';

const app = express();
const PORT = 8333;

// Create HTTP server
const server = createServer(app);

// Set up WebSocket server for y-websocket
const wss = new WebSocketServer({ noServer: true });

// In-memory store for document states
const documentStates = new Map<string, Uint8Array>();

// Configure y-websocket persistence
setPersistence({
  bindState: (docName: string, ydoc: Y.Doc) => {
    console.log(`[DUMMY] Binding state for document: ${docName}`);

    // Simple validation with just the document ID
    console.log('[DUMMY] Validating access for:', {
      id: docName,
      type: 'DOCUMENT',
    });

    // Set initial content if document is new
    if (!documentStates.has(docName)) {
      // Create initial content using YJS types
      const ytext = ydoc.getText('content');
      ytext.insert(0, 'Welcome to your new document!\n\nStart typing here...');

      // Store the initial state
      const initialState = Y.encodeStateAsUpdate(ydoc);
      documentStates.set(docName, initialState);
      console.log(`[DUMMY] Created new document with initial content`);
    }

    // Apply stored state if it exists
    const state = documentStates.get(docName);
    if (state) {
      try {
        Y.applyUpdate(ydoc, state);
        console.log(`[DUMMY] Applied stored state for ${docName}`);
      } catch (err) {
        console.error(`[DUMMY] Error applying state:`, err);
      }
    }

    // Listen to document updates
    ydoc.on('update', (update: Uint8Array) => {
      // Store the update in memory
      documentStates.set(docName, update);
      console.log(`[DUMMY] Stored update for ${docName}`, {
        updateLength: update.length,
        timestamp: new Date().toISOString(),
      });
    });
  },
  writeState: (docName: string, ydoc: Y.Doc) => {
    return new Promise<void>(resolve => {
      console.log(`[DUMMY] Writing final state for document: ${docName}`);

      // Get the final state using Y.encodeStateAsUpdate
      const finalState = Y.encodeStateAsUpdate(ydoc);
      documentStates.set(docName, finalState);

      console.log('[DUMMY] Saved final state:', {
        docName,
        stateSize: finalState.length,
        timestamp: new Date().toISOString(),
        status: 'saved',
      });

      resolve();
    });
  },
});

// Middleware to log incoming requests
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`Received request for: ${req.originalUrl}`);
  next();
});

// Function to log the proxied request URL
import { ClientRequest } from 'http';
import { Duplex } from 'stream';

const logProxyReq = (
  proxyReq: ClientRequest,
  _req: Request,
  _res: Response
) => {
  console.log(
    `Proxying request to: ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`
  );
};

// Create proxy middleware wrappers that return void
const createApiProxy = () => {
  const proxy = createProxyMiddleware({
    target: 'http://localhost:8080',
    changeOrigin: false,
    onProxyReq: logProxyReq,
  } as Options);

  return (req: Request, res: Response, next: NextFunction) => {
    return proxy(req, res, next);
  };
};

const createFrontendProxy = () => {
  const proxy = createProxyMiddleware({
    target: 'http://localhost:4200',
    changeOrigin: true,
    ws: true,
    onProxyReq: logProxyReq,
  } as Options);

  return (req: Request, res: Response, next: NextFunction) => {
    return proxy(req, res, next);
  };
};

// Proxy configuration for API and related routes
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
  (req: Request, res: Response, next: NextFunction) => {
    req.url = req.originalUrl; // Preserve the original URL
    next();
  },
  () => createApiProxy()
);

// Proxy configuration for frontend (Angular app)
app.use(
  (req: Request, res: Response, next: NextFunction) => {
    if (req.url.startsWith('/ws')) {
      next('route'); // Skip proxying for these paths
    } else {
      next();
    }
  },
  () => createFrontendProxy()
);

interface UpgradeRequest extends IncomingMessage {
  url: string;
}

server.on(
  'upgrade',
  (request: UpgradeRequest, socket: Duplex, head: Buffer) => {
    const pathname = request.url;

    console.log(`Received upgrade request for: ${pathname}`);
    if (pathname.startsWith('/ws/yjs')) {
      const docName = pathname.slice(8); // Remove '/ws/yjs'

      // Simulate cookie validation
      console.log(`[DUMMY] Validating cookie for document: ${docName}`);

      // Set up websocket connection
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        setupWSConnection(ws, request, { docName, gc: true });
      });
    } else {
      // Let Express handle other upgrade requests
    }
  }
);

// Start the server
server.listen(PORT, () => {
  console.log(`Bridge server is running on http://localhost:${PORT}`);
});
