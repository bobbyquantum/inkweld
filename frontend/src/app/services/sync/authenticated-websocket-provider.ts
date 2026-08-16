import {
  PRESENCE_KEEPALIVE_PING,
  PRESENCE_KEEPALIVE_PONG,
} from '@inkweld/presence';
import { WebsocketProvider } from 'y-websocket';
import type * as Y from 'yjs';

/**
 * Authentication result from the WebSocket auth protocol
 */
export interface AuthResult {
  success: boolean;
  error?: string;
}

/**
 * Interval at which the client sends an app-level keepalive PING on every
 * authenticated Yjs socket. Must be comfortably shorter than y-websocket's
 * hard-coded `messageReconnectTimeout` (30s) — if no message is received on a
 * socket within 30s, y-websocket force-closes it and reconnects.
 *
 * Document sockets otherwise carry NO server→client traffic while idle (the
 * server never echoes awareness back to the origin and protocol-level pings
 * don't surface as `message` events), so without this keepalive every open
 * document socket reconnects every ~30 seconds forever — burning WS upgrades,
 * auth DB lookups and writing-session churn around the clock.
 *
 * The keepalive is a TEXT frame. Text frames are routed away from y-websocket's
 * binary decoder by the message guard installed alongside this keepalive (see
 * `installWebSocketResilience`), so they keep the socket alive without being
 * misinterpreted as a sync step-1 (which would otherwise trigger a full
 * document state upload every interval).
 */
const KEEPALIVE_INTERVAL_MS = 25_000;

/**
 * Caps y-websocket's *internal* reconnect backoff (its default is only 2.5s,
 * which during a real backend outage reconnects every few seconds and
 * amplifies server load). Shared by the document and elements sync paths so
 * both stay in lockstep.
 */
export const WS_MAX_BACKOFF_TIME = 60_000;

/**
 * Sockets we've already wrapped with the resilient message guard, so a
 * re-auth handler running after the guard doesn't double-wrap the same
 * `WebSocket` instance.
 */
const guardedSockets = new WeakSet<WebSocket>();

/**
 * Options for {@link installWebSocketResilience}.
 */
export interface WebSocketResilienceOptions {
  /**
   * Called for every TEXT frame received on the socket after auth. The guard
   * swallows the keepalive PONG automatically; other text messages are passed
   * here for the caller to handle (e.g. surfacing unexpected auth denials).
   */
  onTextMessage?: (text: string) => void;
  /**
   * Called when a binary frame fails to decode inside y-websocket's message
   * handler. Without the guard this surfaces as an uncaught `Unexpected end of
   * array` error from lib0; the guard contains it and reports the frame size
   * plus a hex preview of the leading bytes so the malformed-frame source can
   * be diagnosed from production logs.
   *
   * `hexPreview` is the first up-to-32 bytes of the frame as a hex string
   * (e.g. `"00 01 08 c8 …"`), capped to avoid dumping megabyte frames. It is
   * `"unavailable"` when the bytes couldn't be read (e.g. a Blob that failed
   * to materialize synchronously).
   */
  onDecodeError?: (
    error: unknown,
    byteLength: number,
    hexPreview: string
  ) => void;
}

/**
 * Maximum number of leading bytes captured for a malformed-frame hex preview.
 * Enough to see the outer message-type varuint and the start of the sync
 * sub-type / state vector without dumping large frames into logs.
 */
const MALFORMED_FRAME_PREVIEW_BYTES = 32;

/**
 * Extract a hex preview of the leading bytes of a binary WebSocket message.
 *
 * y-websocket delivers binary frames as either an `ArrayBuffer` (its default
 * `binaryType`) or an `ArrayBufferView` (e.g. `Uint8Array`/`Buffer` under some
 * polyfills). Both expose the raw bytes we need to diagnose a malformed frame.
 * Returns `"unavailable"` when the payload isn't a readable binary buffer
 * (e.g. a `Blob`, which would need async materialization and isn't worth the
 * latency in the error path).
 */
function frameHexPreview(data: unknown): string {
  let bytes: Uint8Array | null = null;
  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    const view = data;
    bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (!bytes) return 'unavailable';
  const limit = Math.min(bytes.length, MALFORMED_FRAME_PREVIEW_BYTES);
  const parts: string[] = [];
  for (let i = 0; i < limit; i++) {
    parts.push(bytes[i].toString(16).padStart(2, '0'));
  }
  if (bytes.length > limit) parts.push('…');
  return parts.join(' ');
}

