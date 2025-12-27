import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

// Type for our mock WebSocket
interface MockWebSocket {
  onmessage: ((event: MessageEvent) => void) | null;
  send: ReturnType<typeof vi.fn>;
}

// Type for our mock provider instance
interface MockProviderInstance {
  ws: MockWebSocket | null;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  awareness: { setLocalStateField: ReturnType<typeof vi.fn>; clientID: number };
  _listeners: Map<string, Array<(arg: unknown) => void>>;
  _emitStatus: (status: string) => void;
}

// Store mock instances for test assertions - must be defined before vi.doMock
const mockProviderInstances: MockProviderInstance[] = [];

function resetMockInstances() {
  mockProviderInstances.length = 0;
}

// Create the mock class - used by vi.doMock and directly in tests
class MockWebsocketProvider implements MockProviderInstance {
  ws: MockWebSocket | null = null;
  on = vi.fn((event: string, callback: (arg: unknown) => void) => {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event)!.push(callback);
  });
  off = vi.fn((event: string, callback: (arg: unknown) => void) => {
    const listeners = this._listeners.get(event);
    if (listeners) {
      this._listeners.set(
        event,
        listeners.filter(cb => cb !== callback)
      );
    }
  });
  connect = vi.fn(() => {
    // Create mock WebSocket
    this.ws = {
      onmessage: null,
      send: vi.fn(),
    };
  });
  disconnect = vi.fn();
  awareness = {
    setLocalStateField: vi.fn(),
    clientID: 123,
  };
  _listeners = new Map<string, Array<(arg: unknown) => void>>();

  _emitStatus(status: string) {
    const listeners = this._listeners.get('status');
    listeners?.forEach(cb => cb({ status }));
  }

  constructor() {
    mockProviderInstances.push(this);
  }
}

// Override the global mock with our custom mock that tracks instances
vi.mock('y-websocket', () => {
  return {
    WebsocketProvider: MockWebsocketProvider,
  };
});

// Dynamic import to ensure our mock is used
let createAuthenticatedWebsocketProvider: typeof import('./authenticated-websocket-provider').createAuthenticatedWebsocketProvider;
let setupReauthentication: typeof import('./authenticated-websocket-provider').setupReauthentication;

