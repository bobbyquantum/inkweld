/**
 * Read-modify-write access to a Yjs document from an HTTP route, on either
 * runtime.
 *
 * - Bun: the live shared document held by `yjsService` (LevelDB). Edits made
 *   in a transaction are persisted and broadcast to connected clients as they
 *   happen; `commit()` has nothing left to do.
 * - Cloudflare Workers: the document lives in the project's Durable Object,
 *   and `yjsService` cannot run there (LevelDB needs `indexedDB`). The full
 *   Yjs state is loaded into a local Y.Doc; `commit()` sends only the changes
 *   made to that copy back to the DO, which applies, persists and broadcasts
 *   them. Edits made by others in between merge like any concurrent edit.
 */

import { mirrorCanvasToElement } from '@inkweld/canvas';
import * as Y from 'yjs';
import type { DurableObjectNamespace } from '../types/cloudflare';
import { YjsWorkerService } from './yjs-worker.service';

/**
 * Where a route's documents live: the Durable Object namespace and the
 * caller's bearer token (which the DO verifies) on Workers; nothing on Bun.
 */
export interface DocumentRuntime {
  env?: { YJS_PROJECTS?: DurableObjectNamespace };
  authToken?: string;
}

export interface CommitOptions {
  /**
   * A canvas whose contents to mirror onto its element's metadata, once these
   * edits are in. It is done on the document that holds them merged with
   * everyone else's: a Worker's copy may predate them, and two copies that each
   * rewrote the element would leave it in the project twice.
   */
  mirrorCanvas?: string;
}

export interface EditableDocument {
  doc: Y.Doc;
  /** Persist the edits made to `doc`. A no-op when nothing changed. */
  commit(options?: CommitOptions): Promise<void>;
}

/** Open `documentId` for editing on whichever runtime `runtime` describes. */
export async function openEditableDocument(
  documentId: string,
  runtime?: DocumentRuntime
): Promise<EditableDocument> {
  const namespace = runtime?.env?.YJS_PROJECTS;
  if (namespace) {
    return openWorkerDocument(documentId, namespace, runtime?.authToken ?? '');
  }

  const { yjsService } = await import('./yjs.service');
  const { doc } = await yjsService.getDocument(documentId);
  return {
    doc,
    commit: ({ mirrorCanvas } = {}) => {
      if (mirrorCanvas) doc.transact(() => mirrorCanvasToElement(doc, mirrorCanvas));
      return Promise.resolve();
    },
  };
}

async function openWorkerDocument(
  documentId: string,
  namespace: DurableObjectNamespace,
  authToken: string
): Promise<EditableDocument> {
  const worker = new YjsWorkerService({ env: { YJS_PROJECTS: namespace }, authToken });
  const doc = new Y.Doc();
  Y.applyUpdate(doc, await worker.getDocumentState(documentId));

  let sentState = Y.encodeStateVector(doc);
  let changed = false;
  doc.on('update', () => {
    changed = true;
  });

  return {
    doc,
    commit: async ({ mirrorCanvas } = {}) => {
      if (!changed) return;
      const update = Y.encodeStateAsUpdate(doc, sentState);
      await worker.applyYjsUpdate(documentId, toBase64(update), { mirrorCanvas });
      sentState = Y.encodeStateVector(doc);
      changed = false;
    },
  };
}

function toBase64(bytes: Uint8Array): string {
  // Chunked so a large document doesn't overflow the argument list.
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCodePoint(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
