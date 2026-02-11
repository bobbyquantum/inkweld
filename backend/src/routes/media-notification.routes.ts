import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';
import { authService } from '../services/auth.service';
import { projectService } from '../services/project.service';
import { collaborationService } from '../services/collaboration.service';
import { mediaNotificationService } from '../services/media-notification.service';
import { type AppContext } from '../types/context';
import { logger } from '../services/logger.service';

const log = logger.child('MediaWS');

const app = new Hono<AppContext>();

/**
 * WebSocket endpoint for media change notifications.
 *
 * Uses the same authentication protocol as the Yjs WebSocket:
 * 1. Client connects with ?projectKey=username/slug
 * 2. Client sends auth token as first TEXT message
 * 3. Server validates token and project access
 * 4. Server responds with "authenticated" or "access-denied:reason"
 * 5. After auth, server sends JSON notifications when media changes
 *
 * Clients receive MediaChangeEvent messages:
 * { type: "media-changed", projectKey, filename, action, timestamp }
 */
app.get(
  '/media',
  upgradeWebSocket(async (c) => {
    const projectKey = c.req.query('projectKey');

    if (!projectKey) {
      log.error('Missing projectKey parameter');
      return {};
    }

    // Validate projectKey format (username/slug)
    const parts = projectKey.split('/');
    if (parts.length !== 2) {
      log.error(`Invalid projectKey format: ${projectKey}`);
      return {};
    }

    const db = c.get('db');
    let authenticated = false;
    let pingInterval: Timer | null = null;

    return {
      onOpen(_event, _ws) {
        log.debug(`Media notification client connected for ${projectKey}, awaiting auth...`);
      },

      async onMessage(event, ws) {
        // Only handle text messages (auth token or ping)
        if (typeof event.data !== 'string') return;

        if (authenticated) {
          // After auth, clients can send "ping" to keep alive
          if (event.data === 'ping') {
            ws.send('pong');
          }
          return;
        }

        // First text message is the auth token
        const token = event.data;

        try {
          const sessionData = await authService.verifyToken(token, c);
          if (!sessionData) {
            log.warn(`Invalid auth token for media notifications: ${projectKey}`);
            ws.send('access-denied:invalid-token');
            ws.close(4001, 'Invalid token');
            return;
          }

          const [username, slug] = projectKey.split('/');

          // Verify project exists and user has access
          const project = await projectService.findByUsernameAndSlug(db, username, slug);
          if (!project) {
            log.warn(`Project not found: ${projectKey}`);
            ws.send('access-denied:project-not-found');
            ws.close(4003, 'Project not found');
            return;
          }

          // Check access - owner or collaborator with at least read access
          if (project.userId !== sessionData.userId) {
            const access = await collaborationService.checkAccess(
              db,
              project.id,
              sessionData.userId
            );
            if (!access?.canRead) {
              log.warn(
                `User ${sessionData.username} denied media notification access for ${projectKey}`
              );
              ws.send('access-denied:forbidden');
              ws.close(4003, 'Access denied');
              return;
            }
          }

          // Authentication successful
          authenticated = true;
          log.info(
            `Media notification client authenticated for ${projectKey} (user: ${sessionData.username})`
          );

          ws.send('authenticated');

          // Register for notifications
          mediaNotificationService.addConnection(projectKey, ws.raw);

          // Set up ping heartbeat
          pingInterval = setInterval(() => {
            try {
              ws.raw.ping();
            } catch {
              log.debug(`Ping failed for media notification client: ${projectKey}`);
              ws.close();
              if (pingInterval) {
                clearInterval(pingInterval);
                pingInterval = null;
              }
            }
          }, 30000);
        } catch (error) {
          log.error(`Auth error for media notifications: ${projectKey}`, error);
          ws.send('access-denied:error');
          ws.close(4000, 'Authentication error');
        }
      },

      onClose(_event, ws) {
        log.debug(`Media notification client disconnected: ${projectKey}`);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
        if (authenticated) {
          mediaNotificationService.removeConnection(projectKey, ws.raw);
        }
      },

      onError(evt, _ws) {
        log.error(`Media notification WebSocket error for ${projectKey}`, evt);
        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }
      },
    };
  })
);

export default app;
