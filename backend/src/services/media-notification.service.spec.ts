import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { mediaNotificationService } from './media-notification.service';

// Reset the singleton between tests
function resetService() {
  mediaNotificationService.cleanup();
}

describe('MediaNotificationService', () => {
  beforeEach(() => {
    resetService();
  });

  describe('addConnection / removeConnection', () => {
    it('should track connections per project key', () => {
      const ws1 = { send: mock(() => {}) };
      const ws2 = { send: mock(() => {}) };

      mediaNotificationService.addConnection('alice/novel', ws1);
      mediaNotificationService.addConnection('alice/novel', ws2);

      expect(mediaNotificationService.getConnectionCount('alice/novel')).toBe(2);
    });

    it('should track separate projects independently', () => {
      const ws1 = { send: mock(() => {}) };
      const ws2 = { send: mock(() => {}) };

      mediaNotificationService.addConnection('alice/novel', ws1);
      mediaNotificationService.addConnection('bob/story', ws2);

      expect(mediaNotificationService.getConnectionCount('alice/novel')).toBe(1);
      expect(mediaNotificationService.getConnectionCount('bob/story')).toBe(1);
    });

    it('should remove connections and clean up empty projects', () => {
      const ws1 = { send: mock(() => {}) };

      mediaNotificationService.addConnection('alice/novel', ws1);
      expect(mediaNotificationService.getConnectionCount('alice/novel')).toBe(1);

      mediaNotificationService.removeConnection('alice/novel', ws1);
      expect(mediaNotificationService.getConnectionCount('alice/novel')).toBe(0);
    });

    it('should handle removing non-existent connections gracefully', () => {
      const ws = { send: mock(() => {}) };
      // Should not throw
      mediaNotificationService.removeConnection('nonexistent/project', ws);
    });
  });

  describe('notifyMediaChanged', () => {
    it('should send notification to all connected clients', () => {
      const ws1 = { send: mock(() => {}) };
      const ws2 = { send: mock(() => {}) };

      mediaNotificationService.addConnection('alice/novel', ws1);
      mediaNotificationService.addConnection('alice/novel', ws2);

      mediaNotificationService.notifyMediaChanged('alice/novel', 'cover.jpg', 'uploaded');

      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).toHaveBeenCalledTimes(1);

      // Verify the message format
      const sent1 = (ws1.send as ReturnType<typeof mock>).mock.calls[0][0] as string;
      const parsed = JSON.parse(sent1);
      expect(parsed.type).toBe('media-changed');
      expect(parsed.projectKey).toBe('alice/novel');
      expect(parsed.filename).toBe('cover.jpg');
      expect(parsed.action).toBe('uploaded');
      expect(parsed.timestamp).toBeDefined();
    });

    it('should exclude the sender when excludeWs is provided', () => {
      const sender = { send: mock(() => {}) };
      const other = { send: mock(() => {}) };

      mediaNotificationService.addConnection('alice/novel', sender);
      mediaNotificationService.addConnection('alice/novel', other);

      mediaNotificationService.notifyMediaChanged('alice/novel', 'image.png', 'uploaded', sender);

      expect(sender.send).not.toHaveBeenCalled();
      expect(other.send).toHaveBeenCalledTimes(1);
    });

    it('should not throw when no clients are connected', () => {
      // Should not throw
      mediaNotificationService.notifyMediaChanged('empty/project', 'file.jpg', 'uploaded');
    });

    it('should remove broken connections on send error', () => {
      const brokenWs = {
        send: mock(() => {
          throw new Error('Connection closed');
        }),
      };
      const goodWs = { send: mock(() => {}) };

      mediaNotificationService.addConnection('alice/novel', brokenWs);
      mediaNotificationService.addConnection('alice/novel', goodWs);

      mediaNotificationService.notifyMediaChanged('alice/novel', 'file.jpg', 'uploaded');

      // Good one should still receive
      expect(goodWs.send).toHaveBeenCalledTimes(1);
      // Broken one should be removed
      expect(mediaNotificationService.getConnectionCount('alice/novel')).toBe(1);
    });

    it('should handle deleted action', () => {
      const ws = { send: mock(() => {}) };
      mediaNotificationService.addConnection('alice/novel', ws);

      mediaNotificationService.notifyMediaChanged('alice/novel', 'old.jpg', 'deleted');

      const sent = (ws.send as ReturnType<typeof mock>).mock.calls[0][0] as string;
      const parsed = JSON.parse(sent);
      expect(parsed.action).toBe('deleted');
    });

    it('should not notify clients of other projects', () => {
      const aliceWs = { send: mock(() => {}) };
      const bobWs = { send: mock(() => {}) };

      mediaNotificationService.addConnection('alice/novel', aliceWs);
      mediaNotificationService.addConnection('bob/story', bobWs);

      mediaNotificationService.notifyMediaChanged('alice/novel', 'cover.jpg', 'uploaded');

      expect(aliceWs.send).toHaveBeenCalledTimes(1);
      expect(bobWs.send).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should clear all connections', () => {
      const ws1 = { send: mock(() => {}) };
      const ws2 = { send: mock(() => {}) };

      mediaNotificationService.addConnection('alice/novel', ws1);
      mediaNotificationService.addConnection('bob/story', ws2);

      mediaNotificationService.cleanup();

      expect(mediaNotificationService.getConnectionCount('alice/novel')).toBe(0);
      expect(mediaNotificationService.getConnectionCount('bob/story')).toBe(0);
    });
  });
});
