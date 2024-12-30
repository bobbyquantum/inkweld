import { Node as ProseMirrorNode } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import * as Y from 'yjs';

import { PersistenceAdapter } from './data/websocket-handler';
import { toHexString } from './util/to-hex-string';
// In-memory store for document states
const documentStates = new Map<string, Uint8Array>();

export function dumpDocumentState(docName: string, ydoc: Y.Doc): void {
  const fullState = Y.encodeStateAsUpdate(ydoc);
  const { content, error } = getProsemirrorContent(ydoc);
  console.log(`[DUMMY] Document state for ${docName}:`, {
    state: toHexString(fullState),
    ...(error ? { error } : { content }),
  });
}

export function getProsemirrorContent(ydoc: Y.Doc): {
  content?: string;
  error?: string;
} {
  try {
    const xmlFragment = ydoc.get('prosemirror', Y.XmlFragment);
    const node: ProseMirrorNode = yXmlFragmentToProseMirrorRootNode(
      xmlFragment,
      schema
    );
    return { content: JSON.stringify(node) };
  } catch (error) {
    console.error(error);
    return { error: 'Failed to convert document content' };
  }
}
export const createPersistenceAdapter = (): PersistenceAdapter => ({
  bindState: (docName: string, ydoc: Y.Doc) => {
    console.log(`[DUMMY] Binding state for document: ${docName}`);

    // Apply stored state if it exists
    const state = documentStates.get(docName);
    if (state) {
      try {
        Y.applyUpdate(ydoc, state);
        console.log(`[DUMMY] Applied stored state for ${docName}`);
        dumpDocumentState(docName, ydoc);
      } catch (error) {
        console.error(
          `[DUMMY] Error applying state:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Listen to document updates
    ydoc.on('update', (update: Uint8Array) => {
      try {
        documentStates.set(docName, update);
        console.log(`[DUMMY] Received update for ${docName}:`, {
          updateSize: update.length,
          timestamp: new Date().toISOString(),
          update: toHexString(update),
        });

        dumpDocumentState(docName, ydoc);
      } catch (error) {
        console.error(
          `[DUMMY] Error handling update:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    });
  },
  writeState: (docName: string, ydoc: Y.Doc) => {
    return new Promise<void>((resolve, reject) => {
      try {
        console.log(`[DUMMY] Writing final state for document: ${docName}`);
        const type = ydoc.get('prosemirror', Y.XmlFragment);
        if (!type) {
          throw new Error('No prosemirror content found in document');
        }

        const finalState = Y.encodeStateAsUpdate(ydoc);
        if (!finalState || finalState.length === 0) {
          throw new Error('Invalid document state');
        }

        documentStates.set(docName, finalState);
        dumpDocumentState(docName, ydoc);
        resolve();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[DUMMY] Error writing state for ${docName}:`,
          errorMessage
        );
        reject(new Error(errorMessage));
      }
    });
  },
});
