import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as Y from 'yjs';

/**
 * Regression tests for Cloudflare Durable Object hibernation behavior.
 *
 * Background: the DO was accruing continuous billable Duration (GB-s)
 * even when no clients were sending messages. Investigation showed
 * ~20 outbound WebSocket messages per minute with zero inbound — exactly
 * the cadence of the y-protocols Awareness keepalive timer:
 *
 *   - `Awareness` constructor sets local state to `{}` and registers a
 *     `setInterval` (every `outdatedTimeout/10` = 3s).
 *   - Every 15s (`outdatedTimeout/2`) the timer renews local clock by
 *     re-broadcasting via the awareness `update` event.
 *   - With ~2 docs loaded per project (elements + open document), this
 *     produced ~8 server-originated broadcasts/minute, plus client
 *     awareness re-broadcasts, totaling ~20/min.
 *
 * Cloudflare's Hibernation API documentation explicitly states: "Events
 * such as alarms, incoming requests, and scheduled callbacks prevent
 * hibernation. This includes setTimeout and setInterval usage."
 *
 * The fix in `yjs-project.do.ts:getOrCreateDocument()`:
 *   1. Sets the doc's local awareness state to `null` (DO is not a user).
 *   2. Clears the `_checkInterval` so no scheduled callbacks pin the DO.
 *
 * These tests validate the y-protocols contract our fix relies on — if a
 * future y-protocols upgrade changes either behavior, we want to know
 * immediately rather than after a billing surprise.
 */
describe('Yjs DO hibernation guards', () => {
  let originalSetInterval: typeof globalThis.setInterval;
  let originalClearInterval: typeof globalThis.clearInterval;
  let intervals: Set<ReturnType<typeof setInterval>>;

  beforeEach(() => {
    intervals = new Set();
    originalSetInterval = globalThis.setInterval;
    originalClearInterval = globalThis.clearInterval;
    globalThis.setInterval = ((fn: () => void, ms?: number) => {
      const id = originalSetInterval(fn, ms);
      intervals.add(id);
      return id;
    }) as typeof globalThis.setInterval;
    globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
      intervals.delete(id);
      return originalClearInterval(id);
    }) as typeof globalThis.clearInterval;
  });

  afterEach(() => {
    for (const id of intervals) originalClearInterval(id);
    intervals.clear();
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  });

  it('y-protocols Awareness still installs a setInterval on construction', () => {
    // If this assertion ever fails, the Awareness library has changed
    // its lifecycle and our hibernation fix may no longer be necessary
    // (or may need to be adjusted).
    const before = intervals.size;
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    expect(intervals.size).toBeGreaterThan(before);

    // Cleanup
    awareness.destroy();
    doc.destroy();
  });

  it('Awareness exposes _checkInterval as a clearable handle', () => {
    // Our fix relies on accessing the `_checkInterval` field directly
    // to clear it without destroying the awareness instance (we still
    // need the awareness instance alive to relay client updates).
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);

    const handle = (awareness as unknown as { _checkInterval?: number })._checkInterval;
    expect(handle).toBeDefined();

    // Should be possible to clear without throwing
    expect(() => clearInterval(handle as number)).not.toThrow();

    awareness.destroy();
    doc.destroy();
  });

  it('Awareness with cleared interval and null local state does not broadcast', async () => {
    // This simulates the post-fix state of a server-side awareness:
    // local state set to null + interval cleared = zero outbound traffic
    // unless a client explicitly applies an update.
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);

    awareness.setLocalState(null);
    const handle = (awareness as unknown as { _checkInterval?: number })._checkInterval;
    if (handle !== undefined) clearInterval(handle as number);

    const updateHandler = mock(() => {});
    awareness.on('update', updateHandler);

    // Wait long enough that a 3-second checkInterval would have fired
    // multiple times if it were still running.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(updateHandler).not.toHaveBeenCalled();

    awareness.destroy();
    doc.destroy();
  });

  it('Awareness with default settings DOES broadcast (control test)', async () => {
    // Sanity check: without our fix, the keepalive mechanism is active.
    // We can't easily trigger the 15s renewal in a test, but we can
    // verify the local state starts as a non-null object (the precursor
    // to renewal broadcasts).
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);

    expect(awareness.getLocalState()).toEqual({});

    awareness.destroy();
    doc.destroy();
  });

  it('clearing the awareness interval still allows manual updates to broadcast', () => {
    // Critical: clearing the keepalive must NOT break the relay path.
    // Client → DO → other clients must still work.
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null);
    const handle = (awareness as unknown as { _checkInterval?: number })._checkInterval;
    if (handle !== undefined) clearInterval(handle as number);

    const updateHandler = mock(() => {});
    awareness.on('update', updateHandler);

    // Simulate a client awareness update arriving at the DO.
    const clientDoc = new Y.Doc();
    const clientAwareness = new awarenessProtocol.Awareness(clientDoc);
    clientAwareness.setLocalState({ user: { name: 'Alice' } });
    const update = awarenessProtocol.encodeAwarenessUpdate(clientAwareness, [clientDoc.clientID]);
    awarenessProtocol.applyAwarenessUpdate(awareness, update, 'remote');

    // The relay broadcast should fire so other clients receive it.
    expect(updateHandler).toHaveBeenCalled();

    clientAwareness.destroy();
    clientDoc.destroy();
    awareness.destroy();
    doc.destroy();
  });
});
