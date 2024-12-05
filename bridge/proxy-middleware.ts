import { NextFunction, Request, Response } from 'express';
import { ClientRequest } from 'http';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';

// Function to log the proxied request URL
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
export const createApiProxy = () => {
  const proxy = createProxyMiddleware({
    target: 'http://localhost:8080',
    changeOrigin: false,
    onProxyReq: logProxyReq,
  } as Options);

  // Return a void function that handles the proxy
  return function proxyHandler(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    void proxy(req, res, next);
  };
};

export const createFrontendProxy = () => {
  const proxy = createProxyMiddleware({
    target: 'http://localhost:4200',
    changeOrigin: true,
    ws: true,
    onProxyReq: logProxyReq,
  } as Options);

  // Return a void function that handles the proxy
  return function proxyHandler(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    void proxy(req, res, next);
  };
};

// URL path preserving middleware
export const preserveOriginalUrl = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  req.url = req.originalUrl; // Preserve the original URL
  next();
};

// WebSocket path checking middleware
export const skipWebSocketPaths = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (req.url.startsWith('/ws')) {
    next('route'); // Skip proxying for these paths
  } else {
    next();
  }
};
