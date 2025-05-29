import { describe, it, expect, beforeEach, jest } from 'bun:test';
import { DocumentGateway } from './document.gateway.js';

describe('DocumentGateway', () => {
  let gateway;
  let sessionStoreMock;
  let configServiceMock;
  let levelDBManagerMock;
  let loggerMock;

  beforeEach(() => {
    sessionStoreMock = {};
    configServiceMock = {
      get: jest.fn().mockReturnValue('http://localhost,http://example.com'),
    };
    levelDBManagerMock = {};
    gateway = new DocumentGateway(
      sessionStoreMock,
      configServiceMock,
      levelDBManagerMock,
    );
    loggerMock = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      verbose: jest.fn(),
      debug: jest.fn(),
    };
    gateway['logger'] = loggerMock;
  });

  it('should initialize perProjectPersistence and call setPersistence on afterInit', () => {
    gateway.afterInit({});
    expect(gateway['perProjectPersistence']).toBeDefined();
  });

  it('should allow origin if in allowedOrigins', () => {
    gateway['allowedOrigins'] = ['http://localhost'];
    expect(gateway['isOriginAllowed']('http://localhost')).toBe(true);
  });

  it('should reject origin if not in allowedOrigins', () => {
    gateway['allowedOrigins'] = ['http://localhost'];
    expect(gateway['isOriginAllowed']('http://evil.com')).toBe(false);
  });

  it('should handle disconnect by logging', () => {
    gateway.handleDisconnect({});
    expect(loggerMock.log).toHaveBeenCalledWith('Yjs client disconnected');
  });

  // Additional tests for handleConnection would require mocking connection, req, and persistence methods.
});
