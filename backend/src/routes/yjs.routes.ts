import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { yjsService } from '../services/yjs.service';
import { authService } from '../services/auth.service';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
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
  parseDocumentOwner,
  parseTrackableElementId,
  isYjsFrameBlockedForViewer,
  isElementsDoc,
} from '../utils/yjs-document-utils';

const wsLog = logger.child('WebSocket');
const app = new Hono<AppContext>();

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

/**
 * Project key (`username:slug`) used to scope presence broadcasts. We
 * deliberately strip everything after the first two colons so that ALL
 * sockets for the same project (elements doc + each open document doc) live
 * in the same presence "room" and see each other's avatars/cursors.
 *
 * Returns null when the documentId is malformed (missing `:`).
 */
function projectKeyForDocumentId(documentId: string): string | null {
  const parsed = parseDocumentOwner(documentId);
  if (!parsed) return null;
  return `${parsed.projectOwner}:${parsed.slug}`;
}

/**
 * Presence multiplexes onto the elements WebSocket ONLY. Per-document tabs
 * still open their own Yjs WS for sync, but they must not piggyback presence
 * onto those sockets — otherwise we get N sessions per user (one per open
 * tab) instead of one. The frontend enforces this by installing the presence
 * handler exclusively on the elements provider; we double-check on the
 * server to prevent a misbehaving client from polluting the registry.
 */
function isElementsDocumentId(documentId: string): boolean {
  // Tolerate the documented trailing-slash quirk between FE/BE/MCP — see
  // AGENTS.md "Yjs Document ID Trailing Slash" note.
  const stripped = documentId.replace(/\/+$/, '');
  return stripped.endsWith(':elements');
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
  project: { id: string; userId: string },
  sessionData: { userId: string; username: string },
  projectOwner: string,
  slug: string
): Promise<boolean | null> {
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
  raw?: { ping(): void };
}