/**
 * Install a permanent message guard + keepalive on a `WebsocketProvider`.
 *
 * The guard wraps `ws.onmessage` on every new underlying `WebSocket` (y-websocket
 * recreates the socket on each reconnect) so that:
 *
 * 1. **Text frames never reach y-websocket's binary decoder.** y-websocket 3
 *    feeds every `message` event through `new Uint8Array(event.data)` and a
 *    lib0 decoder. A text frame becomes an all-zero byte array that decodes as
 *    a *valid* sync-step-1 with an empty state vector — which makes the client
 *    reply by uploading its entire document state to the server. Routing text
 *    away from the decoder (while still bumping `wsLastMessageReceived` so the
 *    keepalive resets the idle timer) closes that hole permanently.
 *
 * 2. **Binary decode failures are contained.** lib0's `readVarUint` throws
 *    `Unexpected end of array` on a truncated frame; y-websocket has no
 *    try/catch around `readMessage`, so one bad frame becomes an uncaught
 *    error. The guard catches it and reports the frame size instead.
 *
 * The keepalive sends a presence PING text frame every 25s while the socket is
 * open. The server's auth gate responds with a PONG only once authenticated,
 * and on Cloudflare the PING/PONG pair is wired through
 * `setWebSocketAutoResponse`, so the edge replies without even waking the
 * Durable Object — keeping the keepalive effectively free.
 *
 * Both behaviours survive reconnects and self-clean when the provider is
 * destroyed.
 */
export function installWebSocketResilience(
  provider: WebsocketProvider,
  options: WebSocketResilienceOptions = {}
): void {
  const { onTextMessage, onDecodeError } = options;

  provider.on('status', ({ status }: { status: string }) => {
    if (status !== 'connected') return;
    const ws = provider.ws;
    if (!ws || guardedSockets.has(ws)) return;

    // Capture y-websocket's own onmessage handler (assigned in setupWS before
    // 'connected' is emitted) and wrap it.
    const yjsHandler = ws.onmessage;
    guardedSockets.add(ws);
    ws.onmessage = (event: MessageEvent) => {
      // y-websocket resets its idle timer from its own handler; do it here too
      // so text frames (the keepalive PONG) also reset it.
      // CRITICAL: y-websocket uses time.getUnixTime() which is Date.now() —
      // MILLISECONDS. Setting this to seconds (Math.floor(Date.now()/1000))
      // makes the messageReconnectTimeout check always true, causing a
      // close/reconnect loop every ~3s.
      (
        provider as unknown as { wsLastMessageReceived: number }
      ).wsLastMessageReceived = Date.now();

      if (typeof event.data === 'string') {
        // Auth interceptors installed by createAuthenticatedWebsocketProvider /
        // setupReauthentication sit ABOVE this guard during the auth window and
        // swallow 'authenticated' / 'access-denied' themselves. Post-auth text
        // that reaches here is the keepalive PONG (expected) or stray control
        // text (debug-worthy).
        if (event.data === PRESENCE_KEEPALIVE_PONG) return;
        onTextMessage?.(event.data);
        return;
      }

      // Binary: delegate to y-websocket, but contain decode failures.
      const byteLength =
        event.data instanceof ArrayBuffer
          ? event.data.byteLength
          : ((event.data as { byteLength?: number })?.byteLength ?? 0);
      try {
        if (yjsHandler) yjsHandler.call(ws, event);
      } catch (error) {
        // Capture the leading bytes so the malformed-frame source can be
        // diagnosed from production logs. The frame has already been consumed
        // by the time the decoder threw, so we read from the original
        // `event.data` (still held by the closure) rather than re-reading the
        // socket.
        onDecodeError?.(error, byteLength, frameHexPreview(event.data));
      }
    };
  });

  // App-level keepalive. setInterval in a background tab is throttled by
  // browsers, but Chrome exempts pages with an active WebSocket connection
  // from intensive timer throttling, so this fires reliably while the socket
  // is up — which is exactly when it's needed.
  const keepalive = setInterval(() => {
    const ws = provider.ws;
    if (!provider.wsconnected || !ws || ws.readyState !== ws.OPEN) return;
    try {
      ws.send(PRESENCE_KEEPALIVE_PING);
    } catch {
      // Socket died mid-send; y-websocket's close path will handle reconnect.
    }
  }, KEEPALIVE_INTERVAL_MS);

  // Clean up the interval when the provider is destroyed so we don't leak.
  const originalDestroy = provider.destroy.bind(provider);
  // Patch the instance method (cast: TS treats class methods as non-readonly
  // but the declaration is a method signature, not a writable property).
  (provider as unknown as { destroy: () => void }).destroy = () => {
    clearInterval(keepalive);
    originalDestroy();
  };
}

