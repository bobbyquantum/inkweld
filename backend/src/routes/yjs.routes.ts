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
    let canWrite = false; // Viewers can receive but not send updates
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
          if (authenticated) {
            // Already authenticated, ignore text messages
            return;
          }

          // First text message should be the auth token
          const token = event.data;

          try {
            // Validate the token
            const sessionData = await authService.verifyToken(token, c);
            if (!sessionData) {
              wsLog.warn(`Invalid auth token for ${documentId}`);
              ws.send('access-denied:invalid-token');
              ws.close(4001, 'Invalid token');
              return;
            }

            // Validate document access (format: username:slug:documentId or username:slug:elements)
            const parts = documentId.split(':');
            if (parts.length < 2) {
              wsLog.error(`Invalid document ID format: ${documentId}`);
              ws.send('access-denied:invalid-document');
              ws.close(4002, 'Invalid document ID');
              return;
            }

            const [projectOwner, slug] = parts;

            // Verify project exists and user has access
            const project = await projectService.findByUsernameAndSlug(db, projectOwner, slug);
            if (!project) {
              wsLog.warn(`Project not found: ${projectOwner}/${slug}`);
              ws.send('access-denied:project-not-found');
              ws.close(4003, 'Project not found');
              return;
            }

            // Check access - owner or collaborator
            if (project.userId !== sessionData.userId) {
              // Not the owner, check if they're a collaborator
              const access = await collaborationService.checkAccess(
                db,
                project.id,
                sessionData.userId
              );
              if (!access) {
                wsLog.warn(
                  `User ${sessionData.username} attempted to access project ${projectOwner}/${slug}`
                );
                ws.send('access-denied:forbidden');
                ws.close(4003, 'Access denied');
                return;
              }
              // Collaborator access granted - set write permission based on role
              canWrite = access.canWrite;
              wsLog.info(
                `Collaborator ${sessionData.username} (${access.role}, canWrite: ${canWrite}) accessing project ${projectOwner}/${slug}`
              );
            } else {
              // Owner always has write access
              canWrite = true;
            }

            // Authentication successful!
            authenticated = true;
            wsLog.info(`Authenticated for ${documentId} (user: ${sessionData.username})`);

            // Send success message
            ws.send('authenticated');

            // Now set up Yjs connection
            doc = await yjsService.handleConnection(ws.raw, documentId);

            // Process any binary messages that arrived during auth
            for (const data of pendingMessages) {
              const buffer = Buffer.from(data);
              yjsService.handleMessage(ws.raw, doc, buffer);
            }
            pendingMessages = [];

            // Set up ping heartbeat to keep connection alive
            const PING_INTERVAL = 30000; // 30 seconds
            pingInterval = setInterval(() => {
              try {
                ws.raw.ping();
              } catch (error) {
                wsLog.error(`Error sending ping for ${documentId}, closing connection`, error);
                ws.close();
                if (pingInterval) {
                  clearInterval(pingInterval);
                  pingInterval = null;
                }
              }
            }, PING_INTERVAL);
          } catch (error) {
            wsLog.error(`Auth error for ${documentId}`, error);
            ws.send('access-denied:error');
            ws.close(4000, 'Authentication error');
          }

          return;
        }

        // Binary messages are Yjs sync protocol
        if (event.data instanceof ArrayBuffer) {
          if (authenticated && doc) {
            const buffer = Buffer.from(event.data);

            // For read-only viewers, only allow sync step 1 requests (asking for state)
            // Block: update messages (type 2) and sync step 2 (type 0, subtype 1) which sends updates
            if (!canWrite) {
              // Message type 0 = sync, type 1 = awareness, type 2 = update
              const messageType = buffer[0];

              // Block update messages entirely
              if (messageType === 2) {
                wsLog.debug(`Blocked update message from read-only viewer for ${documentId}`);
                return;
              }

              // For sync messages (type 0), check the sync message type
              // Sync step 1 (subtype 0) = request state - allowed (read-only)
              // Sync step 2 (subtype 1) = send updates - blocked (write)
              // Sync update (subtype 2) = send update - blocked (write)
              if (messageType === 0 && buffer.length > 1) {
                const syncMessageType = buffer[1];
                if (syncMessageType === 1) {
                  wsLog.debug(
                    `Blocked sync-step-2 (client sending updates) from read-only viewer for ${documentId}`
                  );
                  return;
                }
                if (syncMessageType === 2) {
                  wsLog.debug(`Blocked sync-update from read-only viewer for ${documentId}`);
                  return;
                }
              }
            }

            yjsService.handleMessage(ws.raw, doc, buffer);
          } else {
            // Queue message until authenticated
            pendingMessages.push(event.data);
          }
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
