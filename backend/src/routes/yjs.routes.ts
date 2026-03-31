import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { yjsService } from '../services/yjs.service';
import { authService } from '../services/auth.service';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { type AppContext } from '../types/context';
import { logger } from '../services/logger.service';

const wsLog = logger.child('WebSocket');
const app = new Hono<AppContext>();

function parseDocumentOwner(documentId: string): { projectOwner: string; slug: string } | null {
  let docIdForParsing = documentId;
  if (docIdForParsing.startsWith('worldbuilding:')) {
    docIdForParsing = docIdForParsing.substring('worldbuilding:'.length);
  }
  const parts = docIdForParsing.split(':');
  if (parts.length < 2) return null;
  return { projectOwner: parts[0], slug: parts[1] };
}

function isBlockedForViewer(buffer: Buffer, documentId: string): boolean {
  const messageType = buffer[0];

  if (messageType === 2) {
    wsLog.debug(`Blocked update message from read-only viewer for ${documentId}`);
    return true;
  }

  if (messageType === 0 && buffer.length > 1) {
    const syncMessageType = buffer[1];
    if (syncMessageType === 1) {
      wsLog.debug(
        `Blocked sync-step-2 (client sending updates) from read-only viewer for ${documentId}`
      );
      return true;
    }
    if (syncMessageType === 2) {
      wsLog.debug(`Blocked sync-update from read-only viewer for ${documentId}`);
      return true;
    }
  }

  return false;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function startPingInterval(ws: any, documentId: string, onClear: () => void): Timer {
  const PING_INTERVAL = 30000;
  const interval = setInterval(() => {
    try {
      ws.raw.ping();
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
    let canWrite: boolean | null = false; // Viewers can receive but not send updates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Yjs WSSharedDoc type is complex
    let doc: any = null;
    let pingInterval: Timer | null = null;
    // Queue binary messages received before auth is complete
    let pendingMessages: ArrayBuffer[] = [];

    return {
      onOpen(_event, _ws) {
        // Don't set up Yjs yet - wait for authentication
        wsLog.debug(`Connected for ${documentId}, awaiting authentication...`);
      },

      async onMessage(event, ws) {
        // Text messages are for authentication
        if (typeof event.data === 'string') {
          if (authenticated) return;

          const token = event.data;

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

            authenticated = true;
            wsLog.info(`Authenticated for ${documentId} (user: ${sessionData.username})`);
            ws.send('authenticated');

            doc = await yjsService.handleConnection(ws.raw, documentId);

            for (const data of pendingMessages) {
              yjsService.handleMessage(ws.raw, doc, Buffer.from(data));
            }
            pendingMessages = [];

            pingInterval = startPingInterval(ws, documentId, () => {
              pingInterval = null;
            });
          } catch (error) {
            wsLog.error(`Auth error for ${documentId}`, error);
            ws.send('access-denied:error');
            ws.close(4000, 'Authentication error');
          }

          return;
        }

        // Binary messages are Yjs sync protocol
        if (event.data instanceof ArrayBuffer) {
          if (!authenticated || !doc) {
            pendingMessages.push(event.data);
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
        if (doc) {
          yjsService.handleDisconnect(ws.raw, doc);
        }
      },

      onError(evt, _ws) {
        wsLog.error(`Error for ${documentId}`, evt);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
      },
    };
  })
);

export default app;
