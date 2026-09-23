import * as Y from 'yjs';

/**
 * Base64 of a Yjs snapshot (state vector + delete set) of `ydoc`.
 *
 * The bulk-sync fast path compares this against the checkpoint taken at the
 * last sync to prove the device has no unsynced edits. The state vector alone
 * is not enough: a delete-only edit (removing text) adds nothing to it, so a
 * document edited that way offline would compare equal and never be pushed.
 */
export function yjsStateDigest(ydoc: Y.Doc): string {
  let binary = '';
  for (const byte of Y.encodeSnapshot(Y.snapshot(ydoc))) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}
