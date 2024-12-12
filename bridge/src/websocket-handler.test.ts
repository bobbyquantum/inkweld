import { Duplex } from 'stream';

import { setupWSConnection } from './utils';
import { UpgradeRequest, WebSocketHandler } from './websocket-handler';

jest.mock('./utils');

describe('WebSocketHandler', () => {
  let handler: WebSocketHandler;
  let mockRequest: UpgradeRequest;
  let mockSocket: Duplex;
  let mockHead: Buffer;

  beforeEach(() => {
    handler = new WebSocketHandler();
    mockRequest = {
      url: '/ws/yjs/test',
    } as UpgradeRequest;
    mockSocket = {} as Duplex;
    mockHead = Buffer.from('');
  });

  it('should handle WebSocket upgrade requests', () => {
    handler.handleUpgrade(mockRequest, mockSocket, mockHead);
    expect(setupWSConnection).toHaveBeenCalled();
  });

  it('should log error for requests without URL', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockRequest.url = '';
    handler.handleUpgrade(mockRequest, mockSocket, mockHead);
    expect(consoleErrorSpy).toHaveBeenCalledWith('No URL in upgrade request');
    consoleErrorSpy.mockRestore();
  });

  it('should log for non y-websocket upgrade requests', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    mockRequest.url = '/not/yjs';
    handler.handleUpgrade(mockRequest, mockSocket, mockHead);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'Not a y-websocket upgrade request'
    );
    consoleLogSpy.mockRestore();
  });

  it('should validate cookie for y-websocket upgrade requests', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    handler.handleUpgrade(mockRequest, mockSocket, mockHead);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[DUMMY] Validating cookie for document: /test'
    );
    consoleLogSpy.mockRestore();
  });
});
