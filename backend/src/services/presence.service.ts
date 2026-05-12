/**
 * Project presence service.
 *
 * Maintains an in-memory registry of presence sessions per project key
 * (`username:slug`) and broadcasts deltas to subscribed sockets.
 *
 * Runtime-agnostic on purpose:
 *
 * - **Bun**: a single module-level `presenceService` instance manages all
 *   projects in the process. The Bun WS handler in `routes/yjs.routes.ts`
 *   adds/removes sockets here.
 * - **Cloudflare Durable Object**: each `YjsProject` DO instance owns a
 *   `ProjectPresenceService` instance scoped to its own project. The DO
 *   creates one per instance to keep the registry isolated to its
 *   project — there's no cross-project broadcast on CF anyway.
 *
 * The implementation deliberately holds NO references to runtime-specific
 * WebSocket types. Sockets are abstracted through `PresenceSocket`, which is
 * a structural type satisfied by both `ServerWebSocket` (Bun) and
 * `WebSocket` (Cloudflare Workers).
 *
 * ## Design decisions
 *
 * - **No heartbeat**: sessions live until `removeSocket` is called. Transport
 *   keepalive (Bun ping interval, CF Hibernation auto-pong) is sufficient to
 *   detect dead sockets — when they close, the runtime calls our cleanup.
 * - **Delta broadcasting**: when a session sends Hello/Update, we re-encode
 *   the SAME payload and broadcast to other sockets in the same project,
 *   echoing nothing back to the sender. The sender already has its own state.
 * - **Snapshot on join**: a freshly-joined socket gets a single Snapshot of
 *   all OTHER sessions so it can render existing peers immediately.
 */

import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {
  PRESENCE_MSG_HELLO,
  PRESENCE_MSG_UPDATE,
  Y_MESSAGE_PRESENCE,
  encodePresenceFrame,
  readPresenceMessage,
  writeHello,
  writeLeave,
  writeSnapshot,
  writeUpdate,
  type PresenceSession,
} from '@inkweld/presence';
import { logger } from './logger.service';

const presLog = logger.child('Presence');

/**
 * Minimal WebSocket-like surface used for broadcasting. Both Bun's
 * `ServerWebSocket` and Cloudflare's `WebSocket` satisfy this — the only
 * thing we need is `send(Uint8Array | ArrayBuffer)`. Bun accepts Uint8Array
 * directly; CF accepts both.
 */
export interface PresenceSocket {
  send(data: Uint8Array | ArrayBuffer | string): void;
}

interface RegisteredSession {
  socket: PresenceSocket;
  session: PresenceSession;
}

export class ProjectPresenceService {
  /**
   * `projectKey` (`username:slug`) → sessionId → RegisteredSession.
   *
   * The sessionId is the client-chosen UUID from the Hello message. We trust
   * it because the client also picks its own Yjs awareness clientID — same
   * trust model.
   */
  private readonly projects = new Map<string, Map<string, RegisteredSession>>();

  /**
   * Reverse lookup: socket → { projectKey, sessionId }. Used by `removeSocket`
   * because runtimes only hand us the WebSocket on close, not the sessionId.
   */
  private readonly socketIndex = new Map<
    PresenceSocket,
    { projectKey: string; sessionId: string }
  >();

  /**
   * Process an incoming presence message that the WS handler has already
   * peeled the outer `Y_MESSAGE_PRESENCE` byte off of.
   *
   * @param projectKey `username:slug` for the elements doc this socket is on.
   * @param socket the originating socket (used for echoing snapshots and
   *   indexing).
   * @param decoder positioned just after the outer multiplex byte.
   * @param rawFrame the FULL original frame including the multiplex byte —
   *   used for zero-copy rebroadcast to peers. Pass the raw `Uint8Array` we
   *   received from the WS.
   */
  handleMessage(
    projectKey: string,
    socket: PresenceSocket,
    decoder: decoding.Decoder,
    rawFrame: Uint8Array
  ): void {
    let msg;
    try {
      msg = readPresenceMessage(decoder);
    } catch (err) {
      presLog.warn(`Malformed presence message for project ${projectKey}`, { error: err });
      return;
    }

    switch (msg.type) {
      case PRESENCE_MSG_HELLO: {
        this.registerSession(projectKey, socket, msg.session);
        // Send the new socket a Snapshot of OTHER existing sessions.
        this.sendSnapshot(projectKey, socket, msg.session.sessionId);
        // Rebroadcast the Hello as a Hello — peers handle it as
        // "session arrived". We don't translate to Update because the
        // payload shape is identical and re-emitting bytes is cheaper.
        this.broadcast(projectKey, socket, rawFrame);
        return;
      }
      case PRESENCE_MSG_UPDATE: {
        const updated = this.applyUpdate(projectKey, msg.sessionId, msg.fields);
        if (!updated) {
          // Update for an unknown session — likely out-of-order before Hello.
          // Drop silently; the sender will resend after connection re-init.
          return;
        }
        this.broadcast(projectKey, socket, rawFrame);
        return;
      }
      default:
        // SNAPSHOT and LEAVE are server-to-client only. If we receive one,
        // ignore it.
        presLog.debug(`Ignoring presence message of type ${msg.type} from client ${projectKey}`);
        return;
    }
  }

