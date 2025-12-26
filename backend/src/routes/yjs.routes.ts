import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { yjsService } from '../services/yjs.service';
import { authService } from '../services/auth.service';
import { projectService } from '../services/project.service';
import { type AppContext } from '../types/context';

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
      console.error('Missing documentId parameter');
      return {};
    }

    // Store context for use in handlers (db access needed for auth)
    const db = c.get('db');

    // Connection state
    let authenticated = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Yjs WSSharedDoc type is complex
    let doc: any = null;
    let pingInterval: Timer | null = null;
    // Queue binary messages received before auth is complete
    let pendingMessages: ArrayBuffer[] = [];

    return {
      onOpen(_event, _ws) {
        // Don't set up Yjs yet - wait for authentication
        console.log(`WebSocket connected for ${documentId}, awaiting authentication...`);
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
              console.error(`Invalid auth token for ${documentId}`);
              ws.send('access-denied:invalid-token');
              ws.close(4001, 'Invalid token');
              return;
            }

            // Validate document access (format: username:slug:documentId or username:slug:elements)
            const parts = documentId.split(':');
            if (parts.length < 2) {
              console.error(`Invalid document ID format: ${documentId}`);
              ws.send('access-denied:invalid-document');
              ws.close(4002, 'Invalid document ID');
              return;
            }

            const [projectOwner, slug] = parts;

            // Verify project exists and user has access
            const project = await projectService.findByUsernameAndSlug(db, projectOwner, slug);
            if (!project) {
              console.error(`Project not found: ${projectOwner}/${slug}`);
              ws.send('access-denied:project-not-found');
              ws.close(4003, 'Project not found');
              return;
            }

            // Check access - owner or collaborator
            if (project.userId !== sessionData.userId) {
              console.error(
                `User ${sessionData.username} attempted to access project ${projectOwner}/${slug}`
              );
              ws.send('access-denied:forbidden');
              ws.close(4003, 'Access denied');
              return;
            }

            // Authentication successful!
            authenticated = true;
            console.log(
              `WebSocket authenticated for ${documentId} (user: ${sessionData.username})`
            );

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
                console.error(`Error sending ping for ${documentId}, closing connection:`, error);
                ws.close();
                if (pingInterval) {
                  clearInterval(pingInterval);
                  pingInterval = null;
                }
              }
            }, PING_INTERVAL);
          } catch (error) {
            console.error(`Auth error for ${documentId}:`, error);
            ws.send('access-denied:error');
            ws.close(4000, 'Authentication error');
          }

          return;
        }

        // Binary messages are Yjs sync protocol
        if (event.data instanceof ArrayBuffer) {
          if (authenticated && doc) {
            const buffer = Buffer.from(event.data);
            yjsService.handleMessage(ws.raw, doc, buffer);
          } else {
            // Queue message until authenticated
            pendingMessages.push(event.data);
          }
        }
      },

      onClose(_event, ws) {
        console.log(`WebSocket closed for ${documentId}`);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        if (doc) {
          yjsService.handleDisconnect(ws.raw, doc);
        }
      },

      onError(evt, _ws) {
        console.error(`WebSocket error for ${documentId}:`, evt);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
      },
    };
  })
);

export default app;