function startPingInterval(ws: WsHandle, documentId: string, onClear: () => void): Timer {
  const PING_INTERVAL = 30000;
  const interval = setInterval(() => {
    try {
      ws.raw?.ping();
    } catch (error) {
      wsLog.error(`Error sending ping for ${documentId}, closing connection`, error);
      ws.close();
      clearInterval(interval);
      onClear();
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
 * This approach:
 * - Avoids tokens in URLs (security risk - logged, in browser history)
 * - Avoids cookies (don't work well cross-domain)
 * - Provides graceful error handling (client receives denial reason)
 * - Works naturally with reconnection (re-auth on each connect)
 */

// WebSocket upgrade handler for Yjs collaboration
app.get(
  '/yjs',
  upgradeWebSocket(async (c) => {
    const documentId = c.req.query('documentId');

    if (!documentId) {
      wsLog.error('Missing documentId parameter');
      return {};
    }

    // Store context for use in handlers (db access needed for auth)
    const db = c.get('db');

    // Connection state
    let authenticated = false;
    let authInProgress = false;
    let canWrite: boolean | null = false; // Viewers can receive but not send updates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Yjs WSSharedDoc type is complex
    let doc: any = null;
    let pingInterval: Timer | null = null;
    // Queue binary messages received before auth is complete
    let pendingMessages: ArrayBuffer[] = [];

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
        const parsed = parseDocumentOwner(documentId);
        trackedProjectOwner = parsed?.projectOwner ?? null;
        trackedProjectSlug = parsed?.slug ?? null;
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

    // Validates token, project access, sets up Yjs connection.
    // Closes over connection state variables for mutation.
    const authenticateWs = async (token: string, ws: WsHandle): Promise<void> => {
      if (authenticated || authInProgress) return;
      authInProgress = true;
      try {
        const sessionData = await authService.verifyToken(token, c);
        if (!sessionData) {
          wsLog.warn(`Invalid auth token for ${documentId}`);
          ws.send('access-denied:invalid-token');
          ws.close(4001, 'Invalid token');
          return;
        }

        const parsed = parseDocumentOwner(documentId);
        if (!parsed) {
          wsLog.error(`Invalid document ID format: ${documentId}`);
          ws.send('access-denied:invalid-document');
          ws.close(4002, 'Invalid document ID');
          return;
        }

        const project = await projectService.findByUsernameAndSlug(
          db,
          parsed.projectOwner,
          parsed.slug
        );
        if (!project) {
          wsLog.warn(`Project not found: ${parsed.projectOwner}/${parsed.slug}`);
          ws.send('access-denied:project-not-found');
          ws.close(4003, 'Project not found');
          return;
        }

        canWrite = await resolveWriteAccess(
          db,
          project,
          sessionData,
          parsed.projectOwner,
          parsed.slug
        );
        if (canWrite === null) {
          ws.send('access-denied:forbidden');
          ws.close(4003, 'Access denied');
          return;
        }

        if (!ws.raw) {
          wsLog.error(`WebSocket adapter missing raw connection for ${documentId}`);
          ws.send('access-denied:error');
          ws.close(4000, 'Authentication error');
          return;
        }
        let connectedDoc: typeof doc;
        try {
          connectedDoc = await yjsService.handleConnection(ws.raw, documentId);
        } catch (err) {
          wsLog.error(`Failed to initialize Yjs connection for ${documentId}`, err);
          ws.send('access-denied:error');
          ws.close(4000, 'Authentication error');
          return;
        }

        doc = connectedDoc;
        authenticated = true;
        wsLog.info(`Authenticated for ${documentId} (user: ${sessionData.username})`);
        ws.send('authenticated');

        // Open a writing session for this connection (best-effort).
        await tryStartSession(sessionData.userId, project.id);

        // Register this user against the raw WebSocket so the elements doc
        // update listener can attribute mutations to them. For elements docs,
        // also attach the snapshot-diff observer (idempotent).
        if (ws.raw) {
          yjsService.registerUserConnection(ws.raw, documentId, sessionData.userId);
          if (isElementsDoc(documentId)) {
            yjsService.watchElementsDoc(documentId, project.id, db);
          }
        }

        for (const data of pendingMessages) {
          const bytes = new Uint8Array(data);
          const peeked = peekFrameTag(bytes);
          if (peeked && peeked.tag === Y_MESSAGE_PRESENCE) {
            if (isElementsDocumentId(documentId)) {
              const projectKey = projectKeyForDocumentId(documentId);
              if (projectKey && ws.raw) {
                presenceService.handleMessage(
                  projectKey,
                  ws.raw as unknown as PresenceSocket,
                  peeked.decoder,
                  bytes
                );
              }
            }
            continue;
          }
          const buffer = Buffer.from(data);
          if (!canWrite && isBlockedForViewer(buffer, documentId)) continue;
          yjsService.handleMessage(ws.raw, doc, buffer);
        }
        pendingMessages = [];

        pingInterval = startPingInterval(ws, documentId, () => {
          pingInterval = null;
        });
      } finally {
        authInProgress = false;
      }
    };

    return {
      onOpen(_event, _ws) {
        // Don't set up Yjs yet - wait for authentication
        wsLog.debug(`Connected for ${documentId}, awaiting authentication...`);
      },

      async onMessage(event, ws) {
        // Text messages carry the authentication token
        if (typeof event.data === 'string') {
          if (event.data === PRESENCE_KEEPALIVE_PING) {
            if (authenticated) ws.send(PRESENCE_KEEPALIVE_PONG);
            return;
          }
          try {
            await authenticateWs(event.data, ws);
          } catch (error) {
            wsLog.error(`Auth error for ${documentId}`, error);
            ws.send('access-denied:error');
            ws.close(4000, 'Authentication error');
          }
          return;
        }

        // Binary messages are Yjs sync protocol — UNLESS the outer
        // multiplex byte marks this as a presence frame.
        if (event.data instanceof ArrayBuffer) {
          if (!authenticated || !doc) {
            pendingMessages.push(event.data);
            return;
          }

          const bytes = new Uint8Array(event.data);
          const peeked = peekFrameTag(bytes);
          if (peeked && peeked.tag === Y_MESSAGE_PRESENCE) {
            // Presence is project-scoped and only travels on the elements
            // WS. Drop presence frames that arrive on per-document sockets
            // so a buggy/forked client cannot inflate the registry with
            // duplicate sessions.
            if (!isElementsDocumentId(documentId)) {
              wsLog.debug(`Ignoring presence frame on non-elements doc ${documentId}`);
              return;
            }
            const projectKey = projectKeyForDocumentId(documentId);
            if (!projectKey || !ws.raw) return;
            presenceService.handleMessage(
              projectKey,
              ws.raw as unknown as PresenceSocket,
              peeked.decoder,
              bytes
            );
            return;
          }

          const buffer = Buffer.from(event.data);
          if (!canWrite && isBlockedForViewer(buffer, documentId)) return;
          yjsService.handleMessage(ws.raw, doc, buffer);
        }
      },

      onClose(_event, ws) {
        wsLog.debug(`Closed for ${documentId}`);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        // Finalize writing session BEFORE handing off to yjs disconnect, so
        // we read the final word count while the doc is still in-memory.
        // Fire-and-forget: don't block the close handler on the DB write.
        void tryFinalizeSession();
        if (ws.raw) {
          yjsService.unregisterUserConnection(ws.raw, documentId);
          presenceService.removeSocket(ws.raw as unknown as PresenceSocket);
        }
        if (doc) {
          yjsService.handleDisconnect(ws.raw, doc);
        }
      },

      onError(evt, ws) {
        wsLog.error(`Error for ${documentId}`, evt);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        if (ws.raw) {
          presenceService.removeSocket(ws.raw as unknown as PresenceSocket);
        }
      },
    };
  })
);

export default app;
