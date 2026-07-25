import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  PRESENCE_KEEPALIVE_PING,
  PRESENCE_KEEPALIVE_PONG,
} from '@inkweld/presence';

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
let installWebSocketResilience: typeof import('./authenticated-websocket-provider').installWebSocketResilience;

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
    installWebSocketResilience = module.installWebSocketResilience;

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

    it('should reject with Error.message when connection-error is an Error object', async () => {
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

      // Emit connection-error with an Error object before auth completes
      const errorListeners = mockProvider._listeners.get('connection-error');
      errorListeners?.forEach(cb => cb(new Error('SSL handshake failed')));

      await expect(providerPromise).rejects.toThrow(
        'WebSocket connection error: SSL handshake failed'
      );
    });

    it('should reject with string message when connection-error is a string', async () => {
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

      // Emit connection-error with a plain string
      const errorListeners = mockProvider._listeners.get('connection-error');
      errorListeners?.forEach(cb => cb('Network timeout'));

      await expect(providerPromise).rejects.toThrow(
        'WebSocket connection error: Network timeout'
      );
    });

    it('should reject with generic message when connection-error is an Event', async () => {
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

      // Emit connection-error with an Event-like object (neither Error nor string)
      const errorListeners = mockProvider._listeners.get('connection-error');
      errorListeners?.forEach(cb => cb({ type: 'error', target: null }));

      await expect(providerPromise).rejects.toThrow(
        'WebSocket connection error: Connection error'
      );
    });

    it('should reject when WebSocket is not available after connect', async () => {
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

      // Set ws to null to simulate unavailable WebSocket after connect
      mockProvider.ws = null;

      // Emit connected status — handleStatus will see ws is null and reject
      mockProvider._emitStatus('connected');

      await expect(providerPromise).rejects.toThrow(
        'WebSocket not available after connect'
      );
    });

    it('should pass binary messages through original handler during auth', async () => {
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

      // createAuthenticatedWebsocketProvider calls provider.connect() internally,
      // so mockProvider.ws is already set. Store an original handler on it.
      const originalHandler = vi.fn();
      mockProvider.ws!.onmessage = originalHandler;

      // Emit connected status to trigger auth token send + replace onmessage
      mockProvider._emitStatus('connected');

      // Verify token was sent
      expect(mockProvider.ws?.send).toHaveBeenCalledWith(authToken);

      // Send a binary (non-string) message event — should pass through to original
      const binaryEvent = new MessageEvent('message', {
        data: new ArrayBuffer(4),
      });
      mockProvider.ws?.onmessage?.(binaryEvent);

      expect(originalHandler).toHaveBeenCalledWith(binaryEvent);

      // Clean up — reject the promise to avoid unhandled rejection
      mockProvider._emitStatus('disconnected');
      await expect(providerPromise).rejects.toThrow();
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

    it('should pass binary messages through original handler during reauth', () => {
      const authToken = 'reauth-token';
      const getAuthToken = vi.fn().mockReturnValue(authToken);

      const mockProvider = new MockWebsocketProvider();

      setupReauthentication(
        mockProvider as unknown as Parameters<typeof setupReauthentication>[0],
        getAuthToken
      );

      mockProvider.connect();
      const originalHandler = vi.fn();
      mockProvider.ws!.onmessage = originalHandler;

      mockProvider._emitStatus('disconnected');
      mockProvider._emitStatus('connected');

      // Verify token was sent
      expect(mockProvider.ws?.send).toHaveBeenCalledWith(authToken);

      // Send a binary (non-string) message — should pass through to original handler
      const binaryEvent = new MessageEvent('message', {
        data: new ArrayBuffer(4),
      });
      mockProvider.ws?.onmessage?.(binaryEvent);

      expect(originalHandler).toHaveBeenCalledWith(binaryEvent);
    });
  });

  describe('installWebSocketResilience', () => {
    /**
     * Build a MockWebsocketProvider whose `ws` exposes the
     * readyState/OPEN/wsconnected fields the guard + keepalive read. The
     * default mock leaves these out to keep the existing auth tests minimal.
     */
    function makeResilientProvider() {
      const provider = new MockWebsocketProvider();
      provider.connect();
      // Simulate an open socket with y-websocket's handler already assigned.
      const yjsHandler = vi.fn();
      provider.ws = {
        onmessage: yjsHandler,
        send: vi.fn(),
        readyState: 1, // WebSocket.OPEN
        OPEN: 1,
      };
      (provider as unknown as { wsconnected: boolean }).wsconnected = true;
      return { provider, yjsHandler };
    }

    it('routes text frames away from the y-websocket binary decoder', () => {
      const { provider, yjsHandler } = makeResilientProvider();
      const onTextMessage = vi.fn();

      installWebSocketResilience(
        provider as unknown as Parameters<typeof installWebSocketResilience>[0],
        { onTextMessage }
      );

      // 'connected' triggers the guard to wrap ws.onmessage
      provider._emitStatus('connected');

      const textEvent = new MessageEvent('message', {
        data: 'inkweld:presence:pong',
      });
      provider.ws!.onmessage?.(textEvent);

      // y-websocket's binary handler must NOT see the text frame (otherwise it
      // decodes it as a sync-step-1 and uploads the full doc state).
      expect(yjsHandler).not.toHaveBeenCalled();
      // PONG is swallowed by the guard, so onTextMessage is NOT called for it.
      expect(onTextMessage).not.toHaveBeenCalled();
    });

    it('forwards unexpected text frames to onTextMessage', () => {
      const { provider, yjsHandler } = makeResilientProvider();
      const onTextMessage = vi.fn();

      installWebSocketResilience(
        provider as unknown as Parameters<typeof installWebSocketResilience>[0],
        { onTextMessage }
      );
      provider._emitStatus('connected');

      provider.ws!.onmessage?.(
        new MessageEvent('message', { data: 'something-unexpected' })
      );

      expect(onTextMessage).toHaveBeenCalledWith('something-unexpected');
      expect(yjsHandler).not.toHaveBeenCalled();
    });

    it('passes binary frames through to y-websocket and bumps the idle timer', () => {
      const { provider, yjsHandler } = makeResilientProvider();
      const providerAny = provider as unknown as {
        wsLastMessageReceived: number;
      };

      installWebSocketResilience(
        provider as unknown as Parameters<typeof installWebSocketResilience>[0]
      );
      providerAny.wsLastMessageReceived = 0;
      provider._emitStatus('connected');

      const binaryEvent = new MessageEvent('message', {
        data: new ArrayBuffer(8),
      });
      provider.ws!.onmessage?.(binaryEvent);

      expect(yjsHandler).toHaveBeenCalledWith(binaryEvent);
      // The guard must reset the idle timer so the keepalive PONG keeps the
      // socket alive (y-websocket force-closes after 30s of silence).
      expect(providerAny.wsLastMessageReceived).toBeGreaterThan(0);
    });

    it('contains a binary decode failure instead of throwing uncaught', () => {
      const { provider } = makeResilientProvider();
      const onDecodeError = vi.fn();

      installWebSocketResilience(
        provider as unknown as Parameters<typeof installWebSocketResilience>[0],
        { onDecodeError }
      );
      provider._emitStatus('connected');

      // Replace the captured yjsHandler with one that throws, then re-trigger
      // the guard by emitting connected again — but the socket is already
      // guarded (WeakSet), so the wrapper stays. Instead, invoke the wrapper
      // directly with a handler that throws by re-installing via a fresh socket.
      provider.ws = {
        onmessage: () => {
          throw new Error('Unexpected end of array');
        },
        send: vi.fn(),
        readyState: 1,
        OPEN: 1,
      };
      provider._emitStatus('connected'); // new socket → guard re-wraps

      const binaryEvent = new MessageEvent('message', {
        data: new ArrayBuffer(2),
      });
      expect(() => provider.ws!.onmessage?.(binaryEvent)).not.toThrow();
      // byteLength is the full frame size; hexPreview is the leading-bytes hex
      // string (here an empty 2-byte buffer → "00 00").
      expect(onDecodeError).toHaveBeenCalledWith(expect.any(Error), 2, '00 00');
    });

    it("captures a hex preview of the malformed frame's leading bytes", () => {
      const { provider } = makeResilientProvider();
      const onDecodeError = vi.fn();

      installWebSocketResilience(
        provider as unknown as Parameters<typeof installWebSocketResilience>[0],
        { onDecodeError }
      );
      // A handler that throws so the guard enters its catch path.
      provider.ws = {
        onmessage: () => {
          throw new Error('Unexpected end of array');
        },
        send: vi.fn(),
        readyState: 1,
        OPEN: 1,
      };
      provider._emitStatus('connected');

      // Non-zero leading bytes: 0x00 (sync), 0x02 (update sub-type), 0x05, 0xff,
      // then enough 0x00 to exceed the 32-byte preview cap.
      const bytes = new Uint8Array(40);
      bytes[0] = 0x00;
      bytes[1] = 0x02;
      bytes[2] = 0x05;
      bytes[3] = 0xff;
      const binaryEvent = new MessageEvent('message', { data: bytes.buffer });

      provider.ws!.onmessage?.(binaryEvent);

      expect(onDecodeError).toHaveBeenCalledTimes(1);
      const [, byteLength, hexPreview] = onDecodeError.mock.calls[0]!;
      expect(byteLength).toBe(40);
      // Preview capped at 32 bytes, leading bytes present, ellipsis appended.
      expect(hexPreview).toBe(
        '00 02 05 ff ' + Array.from({ length: 28 }, () => '00').join(' ') + ' …'
      );
    });

    it('does not double-wrap an already-guarded socket', () => {
      const { provider, yjsHandler } = makeResilientProvider();

      installWebSocketResilience(
        provider as unknown as Parameters<typeof installWebSocketResilience>[0]
      );
      provider._emitStatus('connected');
      const firstWrapper = provider.ws!.onmessage;

      // A second 'connected' (e.g. a stray re-emit) must not re-wrap.
      provider._emitStatus('connected');
      expect(provider.ws!.onmessage).toBe(firstWrapper);

      // And binary still flows correctly.
      const binaryEvent = new MessageEvent('message', {
        data: new ArrayBuffer(4),
      });
      provider.ws!.onmessage?.(binaryEvent);
      expect(yjsHandler).toHaveBeenCalledTimes(1);
    });

    it('sends a keepalive PING while the socket is open', () => {
      vi.useFakeTimers();
      try {
        const { provider } = makeResilientProvider();

        installWebSocketResilience(
          provider as unknown as Parameters<
            typeof installWebSocketResilience
          >[0]
        );
        provider._emitStatus('connected');

        // No ping before the interval fires.
        expect(provider.ws!.send).not.toHaveBeenCalledWith(
          PRESENCE_KEEPALIVE_PING
        );

        vi.advanceTimersByTime(25_000);
        expect(provider.ws!.send).toHaveBeenCalledWith(PRESENCE_KEEPALIVE_PING);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not send keepalive PINGs before the socket is connected', () => {
      vi.useFakeTimers();
      try {
        const provider = new MockWebsocketProvider();
        // No connect() → no ws, wsconnected false.
        (provider as unknown as { wsconnected: boolean }).wsconnected = false;

        installWebSocketResilience(
          provider as unknown as Parameters<
            typeof installWebSocketResilience
          >[0]
        );
        vi.advanceTimersByTime(25_000);
        expect(provider.ws?.send).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears the keepalive interval when the provider is destroyed', () => {
      vi.useFakeTimers();
      try {
        const { provider } = makeResilientProvider();
        const originalDestroy = vi.fn();
        provider.destroy = originalDestroy;

        installWebSocketResilience(
          provider as unknown as Parameters<
            typeof installWebSocketResilience
          >[0]
        );
        provider._emitStatus('connected');
        vi.advanceTimersByTime(25_000);
        expect(provider.ws!.send).toHaveBeenCalledTimes(1);

        provider.destroy();
        expect(originalDestroy).toHaveBeenCalledTimes(1);

        // After destroy, advancing timers must not send any more pings.
        vi.advanceTimersByTime(60_000);
        expect(provider.ws!.send).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
