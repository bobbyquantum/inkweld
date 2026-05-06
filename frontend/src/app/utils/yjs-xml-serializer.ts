/**
 * Frontend façade over the canonical Inkweld ProseMirror XML
 * parser/serializer in `@inkweld/prosemirror/xml`.
 *
 * The XML logic itself now lives in the shared package so that backend
 * and frontend stay byte-for-byte compatible. This module preserves the
 * historical public API surface — `xmlFragmentToXmlString`,
 * `applyXmlToFragment`, `yjsMapToJson`, `applyJsonToYjsMap` — by
 * re-exporting the shared functions under their original names and
 * keeping the Y.Map ↔ JSON helpers (which are not XML-related).
 *
 * @module yjs-xml-serializer
 */

import {
  applyXmlToYjsFragment,
  serializeYjsFragmentToXml,
} from '@inkweld/prosemirror/xml';
import * as Y from 'yjs';

/**
 * Serialize a Yjs XmlFragment to XML string.
 *
 * The resulting XML can be reimported using {@link applyXmlToFragment}.
 *
 * @param fragment - The Yjs XmlFragment to serialize
 * @returns XML string representation
 *
 * @example
 * ```typescript
 * const xml = xmlFragmentToXmlString(fragment);
 * // Returns: "<paragraph>Hello <strong>world</strong></paragraph>"
 * ```
 */
export function xmlFragmentToXmlString(fragment: Y.XmlFragment): string {
  return serializeYjsFragmentToXml(Y, fragment);
}

/**
 * Apply XML content to a Yjs XmlFragment as forward CRDT operations.
 *
 * Clears existing content and inserts new content from the XML, all
 * within a single Yjs transaction. This is the CRDT-correct way to
 * restore/replace document content.
 *
 * @param ydoc - The Yjs document containing the fragment
 * @param fragment - The XmlFragment to update
 * @param xmlString - XML string to parse and apply
 *
 * @example
 * ```typescript
 * const ydoc = new Y.Doc();
 * const fragment = ydoc.getXmlFragment('prosemirror');
 * applyXmlToFragment(ydoc, fragment, '<paragraph>New content</paragraph>');
 * ```
 */
export function applyXmlToFragment(
  ydoc: Y.Doc,
  fragment: Y.XmlFragment,
  xmlString: string
): void {
  applyXmlToYjsFragment(Y, ydoc, fragment, xmlString);
}

/**
 * Serialize worldbuilding data from a Yjs Map to plain JSON.
 *
 * @param dataMap - The Yjs Map containing worldbuilding data
 * @returns Plain JSON object
 */
export function yjsMapToJson(dataMap: Y.Map<unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  dataMap.forEach((value, key) => {
    if (value instanceof Y.Map) {
      result[key] = yjsMapToJson(value);
    } else if (value instanceof Y.Array) {
      result[key] = yjsArrayToJson(value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

/**
 * Serialize a Yjs Array to plain JSON.
 */
function yjsArrayToJson(arr: Y.Array<unknown>): unknown[] {
  const result: unknown[] = [];
  arr.forEach(item => {
    if (item instanceof Y.Map) {
      result.push(yjsMapToJson(item));
    } else if (item instanceof Y.Array) {
      result.push(yjsArrayToJson(item));
    } else {
      result.push(item);
    }
  });
  return result;
}

/**
 * Apply JSON data to a Yjs Map as forward CRDT operations.
 *
 * Clears existing data and sets new values within a transaction.
 *
 * @param ydoc - The Yjs document
 * @param dataMap - The Yjs Map to update
 * @param data - Plain JSON object to apply
 */
export function applyJsonToYjsMap(
  ydoc: Y.Doc,
  dataMap: Y.Map<unknown>,
  data: Record<string, unknown>
): void {
  Y.transact(ydoc, () => {
    // Clear existing data
    const keys = Array.from(dataMap.keys());
    for (const key of keys) {
      dataMap.delete(key);
    }
    // Set new data
    for (const [key, value] of Object.entries(data)) {
      dataMap.set(key, value);
    }
  });
}