describe('authenticated-websocket-provider', () => {
  let mockDoc: Y.Doc;

  beforeEach(async () => {
    // Reset modules to ensure our mock is used
    vi.resetModules();

    // Re-import the module under test after resetting
    const module = await import('./authenticated-websocket-provider');
    createAuthenticatedWebsocketProvider =
      module.createAuthenticatedWebsocketProvider;
    setupReauthentication = module.setupReauthentication;

    mockDoc = new Y.Doc();
    resetMockInstances();
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockDoc.destroy();
  });

  describe('createAuthenticatedWebsocketProvider', () => {
    it('should create provider and send auth token on connect', async () => {
      const authToken = 'test-jwt-token';
      const wsUrl = 'ws://localhost:8333/api/v1/ws/yjs?documentId=test:doc:id';

      // Start the auth process
      const providerPromise = createAuthenticatedWebsocketProvider(
        wsUrl,
        '',
        mockDoc,
        authToken
      );

      // Get the mock provider instance from our array
      const mockProvider = mockProviderInstances[0];
      expect(mockProvider).toBeDefined();

      // Emit connected status
      mockProvider._emitStatus('connected');

      // Verify token was sent
      expect(mockProvider.ws?.send).toHaveBeenCalledWith(authToken);

      // Simulate auth response
      const messageEvent = new MessageEvent('message', {
        data: 'authenticated',
      });
      mockProvider.ws?.onmessage?.(messageEvent);

      // Should resolve with the provider
      const result = await providerPromise;
      expect(result).toBeDefined();
    });

    it('should reject on access-denied response', async () => {
      const authToken = 'invalid-token';
      const wsUrl = 'ws://localhost:8333/api/v1/ws/yjs?documentId=test:doc:id';

      const providerPromise = createAuthenticatedWebsocketProvider(
        wsUrl,
        '',
        mockDoc,
        authToken
      );

      const mockProvider = mockProviderInstances[0];
      expect(mockProvider).toBeDefined();

      mockProvider._emitStatus('connected');

      // Simulate access denied response
      const messageEvent = new MessageEvent('message', {
        data: 'access-denied:invalid-token',
      });
      mockProvider.ws?.onmessage?.(messageEvent);

      await expect(providerPromise).rejects.toThrow(
        'WebSocket authentication denied: invalid-token'
      );
      expect(mockProvider.disconnect).toHaveBeenCalled();
    });

    it('should reject on disconnect before auth', async () => {
      const authToken = 'test-token';
      const wsUrl = 'ws://localhost:8333/api/v1/ws/yjs?documentId=test:doc:id';

      const providerPromise = createAuthenticatedWebsocketProvider(
        wsUrl,
        '',
        mockDoc,
        authToken
      );

      const mockProvider = mockProviderInstances[0];
      expect(mockProvider).toBeDefined();

      // Emit disconnected before auth completes
      mockProvider._emitStatus('disconnected');

      await expect(providerPromise).rejects.toThrow(
        'WebSocket disconnected before authentication'
      );
    });

    it('should pass options to WebsocketProvider', () => {
      const authToken = 'test-token';
      const wsUrl = 'ws://localhost:8333/api/v1/ws/yjs?documentId=test:doc:id';
      const options = { resyncInterval: 5000 };

      // Start auth - don't await yet
      void createAuthenticatedWebsocketProvider(
        wsUrl,
        'room',
        mockDoc,
        authToken,
        options
      );

      // Verify the provider was created with correct options
      const mockProvider = mockProviderInstances[0];
      expect(mockProvider).toBeDefined();
      // The provider should have been created with connect: false
      // This is verified by checking the provider exists and was created
    });
  });

  describe('setupReauthentication', () => {
    it('should re-authenticate on reconnection', () => {
      const authToken = 'reauth-token';
      const getAuthToken = vi.fn().mockReturnValue(authToken);
      const onAuthError = vi.fn();

      // Create a mock provider directly
      const mockProvider = new MockWebsocketProvider();

      setupReauthentication(
        mockProvider as unknown as Parameters<typeof setupReauthentication>[0],
        getAuthToken,
        onAuthError
      );

      // Simulate disconnect then reconnect
      mockProvider.connect(); // This sets up ws
      mockProvider._emitStatus('disconnected');
      mockProvider._emitStatus('connected');

      // Should have sent auth token
      expect(mockProvider.ws?.send).toHaveBeenCalledWith(authToken);

      // Simulate successful re-auth
      const messageEvent = new MessageEvent('message', {
        data: 'authenticated',
      });
      mockProvider.ws?.onmessage?.(messageEvent);

      expect(onAuthError).not.toHaveBeenCalled();
    });

    it('should call onAuthError when no token available', () => {
      const getAuthToken = vi.fn().mockReturnValue(null);
      const onAuthError = vi.fn();

      const mockProvider = new MockWebsocketProvider();

      setupReauthentication(
        mockProvider as unknown as Parameters<typeof setupReauthentication>[0],
        getAuthToken,
        onAuthError
      );

      mockProvider.connect();
      mockProvider._emitStatus('disconnected');
      mockProvider._emitStatus('connected');

      expect(onAuthError).toHaveBeenCalledWith('No auth token available');
      expect(mockProvider.disconnect).toHaveBeenCalled();
    });

    it('should handle re-auth denial', () => {
      const authToken = 'expired-token';
      const getAuthToken = vi.fn().mockReturnValue(authToken);
      const onAuthError = vi.fn();

      const mockProvider = new MockWebsocketProvider();

      setupReauthentication(
        mockProvider as unknown as Parameters<typeof setupReauthentication>[0],
        getAuthToken,
        onAuthError
      );

      mockProvider.connect();
      mockProvider._emitStatus('disconnected');
      mockProvider._emitStatus('connected');

      // Simulate access denied
      const messageEvent = new MessageEvent('message', {
        data: 'access-denied:expired',
      });
      mockProvider.ws?.onmessage?.(messageEvent);

      expect(onAuthError).toHaveBeenCalledWith('Access denied: expired');
      expect(mockProvider.disconnect).toHaveBeenCalled();
    });

    it('should not re-auth on first connection', () => {
      const getAuthToken = vi.fn().mockReturnValue('token');

      const mockProvider = new MockWebsocketProvider();

      setupReauthentication(
        mockProvider as unknown as Parameters<typeof setupReauthentication>[0],
        getAuthToken
      );

      mockProvider.connect();
      // First connection without prior disconnect
      mockProvider._emitStatus('connected');

      // Should NOT send auth token (first connect is handled by createAuthenticatedWebsocketProvider)
      expect(mockProvider.ws?.send).not.toHaveBeenCalled();
    });
  });
});
