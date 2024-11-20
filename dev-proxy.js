const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = 8333;

// Middleware to log incoming requests
app.use((req, res, next) => {
  console.log(`Received request for: ${req.originalUrl}`);
  next();
});

// Function to log the proxied request URL
const logProxyReq = (proxyReq, req, res) => {
  console.log(`Proxying request to: ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
};

// Proxy configuration for API and related routes
app.use(
  '/api',
  createProxyMiddleware({
    target: 'http://localhost:8080/api',
    changeOrigin: true,
    logLevel: 'trace',
    onProxyRes: logProxyReq,
  })
);
app.use(
  '/login',
  createProxyMiddleware({
    target: 'http://localhost:8080/login',
    changeOrigin: true,
    logLevel: 'trace',
    onProxyRes: logProxyReq,
  })
);
app.use(
  '/logout',
  createProxyMiddleware({
    target: 'http://localhost:8080/logout',
    changeOrigin: true,
    logLevel: 'trace',
    onProxyRes: logProxyReq,
  })
);
app.use(
  '/oauth2',
  createProxyMiddleware({
    target: 'http://localhost:8080/oauth2',
    changeOrigin: true,
    logLevel: 'trace',
    onProxyRes: logProxyReq,
  })
);
app.use(
  '/api-docs',
  createProxyMiddleware({
    target: 'http://localhost:8080/api-docs',
    changeOrigin: true,
    logLevel: 'trace',
    onProxyRes: logProxyReq,
  })
);
app.use(
  '/swagger-ui',
  createProxyMiddleware({
    target: 'http://localhost:8080/swagger-ui',
    changeOrigin: true,
    logLevel: 'trace',
    onProxyRes: logProxyReq,
  })
);
app.use(
  '/admin',
  createProxyMiddleware({
    target: 'http://localhost:8080/admin',
    changeOrigin: true,
    logLevel: 'trace',
    onProxyRes: logProxyReq,
  })
);
// Proxy configuration for WebSocket
app.use(
  '/ws',
  createProxyMiddleware({
    target: 'http://localhost:8080/ws',
    ws: true,
    changeOrigin: true,
    onProxyReq: logProxyReq,
  })
);

// Serve Angular app
app.use(
  '/',
  createProxyMiddleware({
    target: 'http://localhost:4200',
    changeOrigin: true,
    ws: true,
    logLevel: 'debug',
    onProxyReq: logProxyReq,
  })
);

app.listen(PORT, () => {
  console.log(`Dev proxy server is running on http://localhost:${PORT}`);
});
