import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { yjsService, type YjsSocket } from '../services/yjs.service';
import { authService, type SessionData } from '../services/auth.service';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { userService } from '../services/user.service';
import { isSessionRevoked } from '../utils/session-validity';
import { writingSessionService } from '../services/writing-session.service';
import { activityService } from '../services/activity.service';
import { countWords, extractTextContent } from '../mcp/tools/mutation.tools';
import { PRESENCE_KEEPALIVE_PING, PRESENCE_KEEPALIVE_PONG } from '@inkweld/presence';
import {
  Y_MESSAGE_PRESENCE,
  peekFrameTag,
  presenceService,
  type PresenceSocket,
} from '../services/presence.service';
import { type AppContext } from '../types/context';
import { logger } from '../services/logger.service';
import {
  parseTrackableElementId,
  isYjsFrameBlockedForViewer,
  PUBLIC_VIEWER_ID,
  PUBLIC_VIEW_TOKEN,
  Y_MESSAGE_AWARENESS,
} from '../utils/yjs-document-utils';
import { documentProjectKey, parseDocumentId } from '../utils/yjs-document-id';
import {
  WS_CLOSE_FORBIDDEN,
  WS_CLOSE_INVALID_DOCUMENT,
  WS_CLOSE_INVALID_TOKEN,
  WS_CLOSE_PROJECT_NOT_FOUND,
  WS_CLOSE_SERVER_ERROR,
  WS_CLOSE_AUTH_TIMEOUT,
  WS_CLOSE_PREAUTH_OVERFLOW,
} from '../utils/ws-close-codes';
import { PREAUTH_TIMEOUT_MS, preAuthQueueAccepts } from '../utils/ws-preauth';
import { ingressSessionMatches } from '../utils/ingress';

const wsLog = logger.child('WebSocket');
const app = new Hono<AppContext>();

/** Longest part of a rejected document id written to the log. */
const LOGGED_ID_MAX_LENGTH = 200;

/**
 * Best-effort: read the current word count from a live Yjs shared doc
 * by walking its `prosemirror` XmlFragment. Returns 0 if the doc has no
 * such fragment yet (newly created documents).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WSSharedDoc type is internal to y-websocket
function readWordCount(sharedDoc: any): number {
  try {
    const fragment = sharedDoc?.doc?.getXmlFragment?.('prosemirror');
    if (!fragment) return 0;
    return countWords(extractTextContent(fragment));
  } catch {
    return 0;
  }
}

/** Cast a raw Bun ServerWebSocket to the PresenceSocket structural type. */
function toPresenceSocket(raw: unknown): PresenceSocket {
  return raw as PresenceSocket;
}

function isBlockedForViewer(buffer: Buffer, documentId: string): boolean {
  // Buffer is a Uint8Array subclass — pass the underlying view to the util.
  // Slicing the appropriate region keeps Node Buffer pooling out of the picture.
  const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const blocked = isYjsFrameBlockedForViewer(view);
  if (blocked) {
    wsLog.debug(`Blocked write frame from read-only viewer for ${documentId}`);
  }
  return blocked;
}

async function resolveWriteAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  project: { id: string; userId: string; isPublic: boolean },
  sessionData: { userId: string; username: string } | null,
  projectOwner: string,
  slug: string
): Promise<boolean | null> {
  // A public viewer (no session) may read a public project, never write.
  if (!sessionData) return project.isPublic ? false : null;
  if (project.userId === sessionData.userId) return true;

  const access = await collaborationService.checkAccess(db, project.id, sessionData.userId);
  if (!access.canRead) {
    wsLog.warn(`User ${sessionData.username} attempted to access project ${projectOwner}/${slug}`);
    return null;
  }
  wsLog.info(
    `Collaborator ${sessionData.username} (${access.role}, canWrite: ${access.canWrite}) accessing project ${projectOwner}/${slug}`
  );
  return access.canWrite;
}

/** Minimal WebSocket shape used by this module. raw is optional per Hono's WSContext. */
interface WsHandle {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  raw?: YjsSocket & { ping(): void };
}

/** Send an optional text frame, then close. Never throws: the socket may already be gone. */
function closeQuietly(ws: WsHandle, code: number, reason: string, text?: string): void {
  if (text !== undefined) {
    try {
      ws.send(text);
    } catch {
      // Already closed; the close below is then a no-op too.
    }
  }
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

/**
 * Run one step of a socket's close cleanup. A step that fails is logged and
 * the remaining steps still run.
 */
function runCloseStep(documentId: string, step: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    wsLog.error(`Error during ${step} for ${documentId}`, error);
  }
}

