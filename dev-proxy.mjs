import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createRequire } from 'module';
import { setupWSConnection } from 'y-websocket/bin/utils';

const app = express();
const PORT = 8333;

// Create HTTP server
const server = createServer(app);

// Set up WebSocket server for y-websocket
const wss = new WebSocketServer({ noServer: true });

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`Received request for: ${req.originalUrl}`);
  next();
});

// Function to log the proxied request URL
const logProxyReq = (proxyReq, req, res) => {
  console.log(
    `Proxying request to: ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`
  );
};

// Proxy configuration for API and related routes
app.use(
  ['/api', '/login', '/logout', '/oauth2', '/api-docs', '/swagger-ui', '/admin'],
  (req, res, next) => {
    req.url = req.originalUrl; // Preserve the original URL
    next();
  },
  createProxyMiddleware({
    target: 'http://localhost:8080',
    changeOrigin: false,
    logLevel: 'trace',
    onProxyReq: logProxyReq,
  })
);

// Proxy configuration for WebSocket connections to the backend
// app.use(
//   '/ws',
//   createProxyMiddleware({
//     target: 'http://localhost:8080',
//     ws: true,
//     logLevel: 'debug',
//     onProxyReqWs: (proxyReq, req, socket, options, head) => {
//       console.log(`Proxying WebSocket request to: ${options.target}${req.url}`);
//     },
//   })
// );

// Proxy configuration for frontend (Angular app)
app.use(
  (req, res, next) => {
    if (req.url.startsWith('/ws')) {
      next('route'); // Skip proxying for these paths
    } else {
      next();
    }
  },
  createProxyMiddleware({
    target: 'http://localhost:4200',
    changeOrigin: true,
    ws: true,
    logLevel: 'debug',
    onProxyReq: logProxyReq,
  })
);

server.on('upgrade', (request, socket, head) => {
  const pathname = request.url;

  console.log(`Received upgrade request for: ${pathname}`);
  if (pathname.startsWith('/ws/yjs')) {
    let docName = pathname.slice(8); // Remove '/ws/yjs'
    wss.handleUpgrade(request, socket, head, (ws) => {
      setupWSConnection(ws, request, { docName, gc: true });
    });
  } else {
    // Let Express handle other upgrade requests
  }
});


// Start the server
server.listen(PORT, () => {
  console.log(`Dev proxy server is running on http://localhost:${PORT}`);
});
