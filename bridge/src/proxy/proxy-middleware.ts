import { NextFunction, Request, Response } from 'express';
import { ClientRequest } from 'http';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';

const logProxyReq = (
  proxyReq: ClientRequest,
  _req: Request,
  _res: Response
) => {
  console.log(
    `Proxying request to: ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`
  );
};

export const createApiProxy = () => {
  const proxy = createProxyMiddleware({
    target: 'http://localhost:8080',
    changeOrigin: false,
    onProxyReq: logProxyReq,
  } as Options);

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
    onProxyReq: logProxyReq,
  } as Options);

  return function proxyHandler(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    void proxy(req, res, next);
  };
};

export const preserveOriginalUrl = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  req.url = req.originalUrl;
  next();
};

export const skipWebSocketPaths = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (req.url.startsWith('/ws')) {
    next('route');
  } else {
    next();
  }
};
