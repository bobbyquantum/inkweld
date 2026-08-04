/**
 * WebSocket guard helpers for the Yjs Durable Object.
 *
 * Extracted into a standalone module (rather than private methods on
 * `YjsProject`) so the guard logic is unit-testable in the Bun runtime —
 * the Durable Object class itself can't be imported there because it pulls
 * in `cloudflare:workers`. This mirrors the decoupling of `YjsDocStorage`.
 */

/**
 * Send a message only if the WebSocket is still open. Guards the async
 * auth path where `ws.send()` would otherwise throw on a socket that the
 * client closed while we were awaiting token verification / DB lookups.
 * An unguarded `send()` after close throws `Can't call WebSocket send()
 * after close()`, which the workerd runtime surfaces as an uncaught error
 * and can take the whole DO down (the recurring Wrangler e2e flake).
 *
 * @returns `true` if the message was sent, `false` if the socket is closed
 *   or the send threw. Callers use `false` to abort further per-connection
 *   work (document registration, session start).
 */
export function safeSend(ws: WebSocket, message: string): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Close a WebSocket only if it hasn't already closed. Closing a socket that
 * is already CLOSING/CLOSED is a no-op at worst, but guarding avoids
 * unnecessary exceptions in the async auth path.
 */
export function safeClose(ws: WebSocket, code?: number, reason?: string): void {
  if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;
  try {
    ws.close(code, reason);
  } catch {
    /* already closed */
  }
}
