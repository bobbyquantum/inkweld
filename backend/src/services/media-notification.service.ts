import { logger } from './logger.service';

const log = logger.child('MediaNotification');

/**
 * Media change event sent to connected WebSocket clients
 */
export interface MediaChangeEvent {
  type: 'media-changed';
  projectKey: string;
  filename: string;
  action: 'uploaded' | 'deleted';
  timestamp: string;
}

/**
 * Service for notifying connected clients about media changes in a project.
 *
 * When a user uploads or deletes media, other clients connected to the same
 * project are notified via WebSocket so they can trigger a sync.
 *
 * Clients subscribe per project key (username/slug). Authentication is handled
 * by the WebSocket route before connections are registered here.
 */
class MediaNotificationService {
  /**
   * Map of project key -> Set of connected WebSocket clients
   * Project key format: "username/slug"
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime
  private connections = new Map<string, Set<any>>();

  /**
   * Register a WebSocket client for media notifications on a project
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime
  addConnection(projectKey: string, ws: any): void {
    if (!this.connections.has(projectKey)) {
      this.connections.set(projectKey, new Set());
    }
    const clients = this.connections.get(projectKey);
    if (clients) {
      clients.add(ws);
      log.debug(`Client connected for media notifications: ${projectKey} (${clients.size} total)`);
    }
  }

  /**
   * Remove a WebSocket client from notifications
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime
  removeConnection(projectKey: string, ws: any): void {
    const clients = this.connections.get(projectKey);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.connections.delete(projectKey);
      }
      log.debug(
        `Client disconnected from media notifications: ${projectKey} (${clients.size} remaining)`
      );
    }
  }

  /**
   * Notify all connected clients (except the sender) that media has changed
   */
  notifyMediaChanged(
    projectKey: string,
    filename: string,
    action: 'uploaded' | 'deleted',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebSocket type varies by runtime
    excludeWs?: any
  ): void {
    const clients = this.connections.get(projectKey);
    if (!clients || clients.size === 0) {
      return;
    }

    const event: MediaChangeEvent = {
      type: 'media-changed',
      projectKey,
      filename,
      action,
      timestamp: new Date().toISOString(),
    };

    const message = JSON.stringify(event);
    let sent = 0;

    for (const ws of clients) {
      if (ws !== excludeWs) {
        try {
          ws.send(message);
          sent++;
        } catch (error) {
          log.error(`Error sending media notification to client`, error);
          // Remove broken connection
          clients.delete(ws);
        }
      }
    }

    if (sent > 0) {
      log.debug(
        `Notified ${sent} client(s) of media change: ${action} ${filename} in ${projectKey}`
      );
    }
  }

  /**
   * Get the number of connected clients for a project
   */
  getConnectionCount(projectKey: string): number {
    return this.connections.get(projectKey)?.size ?? 0;
  }

  /**
   * Clean up all connections
   */
  cleanup(): void {
    this.connections.clear();
  }
}

export const mediaNotificationService = new MediaNotificationService();
