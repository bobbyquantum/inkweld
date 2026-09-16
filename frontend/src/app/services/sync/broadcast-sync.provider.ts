import * as Y from 'yjs';

/**
 * Prefix for every channel this provider opens. BroadcastChannel names are
 * already scoped to the origin, so the document ID alone would be unique —
 * the prefix only keeps the names recognisable when debugging.
 */
const CHANNEL_PREFIX = 'inkweld-ydoc:';

/**
 * Wire format. `query` opens the handshake, `reply` answers it (carrying the
 * responder's own state vector so the asker can close the loop), and `update`
 * is both the third handshake step and the steady-state edit broadcast.
 */
type BroadcastSyncMessage =
  | { readonly type: 'query'; readonly sv: Uint8Array }
  | {
      readonly type: 'reply';
      readonly sv: Uint8Array;
      readonly diff: Uint8Array;
    }
  | { readonly type: 'update'; readonly diff: Uint8Array };

/**
 * Keeps one Y.Doc in sync across browsing contexts of the same origin — a
 * popped-out document window and the main window, or two tabs on the same
 * project — using a BroadcastChannel.
 *
 * In server mode y-websocket already does this (it opens its own broadcast
 * channel alongside the socket), but local and cloud-sync modes have no
 * WebSocket provider at all. There, y-indexeddb is the only provider, and it
 * never notifies other contexts: a second window would not see an edit until
 * it reloaded. This provider fills that gap, and is harmless when a WebSocket
 * provider is also present because Yjs updates are idempotent.
 *
 * The handshake terminates in three messages and cannot ping-pong:
 *
 * 1. a new context broadcasts `query` with its state vector;
 * 2. every existing context answers `reply` with the edits the newcomer is
 *    missing, plus its own state vector;
 * 3. the newcomer answers each reply with a single `update` carrying whatever
 *    that peer was missing. `update` is never answered.
 */
export class BroadcastSyncProvider {
  private channel: BroadcastChannel | null = null;

  /** True once {@link destroy} has run, so late callbacks become no-ops. */
  private destroyed = false;

  private readonly onDocUpdate = (
    update: Uint8Array,
    origin: unknown
  ): void => {
    // Updates we applied ourselves came from a peer that already has them.
    if (origin === this) return;
    this.post({ type: 'update', diff: update });
  };

  private readonly onDocDestroy = (): void => {
    this.destroy();
  };

  /**
   * @param docId - Identifies the document; contexts sharing an ID sync.
   * @param doc - The Yjs document to keep in sync.
   */
  constructor(
    readonly docId: string,
    private readonly doc: Y.Doc
  ) {
    // Feature-detect rather than assume: BroadcastChannel is missing in some
    // test environments and in server-side rendering. Without it this
    // provider is inert and the document simply behaves as it did before.
    if (typeof BroadcastChannel === 'undefined') return;

    try {
      this.channel = new BroadcastChannel(`${CHANNEL_PREFIX}${docId}`);
    } catch {
      // A blocked or unavailable channel must not break document loading.
      this.channel = null;
      return;
    }

    this.channel.onmessage = (event: MessageEvent<BroadcastSyncMessage>) => {
      this.handleMessage(event.data);
    };

    this.doc.on('update', this.onDocUpdate);
    this.doc.on('destroy', this.onDocDestroy);

    // Ask any context that is already open for what we are missing.
    this.post({ type: 'query', sv: Y.encodeStateVector(this.doc) });
  }

  /**
   * Closes the channel and detaches from the document. Safe to call twice,
   * and called automatically when the document is destroyed.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.doc.off('update', this.onDocUpdate);
    this.doc.off('destroy', this.onDocDestroy);

    if (this.channel) {
      this.channel.onmessage = null;
      try {
        this.channel.close();
      } catch {
        // Already closed, or the context is being torn down.
      }
      this.channel = null;
    }
  }

  private handleMessage(message: BroadcastSyncMessage | null): void {
    if (this.destroyed || !message) return;

    switch (message.type) {
      case 'query':
        // Step 2: tell the newcomer what it is missing, and say what we have
        // so it can tell us what *we* are missing.
        this.post({
          type: 'reply',
          sv: Y.encodeStateVector(this.doc),
          diff: Y.encodeStateAsUpdate(this.doc, message.sv),
        });
        break;

      case 'reply':
        // Step 3: take their edits, then send ours. `update` ends the
        // exchange, so there is no further round trip.
        this.applyRemote(message.diff);
        this.post({
          type: 'update',
          diff: Y.encodeStateAsUpdate(this.doc, message.sv),
        });
        break;

      case 'update':
        this.applyRemote(message.diff);
        break;
    }
  }

  /**
   * Applies a peer's update with this provider as the origin, so
   * {@link onDocUpdate} does not echo it straight back onto the channel.
   */
  private applyRemote(diff: Uint8Array): void {
    if (diff.length === 0) return;
    Y.applyUpdate(this.doc, diff, this);
  }

  private post(message: BroadcastSyncMessage): void {
    if (this.destroyed || !this.channel) return;
    try {
      this.channel.postMessage(message);
    } catch {
      // A closed channel (context unloading) must not surface as an error.
    }
  }
}