  /**
   * Remove a socket and broadcast Leave to remaining peers in the project.
   * Safe to call on sockets that never sent a Hello (no-op).
   */
  removeSocket(socket: PresenceSocket): void {
    const indexed = this.socketIndex.get(socket);
    if (!indexed) return;

    const { projectKey, sessionId } = indexed;
    this.socketIndex.delete(socket);

    const project = this.projects.get(projectKey);
    if (!project) return;

    project.delete(sessionId);
    if (project.size === 0) {
      this.projects.delete(projectKey);
    }

    const frame = encodePresenceFrame((enc) => writeLeave(enc, sessionId));
    this.broadcast(projectKey, socket, frame);
  }

  /**
   * Visible for testing — exposes the set of sessions currently tracked for
   * a project. Returns undefined if no sessions are tracked. Callers MUST
   * NOT mutate the returned map.
   */
  getProjectSessions(projectKey: string): ReadonlyMap<string, PresenceSession> | undefined {
    const project = this.projects.get(projectKey);
    if (!project) return undefined;
    const out = new Map<string, PresenceSession>();
    for (const [id, entry] of project) out.set(id, entry.session);
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────────

  private registerSession(
    projectKey: string,
    socket: PresenceSocket,
    session: PresenceSession
  ): void {
    let project = this.projects.get(projectKey);
    if (!project) {
      project = new Map();
      this.projects.set(projectKey, project);
    }

    // If the same socket re-Hellos under a new sessionId (e.g. tab reload
    // re-using the WS — rare but possible), evict the old one first.
    const existing = this.socketIndex.get(socket);
    if (existing && existing.sessionId !== session.sessionId) {
      const oldProject = this.projects.get(existing.projectKey);
      oldProject?.delete(existing.sessionId);
      const leaveFrame = encodePresenceFrame((enc) => writeLeave(enc, existing.sessionId));
      this.broadcast(existing.projectKey, socket, leaveFrame);
    }

    project.set(session.sessionId, { socket, session });
    this.socketIndex.set(socket, { projectKey, sessionId: session.sessionId });
  }

  private applyUpdate(
    projectKey: string,
    sessionId: string,
    fields: import('@inkweld/presence').PresenceUpdateFields
  ): boolean {
    const project = this.projects.get(projectKey);
    const entry = project?.get(sessionId);
    if (!entry) return false;

    const next: PresenceSession = { ...entry.session };
    if (fields.status !== undefined) next.status = fields.status;
    if (fields.location !== undefined) next.location = fields.location;
    if (fields.selection === null) {
      delete next.selection;
    } else if (fields.selection !== undefined) {
      next.selection = fields.selection;
    }
    if (fields.lastActivityAt !== undefined) next.lastActivityAt = fields.lastActivityAt;

    entry.session = next;
    return true;
  }

  private sendSnapshot(projectKey: string, socket: PresenceSocket, excludeSessionId: string): void {
    const project = this.projects.get(projectKey);
    if (!project) return;

    const others: PresenceSession[] = [];
    for (const [id, entry] of project) {
      if (id !== excludeSessionId) others.push(entry.session);
    }

    if (others.length === 0) return;

    const frame = encodePresenceFrame((enc) => writeSnapshot(enc, others));
    this.safeSend(socket, frame);
  }

  private broadcast(projectKey: string, sender: PresenceSocket, frame: Uint8Array): void {
    const project = this.projects.get(projectKey);
    if (!project) return;
    for (const entry of project.values()) {
      if (entry.socket === sender) continue;
      this.safeSend(entry.socket, frame);
    }
  }

  private safeSend(socket: PresenceSocket, frame: Uint8Array): void {
    try {
      socket.send(frame);
    } catch (err) {
      // A peer's socket has gone away mid-broadcast. Don't let it abort the
      // loop; we'll learn it's dead via the runtime's close callback.
      presLog.debug('Failed to send presence frame to peer', { error: err });
    }
  }
}

/**
 * Process-wide presence service used by the Bun runtime. Cloudflare's DO
 * runtime instantiates its own copy per DO instance — see
 * `durable-objects/yjs-project.do.ts`.
 */
export const presenceService = new ProjectPresenceService();

// Re-export the constants the WS handler needs so it doesn't have to import
// the @inkweld/presence package directly.
export { Y_MESSAGE_PRESENCE };

/**
 * Helper used by both Bun and DO message handlers: peek the outer multiplex
 * tag from a fresh decoder. Returns true if the byte is the presence tag.
 *
 * NOTE: this advances the decoder past the tag byte. Callers must be ready
 * to either continue decoding presence (if true) or rewind/recreate the
 * decoder for Yjs (if false). In practice both runtimes already create a
 * fresh decoder for each branch.
 */
export function isPresenceMessageTag(messageType: number): boolean {
  return messageType === Y_MESSAGE_PRESENCE;
}

/**
 * Build a frame that asks all peers to drop a session. Used by hibernation
 * cleanup paths where we don't have the original socket to subtract from
 * broadcast.
 */
export function encodeLeaveFrame(sessionId: string): Uint8Array {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, Y_MESSAGE_PRESENCE);
  writeLeave(enc, sessionId);
  return encoding.toUint8Array(enc);
}

/**
 * Convenience: parse a raw incoming frame, returning both the decoder
 * (positioned past the multiplex byte) AND the message-type tag so the
 * caller can dispatch. Returns null if the frame is too short to read a tag.
 */
export function peekFrameTag(frame: Uint8Array): { tag: number; decoder: decoding.Decoder } | null {
  if (frame.length === 0) return null;
  const decoder = decoding.createDecoder(frame);
  const tag = decoding.readVarUint(decoder);
  return { tag, decoder };
}

// Re-export codec helpers so callers (e.g. routes/yjs.routes.ts) can import
// them from a single point without reaching into @inkweld/presence directly.
export { writeHello, writeUpdate };
