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
  '/',
  createProxyMiddleware({
    target: 'http://localhost:8080',
    changeOrigin: false,
    logLevel: 'trace',
    on: {
      proxyReq: logProxyReq,
    },
    pathFilter:['/api', '/login', '/logout', '/oauth2', '/api-docs', '/swagger-ui', '/admin']
  })
);

// Proxy configuration for WebSocket
app.use(
  createProxyMiddleware({
    target: 'http://localhost:8080/',
    ws: true,
    pathFilter: '/ws',
    on: {
      proxyReq: (proxyReq, req, res) => {
        console.log(`Proxying ws request to: ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
      },
    },
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
    on: {
      proxyReq: logProxyReq,
    },
  })
);

app.listen(PORT, () => {
  console.log(`Dev proxy server is running on http://localhost:${PORT}`);
});
