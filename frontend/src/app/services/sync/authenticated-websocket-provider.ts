import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';

/**
 * Authentication result from the WebSocket auth protocol
 */
export interface AuthResult {
  success: boolean;
  error?: string;
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
  } = {}
): Promise<WebsocketProvider> {
  return new Promise((resolve, reject) => {
    // Start with connect: false so we can set up auth handling first
    const provider = new WebsocketProvider(wsUrl, roomName, doc, {
      ...options,
      connect: false,
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

              console.log('[AuthWS] Authentication successful');
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
        console.log('[AuthWS] Sending auth token...');
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
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Connection error';
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
            console.log('[AuthWS] Re-authentication successful');
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
      console.log('[AuthWS] Re-sending auth token...');
      ws.send(token);
    }
  });
}
