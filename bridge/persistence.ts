import { Node as ProseMirrorNode } from 'prosemirror-model';
import { schema } from 'prosemirror-schema-basic';
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import { PersistenceAdapter } from 'y-websocket/bin/utils';
import * as Y from 'yjs';

// In-memory store for document states
const documentStates = new Map<string, Uint8Array>();

// Helper function to convert Uint8Array to hex string with spacing for readability
const toHexString = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join(' ');
};

// Helper function to safely get prosemirror content
const getProsemirrorContent = (ydoc: Y.Doc): Record<string, unknown> => {
  try {
    const xmlFragment = ydoc.get('prosemirror', Y.XmlFragment);
    if (!xmlFragment) {
      return { error: 'No prosemirror content found' };
    }

    // Type assertion since we know the schema produces a valid Node
    const node: ProseMirrorNode = yXmlFragmentToProseMirrorRootNode(
      xmlFragment,
      schema
    );
    if (!node) {
      return { error: 'Invalid ProseMirror node' };
    }

    return { content: JSON.stringify(node) };
  } catch (error) {
    console.error(
      'Error converting document to ProseMirror node:',
      error instanceof Error ? error.message : String(error)
    );
    return { error: 'Failed to convert document content' };
  }
};

// Helper function to dump the full state of a document
const dumpDocumentState = (docName: string, ydoc: Y.Doc): void => {
  const fullState = Y.encodeStateAsUpdate(ydoc);
  const { content, error } = getProsemirrorContent(ydoc);

  console.log(`[DUMMY] Document state for ${docName}:`, {
    stateSize: fullState.length,
    timestamp: new Date().toISOString(),
    state: toHexString(fullState),
    ...(error ? { error } : { content }),
  });
};

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
        // Store the update in memory
        documentStates.set(docName, update);
        console.log(`[DUMMY] Received update for ${docName}:`, {
          updateSize: update.length,
          timestamp: new Date().toISOString(),
          update: toHexString(update),
        });

        // Dump full state after applying update
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

        // Verify prosemirror content exists
        const type = ydoc.get('prosemirror', Y.XmlFragment);
        if (!type) {
          throw new Error('No prosemirror content found in document');
        }

        // Get the final state using Y.encodeStateAsUpdate
        const finalState = Y.encodeStateAsUpdate(ydoc);

        // Verify we have valid state data
        if (!finalState || finalState.length === 0) {
          throw new Error('Invalid document state');
        }

        // Store the state
        documentStates.set(docName, finalState);

        // Dump final state
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
