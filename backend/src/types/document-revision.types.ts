/**
 * Per-document revision tokens used by the bulk-sync manifest.
 *
 * A revision is an **opaque** token that changes whenever the server's stored
 * copy of a document changes (and must not change otherwise). A client that
 * last synced revision `R` and has no local edits can skip a document whose
 * current revision is still `R`, without opening a WebSocket for it.
 *
 * The token is deliberately not interpreted by the client — each runtime picks
 * the cheapest monotonic value it can read:
 *  - Bun/LevelDB: the document's latest update clock (an integer, read with a
 *    single reverse LevelDB scan).
 *  - Cloudflare: the newest persisted `update:*` row key, or — once compaction
 *    has removed every update row — a unique marker written with the snapshot.
 */
export interface DocumentRevisionEntry {
  documentId: string;
  /**
   * Latest revision token for the document, or `null` when the document has
   * never been written to server storage (nothing to pull).
   */
  revision: string | null;
  /**
   * Set when the revision could not be determined. Clients must treat such a
   * document as needing a sync rather than skipping it — an unreadable
   * revision is not the same as "unchanged".
   */
  unknown?: boolean;
}
