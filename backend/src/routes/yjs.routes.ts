import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { yjsService } from '../services/yjs.service';
import { authService } from '../services/auth.service';
import { projectService } from '../services/project.service';
import { type AppContext } from '../types/context';

const app = new Hono<AppContext>();

// WebSocket upgrade handler for Yjs collaboration
app.get(
  '/yjs',
  upgradeWebSocket(async (c) => {
    const documentId = c.req.query('documentId');

    if (!documentId) {
      console.error('Missing documentId parameter');
      return {};
    }

    // Authentication check
    const db = c.get('db');
    const user = await authService.getUserFromSession(db, c);
    if (!user) {
      console.error('Unauthorized WebSocket connection attempt');
      return {};
    }

    // Validate document access (format: username:slug:documentId or username:slug:elements)
    const parts = documentId.split(':');
    if (parts.length < 2) {
      console.error(`Invalid document ID format: ${documentId}`);
      return {};
    }

    const [username, slug] = parts;

    // Verify project exists and user has access
    const project = await projectService.findByUsernameAndSlug(db, username, slug);
    if (!project) {
      console.error(`Project not found: ${username}/${slug}`);
      return {};
    }

    // Check access - owner or collaborator
    if (project.userId !== user.id) {
      // TODO: Check collaborator access when implemented
      console.error(`User ${user.username} attempted to access project ${username}/${slug}`);
      return {};
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Yjs WSSharedDoc type is complex
    let doc: any = null;
    let pingInterval: Timer | null = null;
    // Queue messages received before doc is ready (fixes race condition where
    // client sends syncStep1 before handleConnection completes)
    let pendingMessages: ArrayBuffer[] = [];
    let docReady = false;

    return {
      async onOpen(_event, ws) {
        // Store the doc for use in other handlers
        doc = await yjsService.handleConnection(ws.raw, documentId);

        // Process any messages that arrived while we were setting up
        docReady = true;
        for (const data of pendingMessages) {
          const buffer = Buffer.from(data);
          yjsService.handleMessage(ws.raw, doc, buffer);
        }
        pendingMessages = [];

        // Set up ping heartbeat to keep connection alive and detect broken connections
        // This is especially important when browser tabs go out of focus
        // In Bun, pong responses are handled automatically at the protocol level
        // If ping() throws an error, the connection is broken
        const PING_TIMEOUT = 30000; // 30 seconds

        pingInterval = setInterval(() => {
          try {
            // Send ping - if connection is broken, this will throw an error
            ws.raw.ping();
          } catch (error) {
            console.error(`Error sending ping for ${documentId}, closing connection:`, error);
            ws.close();
            if (pingInterval) {
              clearInterval(pingInterval);
              pingInterval = null;
            }
          }
        }, PING_TIMEOUT);
      },
      onMessage(event, ws) {
        // Yjs messages are binary
        if (event.data instanceof ArrayBuffer) {
          if (docReady && doc) {
            const buffer = Buffer.from(event.data);
            yjsService.handleMessage(ws.raw, doc, buffer);
          } else {
            // Queue message until doc is ready
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