/**
 * Creates a WebsocketProvider with authentication over the WebSocket connection.
 *
 * Since browsers cannot send custom headers with WebSocket connections,
 * we authenticate OVER the WebSocket connection itself:
 *
 * 1. Connect to WebSocket (no auth required for upgrade)
 * 2. Send auth token as first TEXT message
 * 3. Wait for "authenticated" or "access-denied" response
 * 4. If authenticated, allow normal Yjs sync to proceed
 * 5. If denied, disconnect and reject the promise
 *
 * This approach:
 * - Avoids tokens in URLs (security risk)
 * - Avoids cookies (cross-domain issues)
 * - Provides graceful error handling
 * - Works naturally with reconnection
 *
 * @param wsUrl - The WebSocket URL (without auth token in query)
 * @param roomName - The room name (usually empty, documentId is in URL)
 * @param doc - The Yjs document
 * @param authToken - The JWT auth token to send
 * @param options - WebsocketProvider options
 * @returns Promise resolving to the WebsocketProvider after successful auth
 */
export async function createAuthenticatedWebsocketProvider(
  wsUrl: string,
  roomName: string,
  doc: Y.Doc,
  authToken: string,
  options: {
    connect?: boolean;
    resyncInterval?: number;
    /**
     * Caps y-websocket's internal reconnect backoff. The default is only 2.5s,
     * which during a real outage reconnects every few seconds and amplifies
     * server load. Raise it so genuine outages back off instead of hammering.
     */
    maxBackoffTime?: number;
    /**
     * Resilience callbacks forwarded to {@link installWebSocketResilience}.
     * Defaults to a console-warn on decode errors (including a hex preview of
     * the malformed frame's leading bytes for production diagnostics). Pass
     * `onTextMessage` to observe unexpected text frames.
     */
    onDecodeError?: (
      error: unknown,
      byteLength: number,
      hexPreview: string
    ) => void;
    onTextMessage?: (text: string) => void;
  } = {}
): Promise<WebsocketProvider> {
  // Strip our custom resilience callbacks before forwarding the rest to
  // y-websocket — only `connect`, `resyncInterval`, and `maxBackoffTime` are
  // real WebsocketProvider options.
  const { onDecodeError, onTextMessage, ...wsOptions } = options;

  return new Promise((resolve, reject) => {
    // Start with connect: false so we can set up auth handling first
    const provider = new WebsocketProvider(wsUrl, roomName, doc, {
      ...wsOptions,
      connect: false,
      // y-websocket 3.1's default already treats the permanent band
      // (4400-4499) as terminal. We adopt that convention (the backend closes
      // hard denials with 44xx and transient failures with 45xx — see
      // backend/src/utils/ws-close-codes.ts), so pass the default explicitly to
      // document the intent and keep it stable if the library default changes.
      shouldReconnect: event => !(event.code >= 4400 && event.code < 4500),
    });

    // Install the permanent message guard + keepalive BEFORE registering the
    // auth status handler. Both listen on 'status'; lib0's ObservableV2 calls
    // listeners in registration order, so the guard runs first and wraps
    // ws.onmessage, then the auth handler captures the *guarded* handler as
    // its `originalHandler` and restores to it once 'authenticated' arrives —
    // leaving the guard in place for the lifetime of the socket.
    installWebSocketResilience(provider, {
      onTextMessage,
      onDecodeError:
        onDecodeError ??
        ((error, byteLength, hexPreview) => {
          console.warn(
            `[AuthWS] Contained a malformed binary frame ` +
              `(${byteLength} bytes; preview: ${hexPreview}); ` +
              `sync may be temporarily inconsistent.`,
            error
          );
        }),
    });

    let authCompleted = false;

    /**
     * Set up auth handling when WebSocket connects
     */
    const handleStatus = ({ status }: { status: string }) => {
      if (status === 'connected' && !authCompleted) {
        const ws = provider.ws;
        if (!ws) {
          reject(new Error('WebSocket not available after connect'));
          return;
        }

        // Store original onmessage to restore after auth
        const originalHandler = ws.onmessage;

        // Temporarily override onmessage to intercept auth response
        ws.onmessage = (event: MessageEvent) => {
          // Only handle text messages during auth phase
          if (typeof event.data === 'string') {
            const response = event.data;

            if (response === 'authenticated') {
              authCompleted = true;

              // Restore original message handler for Yjs protocol
              ws.onmessage = originalHandler;

              // Remove our status listener
              provider.off('status', handleStatus);

              resolve(provider);
            } else if (response.startsWith('access-denied')) {
              const reason = response.split(':')[1] || 'unknown';
              console.error(`[AuthWS] Authentication denied: ${reason}`);

              // Clean up
              provider.off('status', handleStatus);
              provider.disconnect();

              reject(new Error(`WebSocket authentication denied: ${reason}`));
            }
            // Ignore other text messages
            return;
          }

          // Pass binary messages through (shouldn't happen before auth)
          if (originalHandler) {
            originalHandler.call(ws, event);
          }
        };

        // Send the auth token as the first message
        ws.send(authToken);
      } else if (status === 'disconnected' && !authCompleted) {
        // Connection failed before auth completed
        provider.off('status', handleStatus);
        reject(new Error('WebSocket disconnected before authentication'));
      }
    };

    // Listen for connection status
    provider.on('status', handleStatus);

    // Handle connection errors
    provider.on('connection-error', (error: Error | string | Event) => {
      if (!authCompleted) {
        provider.off('status', handleStatus);
        let errorMessage: string;
        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else {
          errorMessage = 'Connection error';
        }
        reject(new Error(`WebSocket connection error: ${errorMessage}`));
      }
    });

    // Now connect
    provider.connect();
  });
}