function startPingInterval(ws: WsHandle, documentId: string, onClear: () => void): Timer {
  const PING_INTERVAL = 30000;
  const interval = setInterval(() => {
    try {
      ws.raw?.ping();
    } catch (error) {
      wsLog.error(`Error sending ping for ${documentId}, closing connection`, error);
      clearInterval(interval);
      onClear();
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    }
  }, PING_INTERVAL);
  return interval;
}

/**
 * WebSocket Authentication Protocol
 * =================================
 *
 * Since browsers cannot send custom headers (like Authorization) with WebSocket
 * connections, we authenticate OVER the WebSocket connection itself:
 *
 * 1. Client connects to WebSocket (no auth required for upgrade)
 * 2. Client sends auth token as first TEXT message
 * 3. Server validates token and project access
 * 4. Server responds with "authenticated" or "access-denied" text message
 * 5. If authenticated, server sets up Yjs sync; if denied, server closes connection
 * 6. All subsequent messages are binary Yjs sync protocol
 *
 * The `documentId` query parameter is checked before any of this, with the
 * parser every runtime shares (`utils/yjs-document-id.ts`): a socket opened
 * with a malformed id is sent `access-denied:invalid-document` and closed as
 * soon as it opens.
 *
 * Denial closes use the y-websocket 3.1 close-code convention (see
 * utils/ws-close-codes.ts): 44xx = permanent (the client stops reconnecting),
 * 45xx = transient (keep retrying). The text frame is the primary signal; the
 * close code is the backstop the frontend reads from the `closed` event.
 *
 * Every handler below catches its own errors, so a problem with one socket's
 * input only affects that socket. A binary frame the sync handlers cannot
 * read is dropped.
 *
 * This approach:
 * - Avoids tokens in URLs (security risk - logged, in browser history)
 * - Avoids cookies (don't work well cross-domain)
 * - Provides graceful error handling (client receives denial reason)
 * - Works naturally with reconnection (re-auth on each connect)
 */

