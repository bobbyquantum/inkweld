/**
 * Canonical Y.Xml{Fragment,Element,Text} → Inkweld ProseMirror XML
 * serializer.
 *
 * Designed as a round-trip pair with `./parser.ts`: every value
 * produced here can be fed back through `parseXmlToYjsNodes` and yield
 * an equivalent Yjs structure.
 *
 * Tag-name casing
 * ---------------
 * y-prosemirror stores node names verbatim from the ProseMirror schema
 * (e.g. `elementRef`, `codeBlock`, `listItem`). Lowercasing them here
 * would silently drop unknown-node references when the XML is reapplied
 * to a fragment, so we always preserve the original casing.
 *
 * Lossy-mark preservation
 * -----------------------
 * Inkweld marks that have no corresponding HTML-style tag (comment,
 * text_color, text_background_color, …) are emitted as
 * `<span data-mark="markName" attrA="..." attrB="...">` so they
 * round-trip without loss. Attribute names are emitted verbatim so the
 * schema's exact casing (`commentId`, `authorName`, …) survives.
 */

import type * as YModule from 'yjs';
import { escapeXmlAttr, escapeXmlText } from './entities';
import { parseXmlToYjsNodes } from './parser';
import { BLOCK_NODE_NAMES, LINK_ATTR_NAMES, MARK_TO_TAG } from './tags';

/** Build a single mark wrapper around already-serialized inner content. */
function wrapInMarkTag(
  markName: string,
  markAttrs: Record<string, unknown>,
  innerContent: string
): string {
  const tagName = MARK_TO_TAG[markName];

  if (tagName === 'a') {
    const attrParts = LINK_ATTR_NAMES.filter(
      (k) => markAttrs[k] !== undefined && markAttrs[k] !== null
    ).map((k) => `${k}="${escapeXmlAttr(String(markAttrs[k]))}"`);
    return attrParts.length > 0
      ? `<a ${attrParts.join(' ')}>${innerContent}</a>`
      : `<a>${innerContent}</a>`;
  }

  if (tagName) {
    return `<${tagName}>${innerContent}</${tagName}>`;
  }

  // Generic / lossy mark — emit as <span data-mark="...">.
  const attrParts = [`data-mark="${escapeXmlAttr(markName)}"`];
  for (const [key, value] of Object.entries(markAttrs)) {
    if (value === undefined || value === null) continue;
    const strValue =
      typeof value === 'object'
        ? JSON.stringify(value)
        : // eslint-disable-next-line @typescript-eslint/no-base-to-string -- primitive coercion of unknown leaf value
          String(value);
    attrParts.push(`${key}="${escapeXmlAttr(strValue)}"`);
  }
  return `<span ${attrParts.join(' ')}>${innerContent}</span>`;
}

interface DeltaOp {
  insert: string;
  attributes?: Record<string, Record<string, unknown>>;
}

function xmlTextToString(text: YModule.XmlText): string {
  const delta = text.toDelta() as DeltaOp[];

  let result = '';
  for (const op of delta) {
    let fragment = escapeXmlText(op.insert);
    if (op.attributes) {
      // Sort mark names for deterministic output — the parser is
      // order-insensitive but stable serialization simplifies diffing.
      const sortedMarks = Object.keys(op.attributes).sort((a, b) => a.localeCompare(b));
      for (const markName of sortedMarks) {
        fragment = wrapInMarkTag(markName, op.attributes[markName] ?? {}, fragment);
      }
    }
    result += fragment;
  }
  return result;
}

function xmlElementToString(Y: typeof YModule, element: YModule.XmlElement): string {
  const tagName = element.nodeName;

  const attrs: string[] = [];
  for (const [key, value] of Object.entries(element.getAttributes())) {
    if (value === undefined || value === null) continue;
    const strValue =
      typeof value === 'object'
        ? JSON.stringify(value)
        : // eslint-disable-next-line @typescript-eslint/no-base-to-string -- primitive coercion of unknown leaf value
          String(value);
    attrs.push(`${key}="${escapeXmlAttr(strValue)}"`);
  }
  const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

  let content = '';
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i);
    if (child instanceof Y.XmlElement) {
      content += xmlElementToString(Y, child);
    } else if (child instanceof Y.XmlText) {
      content += xmlTextToString(child);
    }
  }

  if (content === '' && !BLOCK_NODE_NAMES.has(tagName)) {
    return `<${tagName}${attrsStr}/>`;
  }

  return `<${tagName}${attrsStr}>${content}</${tagName}>`;
}

/**
 * Serialize a Y.XmlFragment to a canonical Inkweld ProseMirror XML
 * string. The result can be round-tripped via `parseXmlToYjsNodes`.
 */
export function serializeYjsFragmentToXml(
  Y: typeof YModule,
  fragment: YModule.XmlFragment
): string {
  let xml = '';
  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i);
    if (child instanceof Y.XmlElement) {
      xml += xmlElementToString(Y, child);
    } else if (child instanceof Y.XmlText) {
      xml += xmlTextToString(child);
    }
  }
  return xml;
}

/**
 * Replace the contents of `fragment` with the nodes parsed from
 * `xmlString`, applied as forward CRDT operations inside a single
 * transaction so all connected clients see the change atomically.
 */
export function applyXmlToYjsFragment(
  Y: typeof YModule,
  ydoc: YModule.Doc,
  fragment: YModule.XmlFragment,
  xmlString: string
): void {
  const nodes = parseXmlToYjsNodes(Y, xmlString);

  Y.transact(ydoc, () => {
    if (fragment.length > 0) {
      fragment.delete(0, fragment.length);
    }
    if (nodes.length > 0) {
      fragment.insert(0, nodes);
    }
  });
}