/**
 * Sets up re-authentication for WebsocketProvider reconnections.
 *
 * When the WebSocket reconnects (after disconnect), we need to
 * re-authenticate. This function sets up the handlers for that.
 *
 * @param provider - The WebsocketProvider to monitor
 * @param getAuthToken - Function to get the current auth token
 * @param onAuthError - Callback for auth errors (e.g., to update UI)
 */
export function setupReauthentication(
  provider: WebsocketProvider,
  getAuthToken: () => string | null,
  onAuthError?: (error: string) => void
): void {
  let needsAuth = false;

  provider.on('status', ({ status }: { status: string }) => {
    if (status === 'disconnected') {
      // Mark that we'll need to re-auth on next connection
      needsAuth = true;
    } else if (status === 'connecting') {
      // Still connecting, do nothing yet
    } else if (status === 'connected' && needsAuth) {
      const ws = provider.ws;
      if (!ws) return;

      const token = getAuthToken();
      if (!token) {
        console.error('[AuthWS] No auth token available for re-authentication');
        onAuthError?.('No auth token available');
        provider.disconnect();
        return;
      }

      // Store original handler
      const originalHandler = ws.onmessage;
      let authComplete = false;

      // Temporarily override to handle auth response
      ws.onmessage = (event: MessageEvent) => {
        if (!authComplete && typeof event.data === 'string') {
          const response = event.data;

          if (response === 'authenticated') {
            authComplete = true;
            needsAuth = false;
            ws.onmessage = originalHandler;
          } else if (response.startsWith('access-denied')) {
            const reason = response.split(':')[1] || 'unknown';
            console.error(`[AuthWS] Re-authentication denied: ${reason}`);
            authComplete = true;
            needsAuth = false;
            ws.onmessage = originalHandler;
            onAuthError?.(`Access denied: ${reason}`);
            provider.disconnect();
          }
          return;
        }

        // Pass through to original handler
        if (originalHandler) {
          originalHandler.call(ws, event);
        }
      };

      // Send auth token
      ws.send(token);
    }
  });
}