// WebSocket upgrade handler for Yjs collaboration
app.get(
  '/yjs',
  upgradeWebSocket((c) => {
    const rawDocumentId = c.req.query('documentId');
    const parsedId = parseDocumentId(rawDocumentId);
    if (!parsedId) {
      wsLog.warn('Closing a socket opened with a malformed document id', {
        documentId: rawDocumentId?.slice(0, LOGGED_ID_MAX_LENGTH) ?? null,
      });
      return {
        onOpen(_event, ws) {
          closeQuietly(
            ws,
            WS_CLOSE_INVALID_DOCUMENT,
            'Invalid document ID',
            'access-denied:invalid-document'
          );
        },
      };
    }
    const documentId = parsedId.documentId;
    // Presence is scoped to the project (`username:slug`) so ALL sockets of
    // a project (elements doc + each open document doc) share one presence
    // "room" and see each other's avatars/cursors.
    const projectKey = documentProjectKey(parsedId);

    // Store context for use in handlers (db access needed for auth)
    const db = c.get('db');

    // Connection state
    let authenticated = false;
    // The authenticated identity, handed to the presence service so a client
    // cannot present as another user.
    let authUser: { id: string; username: string } | null = null;
    let authInProgress = false;
    let canWrite: boolean | null = false; // Viewers can receive but not send updates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Yjs WSSharedDoc type is complex
    let doc: any = null;
    let pingInterval: Timer | null = null;
    // Queue binary messages received before auth is complete — bounded, see
    // utils/ws-preauth.ts. A socket that never authenticates is closed by
    // `authDeadline`.
    let pendingMessages: ArrayBuffer[] = [];
    let pendingBytes = 0;
    let authDeadline: Timer | null = null;
    const clearAuthDeadline = (): void => {
      if (authDeadline) {
        clearTimeout(authDeadline);
        authDeadline = null;
      }
    };

    // Writing-session tracking state. Populated after successful auth, used
    // by the close handler to finalize the row in `writing_sessions` and to
    // emit a `document_edit` activity event when the session has a non-zero
    // word delta.
    let writingSessionId: string | null = null;
    let trackedProjectId: string | null = null;
    let trackedUserId: string | null = null;
    let trackedElementId: string | null = null;
    let trackedProjectOwner: string | null = null;
    let trackedProjectSlug: string | null = null;

    /**
     * Open a writing session for this connection if (a) the user can write
     * and (b) the document id maps to a trackable element (a prose
     * document, not the `elements` tree or a `worldbuilding:` doc).
     * Failures are swallowed — session tracking must never break sync.
     */
    const tryStartSession = async (sessionUserId: string, projectId: string): Promise<void> => {
      try {
        if (!canWrite) return;
        const elementId = parseTrackableElementId(documentId);
        if (!elementId) return;

        const startWordCount = readWordCount(doc);
        writingSessionId = await writingSessionService.start(db, {
          projectId,
          elementId,
          userId: sessionUserId,
          startWordCount,
        });
        trackedProjectId = projectId;
        trackedUserId = sessionUserId;
        trackedElementId = elementId;
        trackedProjectOwner = parsedId.projectOwner;
        trackedProjectSlug = parsedId.slug;
        wsLog.debug(
          `Writing session started ${writingSessionId} for ${documentId} (start words: ${startWordCount})`
        );
      } catch (err) {
        wsLog.error(`Failed to start writing session for ${documentId}`, err);
      }
    };

    /**
     * Finalize the writing session on disconnect. Best-effort. When the
     * session produced a non-zero word delta we also emit a `document_edit`
     * activity event so the project feed reflects the edit.
     */
    const tryFinalizeSession = async (): Promise<void> => {
      if (!writingSessionId) return;
      const id = writingSessionId;
      const projectId = trackedProjectId;
      const userId = trackedUserId;
      const elementId = trackedElementId;
      const projectOwner = trackedProjectOwner;
      const projectSlug = trackedProjectSlug;
      writingSessionId = null; // prevent double-finalize on error+close
      try {
        const endWordCount = readWordCount(doc);
        const result = await writingSessionService.finalize(db, id, endWordCount);
        wsLog.debug(
          `Writing session finalized ${id} for ${documentId} (end words: ${endWordCount}, delta: ${result?.wordsDelta ?? 'n/a'})`
        );
        if (result && result.wordsDelta !== 0 && projectId && userId && elementId) {
          // Best-effort element name lookup so the activity feed can show
          // "edited <document name>" instead of just "edited a document".
          let entityName: string | null = null;
          if (projectOwner && projectSlug) {
            try {
              const elements = await yjsService.getElements(projectOwner, projectSlug);
              entityName = elements.find((e) => e.id === elementId)?.name ?? null;
            } catch (err) {
              wsLog.debug(
                `Failed to resolve element name for ${elementId} in ${projectOwner}/${projectSlug}: ${String(err)}`
              );
            }
          }
          await activityService.recordOrCoalesceEdit(db, {
            projectId,
            userId,
            entityId: elementId,
            entityName,
            wordsDelta: result.wordsDelta,
            endWordCount,
            durationMs: result.durationMs,
          });
        }
      } catch (err) {
        wsLog.error(`Failed to finalize writing session ${id} for ${documentId}`, err);
      }
    };

    /**
     * Route one binary frame from the authenticated socket: presence frames
     * to the presence registry, everything else through the read-only viewer
     * gate to the Yjs document. Live frames and frames queued before auth
     * take this same path. A frame whose message type cannot be read is
     * dropped.
     */
    const dispatchFrame = (data: ArrayBuffer, raw: NonNullable<WsHandle['raw']>): void => {
      const bytes = new Uint8Array(data);
      const peeked = peekFrameTag(bytes);
      if (!peeked) {
        wsLog.debug(`Dropped a frame with no readable message type for ${documentId}`);
        return;
      }
      // Public viewers are anonymous: they never publish presence or
      // awareness, so the owner never sees a cursor or name they chose.
      if (!authUser && (peeked.tag === Y_MESSAGE_PRESENCE || peeked.tag === Y_MESSAGE_AWARENESS)) {
        wsLog.debug(`Ignoring presence/awareness frame from public viewer for ${documentId}`);
        return;
      }
      if (peeked.tag === Y_MESSAGE_PRESENCE) {
        // Presence is project-scoped and only travels on the elements WS.
        // Per-document tabs open their own Yjs WS for sync but must not
        // piggyback presence onto it, or a user would show up once per open
        // tab. The frontend only installs the presence handler on the
        // elements provider; dropping presence frames from other sockets
        // keeps a misbehaving client from inflating the registry.
        if (!parsedId.isElements) {
          wsLog.debug(`Ignoring presence frame on non-elements doc ${documentId}`);
          return;
        }
        presenceService.handleMessage(
          projectKey,
          toPresenceSocket(raw),
          peeked.decoder,
          bytes,
          authUser ?? undefined
        );
        return;
      }

      const buffer = Buffer.from(data);
      if (!canWrite && isBlockedForViewer(buffer, documentId)) return;
      yjsService.handleMessage(raw, doc, buffer);
    };

    // Replay frames queued before auth completed, in arrival order. The queue
    // is cleared first so a frame that throws cannot be replayed.
    const drainPendingMessages = (raw: NonNullable<WsHandle['raw']>): void => {
      const queued = pendingMessages;
      pendingMessages = [];
      pendingBytes = 0;
      for (const data of queued) {
        dispatchFrame(data, raw);
      }
    };

    /**
     * The session a socket's auth message names: `null` for `public-view`,
     * which asks for read-only access to a project its owner has made public
     * and carries no account (so no writing session or presence). Closes the
     * socket and returns `undefined` when the token or its account may not
     * sync.
     */
    const resolveSocketSession = async (
      token: string,
      ws: WsHandle
    ): Promise<SessionData | null | undefined> => {
      if (token === PUBLIC_VIEW_TOKEN) return null;
      const sessionData = await authService.verifyToken(token, c);
      if (!sessionData || sessionData.scope === 'enrol') {
        wsLog.warn(`Invalid auth token for ${documentId}`);
        ws.send('access-denied:invalid-token');
        ws.close(WS_CLOSE_INVALID_TOKEN, 'Invalid token');
        return undefined;
      }

      // Mirror requireAuth: the account must still be enabled and approved,
      // the token must not predate the user's revocation watermark, and
      // behind HA ingress it must belong to the HA user who connected.
      const account = await userService.findById(db, sessionData.userId);
      if (
        !account ||
        !userService.canLogin(account) ||
        isSessionRevoked(account, sessionData) ||
        !ingressSessionMatches(c, account)
      ) {
        wsLog.warn(`Account not permitted to sync ${documentId}: ${sessionData.username}`);
        ws.send('access-denied:forbidden');
        ws.close(WS_CLOSE_FORBIDDEN, 'Access denied');
        return undefined;
      }
      return sessionData;
    };

    // Validates token, project access, sets up Yjs connection.
    // Closes over connection state variables for mutation.
    const authenticateWs = async (token: string, ws: WsHandle): Promise<void> => {
      if (authenticated || authInProgress) return;
      authInProgress = true;
      try {
        const sessionData = await resolveSocketSession(token, ws);
        if (sessionData === undefined) return;
        const isPublicViewer = sessionData === null;

        const { projectOwner, slug } = parsedId;
        const project = await projectService.findByUsernameAndSlug(db, projectOwner, slug);
        if (!project) {
          wsLog.warn(`Project not found: ${projectOwner}/${slug}`);
          ws.send('access-denied:project-not-found');
          ws.close(WS_CLOSE_PROJECT_NOT_FOUND, 'Project not found');
          return;
        }

        canWrite = await resolveWriteAccess(db, project, sessionData, projectOwner, slug);
        if (canWrite === null) {
          ws.send('access-denied:forbidden');
          ws.close(WS_CLOSE_FORBIDDEN, 'Access denied');
          return;
        }

        if (!ws.raw) {
          wsLog.error(`WebSocket adapter missing raw connection for ${documentId}`);
          ws.send('access-denied:error');
          ws.close(WS_CLOSE_SERVER_ERROR, 'Authentication error');
          return;
        }
        try {
          doc = await yjsService.handleConnection(ws.raw, documentId);
        } catch (err) {
          wsLog.error(`Failed to initialize Yjs connection for ${documentId}`, err);
          ws.send('access-denied:error');
          ws.close(WS_CLOSE_SERVER_ERROR, 'Authentication error');
          return;
        }

        authenticated = true;
        clearAuthDeadline();
        authUser = sessionData ? { id: sessionData.userId, username: sessionData.username } : null;
        wsLog.info(
          `Authenticated for ${documentId} (user: ${sessionData?.username ?? 'public viewer'})`
        );
        ws.send('authenticated');

        if (sessionData) {
          await tryStartSession(sessionData.userId, project.id);
        }

        // Register this user against the raw WebSocket so the elements doc
        // update listener can attribute mutations to them. For elements docs,
        // also attach the snapshot-diff observer (idempotent).
        yjsService.registerUserConnection(
          ws.raw,
          documentId,
          sessionData?.userId ?? PUBLIC_VIEWER_ID
        );
        // Sharing may have been turned off while this socket was connecting,
        // after the revoke pass that closes registered public sockets ran.
        if (isPublicViewer && !(await projectService.findById(db, project.id))?.isPublic) {
          ws.send('access-denied:forbidden');
          ws.close(WS_CLOSE_FORBIDDEN, 'Public sharing disabled');
          return;
        }
        if (parsedId.isElements) {
          yjsService.watchElementsDoc(documentId, project.id, db);
        }

        drainPendingMessages(ws.raw);

        pingInterval = startPingInterval(ws, documentId, () => {
          pingInterval = null;
        });
      } finally {
        authInProgress = false;
      }
    };

    const handleBinaryMessage = (data: ArrayBuffer, ws: WsHandle): void => {
      if (!authenticated || !doc) {
        if (!preAuthQueueAccepts(pendingMessages.length, pendingBytes, data.byteLength)) {
          wsLog.warn(`Pre-auth queue overflow for ${documentId}; closing`);
          pendingMessages = [];
          pendingBytes = 0;
          ws.send('access-denied:queue-overflow');
          ws.close(WS_CLOSE_PREAUTH_OVERFLOW, 'Authenticate before syncing');
          return;
        }
        pendingMessages.push(data);
        pendingBytes += data.byteLength;
        return;
      }
      if (!ws.raw) return;
      dispatchFrame(data, ws.raw);
    };

    const handleTextMessage = async (text: string, ws: WsHandle): Promise<void> => {
      if (text === PRESENCE_KEEPALIVE_PING) {
        if (authenticated) ws.send(PRESENCE_KEEPALIVE_PONG);
        return;
      }
      // Text messages carry the authentication token
      try {
        await authenticateWs(text, ws);
      } catch (error) {
        wsLog.error(`Auth error for ${documentId}`, error);
        closeQuietly(ws, WS_CLOSE_SERVER_ERROR, 'Authentication error', 'access-denied:error');
      }
    };

    return {
      onOpen(_event, ws) {
        // Don't set up Yjs yet - wait for authentication
        wsLog.debug(`Connected for ${documentId}, awaiting authentication...`);
        authDeadline = setTimeout(() => {
          authDeadline = null;
          if (authenticated) return;
          wsLog.warn(`No auth token within ${PREAUTH_TIMEOUT_MS}ms for ${documentId}; closing`);
          closeQuietly(
            ws,
            WS_CLOSE_AUTH_TIMEOUT,
            'Authentication timeout',
            'access-denied:auth-timeout'
          );
        }, PREAUTH_TIMEOUT_MS);
      },

      async onMessage(event, ws) {
        try {
          if (typeof event.data === 'string') {
            await handleTextMessage(event.data, ws);
            return;
          }
          // Binary messages are Yjs sync protocol — UNLESS the outer
          // multiplex byte marks this as a presence frame.
          if (event.data instanceof ArrayBuffer) {
            handleBinaryMessage(event.data, ws);
          }
        } catch (error) {
          wsLog.error(`Error handling a message for ${documentId}; closing`, error);
          closeQuietly(ws, WS_CLOSE_SERVER_ERROR, 'Message handling error');
        }
      },

      onClose(_event, ws) {
        wsLog.debug(`Closed for ${documentId}`);
        // Each step runs on its own: one that fails never skips the rest.
        runCloseStep(documentId, 'timer cleanup', () => {
          clearAuthDeadline();
          if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
          }
        });
        // Finalize writing session BEFORE handing off to yjs disconnect, so
        // we read the final word count while the doc is still in-memory.
        // Fire-and-forget: don't block the close handler on the DB write.
        void tryFinalizeSession().catch((err: unknown) => {
          wsLog.error(`Failed to finalize writing session for ${documentId}`, err);
        });
        const raw = ws.raw;
        if (raw) {
          runCloseStep(documentId, 'connection cleanup', () => {
            yjsService.unregisterUserConnection(raw, documentId);
          });
          runCloseStep(documentId, 'presence cleanup', () => {
            presenceService.removeSocket(toPresenceSocket(raw));
          });
        }
        const closedDoc = doc;
        if (closedDoc) {
          runCloseStep(documentId, 'document disconnect', () => {
            yjsService.handleDisconnect(raw, closedDoc);
          });
        }
      },

      onError(evt, ws) {
        wsLog.error(`Error for ${documentId}`, evt);
        clearAuthDeadline();
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        if (ws.raw) {
          presenceService.removeSocket(toPresenceSocket(ws.raw));
        }
      },
    };
  })
);

export default app;
