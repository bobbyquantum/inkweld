import { createServer } from 'http';
import request from 'supertest';
import { WebSocketServer } from 'ws';

import { createPersistenceAdapter } from './persistence';
import { createApiProxy, createFrontendProxy } from './proxy-middleware';
import app from './server';
import { setPersistence } from './utils';
import { WebSocketHandler } from './websocket-handler';

jest.mock('./proxy-middleware');
jest.mock('./websocket-handler');
jest.mock('./utils');
jest.mock('./persistence');

describe('Server', () => {
  let server;
  let wsServer;

  beforeAll(() => {
    server = createServer(app);
    wsServer = new WebSocketServer({ noServer: true });
    server.on('upgrade', (request, socket, head) => {
      wsServer.handleUpgrade(request, socket, head, ws => {
        wsServer.emit('connection', ws, request);
      });
    });
  });

  afterAll(() => {
    server.close();
    wsServer.close();
  });

  it('should respond to HTTP requests', async () => {
    const response = await request(server).get('/');
    expect(response.status).toBe(200);
  });

  it('should proxy API requests', async () => {
    const apiProxy = createApiProxy();
    const response = await request(server).get('/api/test');
    expect(apiProxy).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('should proxy frontend requests', async () => {
    const frontendProxy = createFrontendProxy();
    const response = await request(server).get('/frontend/test');
    expect(frontendProxy).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('should handle WebSocket connections', done => {
    const wsHandler = new WebSocketHandler();
    const ws = new WebSocket('ws://localhost:8333/ws/yjs/test');
    ws.on('open', () => {
      expect(wsHandler.handleUpgrade).toHaveBeenCalled();
      ws.close();
      done();
    });
  });

  it('should set up persistence', () => {
    const persistence = createPersistenceAdapter();
    expect(setPersistence).toHaveBeenCalledWith(persistence);
  });
});
