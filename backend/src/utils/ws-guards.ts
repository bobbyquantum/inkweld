/**
 * WebSocket guard helpers used by the Yjs Durable Object's async auth path.
 *
 * Kept in `src/utils` (not `src/durable-objects`) so it is unit-testable in
 * the Bun runtime and included in Sonar analysis/coverage — the Durable
 * Object class itself can't be imported in Bun because it pulls in
 * `cloudflare:workers`, and `durable-objects/**` is excluded from Sonar.
 */

/**
 * The minimal WebSocket surface these guards depend on. The Cloudflare
 * Workers `WebSocket` satisfies this, and so does a lightweight test double,
 * so the guards stay unit-testable without importing `cloudflare:workers`.
 */
export interface GuardableWebSocket {
  readyState: number;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

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
export function safeSend(ws: GuardableWebSocket, message: string): boolean {
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
export function safeClose(ws: GuardableWebSocket, code?: number, reason?: string): void {
  if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;
  try {
    ws.close(code, reason);
  } catch {
    /* already closed */
  }
}
