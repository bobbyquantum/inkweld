import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { BroadcastSyncProvider } from './broadcast-sync.provider';

/**
 * Minimal stand-in for BroadcastChannel that delivers to the other open
 * channels of the same name, synchronously and never back to the sender —
 * the parts of the real contract these tests depend on. Synchronous delivery
 * keeps the assertions free of timers.
 */
class FakeBroadcastChannel {
  static readonly open = new Set<FakeBroadcastChannel>();

  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  closed = false;

  constructor(readonly name: string) {
    FakeBroadcastChannel.open.add(this);
  }

  postMessage(data: unknown): void {
    if (this.closed) throw new Error('channel is closed');
    for (const peer of FakeBroadcastChannel.open) {
      if (peer === this || peer.name !== this.name || peer.closed) continue;
      // Structured clone: peers must not share the sender's byte buffers.
      peer.onmessage?.({ data: structuredClone(data) } as MessageEvent);
    }
  }

  close(): void {
    this.closed = true;
    FakeBroadcastChannel.open.delete(this);
  }

  static reset(): void {
    FakeBroadcastChannel.open.clear();
  }
}

describe('BroadcastSyncProvider', () => {
  let originalBroadcastChannel: typeof globalThis.BroadcastChannel | undefined;

  beforeEach(() => {
    originalBroadcastChannel = globalThis.BroadcastChannel;
    FakeBroadcastChannel.reset();
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: FakeBroadcastChannel,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    FakeBroadcastChannel.reset();
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: originalBroadcastChannel,
      configurable: true,
      writable: true,
    });
  });

  /** Text of a document's shared 'text' type, as the tests write it. */
  const textOf = (doc: Y.Doc): string => doc.getText('text').toJSON();

  it('sends a local edit to another window holding the same document', () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    const providerA = new BroadcastSyncProvider('doc-1', first);
    const providerB = new BroadcastSyncProvider('doc-1', second);

    first.getText('text').insert(0, 'hello');

    expect(textOf(second)).toBe('hello');

    providerA.destroy();
    providerB.destroy();
  });

  it('gives a newly opened window the edits it missed', () => {
    const existing = new Y.Doc();
    existing.getText('text').insert(0, 'written earlier');
    const providerA = new BroadcastSyncProvider('doc-1', existing);

    // The second window opens after the fact and must catch up.
    const latecomer = new Y.Doc();
    const providerB = new BroadcastSyncProvider('doc-1', latecomer);

    expect(textOf(latecomer)).toBe('written earlier');

    providerA.destroy();
    providerB.destroy();
  });

  it('hands the already-open window whatever the newcomer brings with it', () => {
    const existing = new Y.Doc();
    const providerA = new BroadcastSyncProvider('doc-1', existing);

    // A pop-out reloaded while offline can hold edits nobody else has yet.
    const latecomer = new Y.Doc();
    latecomer.getText('text').insert(0, 'offline work');
    const providerB = new BroadcastSyncProvider('doc-1', latecomer);

    expect(textOf(existing)).toBe('offline work');

    providerA.destroy();
    providerB.destroy();
  });

  it('merges concurrent edits from both windows', () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    const providerA = new BroadcastSyncProvider('doc-1', first);
    const providerB = new BroadcastSyncProvider('doc-1', second);

    first.getText('text').insert(0, 'aaa');
    second.getText('text').insert(0, 'bbb');

    expect(textOf(first)).toBe(textOf(second));
    expect(textOf(first)).toHaveLength(6);

    providerA.destroy();
    providerB.destroy();
  });

  it('ignores documents broadcasting under a different id', () => {
    const first = new Y.Doc();
    const other = new Y.Doc();
    const providerA = new BroadcastSyncProvider('doc-1', first);
    const providerB = new BroadcastSyncProvider('doc-2', other);

    first.getText('text').insert(0, 'hello');

    expect(textOf(other)).toBe('');

    providerA.destroy();
    providerB.destroy();
  });

  it('does not echo a received update back onto the channel', () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    const providerA = new BroadcastSyncProvider('doc-1', first);
    const providerB = new BroadcastSyncProvider('doc-1', second);

    const channelB = [...FakeBroadcastChannel.open].find(
      c => c.onmessage && c.name.endsWith('doc-1')
    );
    expect(channelB).toBeDefined();

    const posts = vi.fn();
    for (const channel of FakeBroadcastChannel.open) {
      const original = channel.postMessage.bind(channel);
      channel.postMessage = (data: unknown) => {
        posts(data);
        original(data);
      };
    }

    first.getText('text').insert(0, 'hello');

    // One broadcast for the edit itself, and nothing bouncing back.
    expect(posts).toHaveBeenCalledTimes(1);

    providerA.destroy();
    providerB.destroy();
  });

  it('stops syncing once destroyed', () => {
    const first = new Y.Doc();
    const second = new Y.Doc();
    const providerA = new BroadcastSyncProvider('doc-1', first);
    const providerB = new BroadcastSyncProvider('doc-1', second);

    providerB.destroy();
    first.getText('text').insert(0, 'hello');

    expect(textOf(second)).toBe('');

    providerA.destroy();
  });

  it('tolerates being destroyed twice', () => {
    const doc = new Y.Doc();
    const provider = new BroadcastSyncProvider('doc-1', doc);

    provider.destroy();

    expect(() => provider.destroy()).not.toThrow();
  });

  it('detaches itself when the document is destroyed', () => {
    const doc = new Y.Doc();
    new BroadcastSyncProvider('doc-1', doc);

    doc.destroy();

    expect(FakeBroadcastChannel.open.size).toBe(0);
  });

  it('stays inert where BroadcastChannel is unavailable', () => {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const doc = new Y.Doc();

    expect(() => {
      const provider = new BroadcastSyncProvider('doc-1', doc);
      doc.getText('text').insert(0, 'hello');
      provider.destroy();
    }).not.toThrow();
    expect(textOf(doc)).toBe('hello');
  });

  it('survives a channel that cannot be opened', () => {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: class {
        constructor() {
          throw new Error('blocked');
        }
      },
      configurable: true,
      writable: true,
    });

    const doc = new Y.Doc();

    expect(() => new BroadcastSyncProvider('doc-1', doc)).not.toThrow();
  });
});
