/**
 * Utilities for serializing and deserializing Yjs XmlFragment to/from XML strings.
 *
 * These functions enable proper roundtripping of ProseMirror content stored in Yjs,
 * which is essential for:
 * - Snapshot create/restore (must use forward CRDT operations)
 * - Project import (applying content to existing documents)
 * - Project export (extracting content for archive)
 *
 * The XML format preserves:
 * - Element tag names (paragraph, heading, etc.)
 * - Element attributes (level, marks, etc.)
 * - Text content
 * - Nested structure
 *
 * @module yjs-xml-serializer
 */

import * as Y from 'yjs';

/**
 * Map from ProseMirror mark name to XML tag name for serialization.
 */
const MARK_TO_TAG: Record<string, string> = {
  strong: 'strong',
  em: 'em',
  u: 'u',
  s: 's',
  code: 'code',
  link: 'a',
};

/**
 * Map from XML tag name to ProseMirror mark name for deserialization.
 * Includes common aliases (e.g., bold → strong, italic → em).
 */
const TAG_TO_MARK: Record<string, string> = {
  strong: 'strong',
  bold: 'strong',
  b: 'strong',
  em: 'em',
  italic: 'em',
  i: 'em',
  u: 'u',
  underline: 'u',
  s: 's',
  strike: 's',
  strikethrough: 's',
  del: 's',
  code: 'code',
  a: 'link',
};

/**
 * Mark attribute names that map to XML element attributes for the link mark.
 * These are placed directly on the `<a>` tag instead of generic `data-` attributes.
 */
const LINK_ATTR_NAMES = ['href', 'title', 'target'];

/**
 * Escape special XML characters in text content.
 */
function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Escape special XML characters in attribute values.
 * Attributes are enclosed in double quotes, so we only need to escape those.
 */
function escapeAttrValue(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

/**
 * Wrap text content in a single mark tag.
 * Known marks use standard HTML-like tags; unknown marks use `<span data-mark="...">`.
 */
function wrapInMarkTag(
  markName: string,
  markAttrs: Record<string, unknown>,
  innerContent: string
): string {
  const tagName = MARK_TO_TAG[markName];

  if (tagName === 'a') {
    // Link mark: place href/title/target as element attributes
    const attrs = LINK_ATTR_NAMES.filter(
      k => markAttrs[k] !== undefined && markAttrs[k] !== null
    )
      .map(k => `${k}="${escapeAttrValue(String(markAttrs[k]))}"`)
      .join(' ');
    return attrs ? `<a ${attrs}>${innerContent}</a>` : `<a>${innerContent}</a>`;
  }

  if (tagName) {
    // Simple known mark (strong, em, u, s, code)
    return `<${tagName}>${innerContent}</${tagName}>`;
  }

  // Unknown / generic mark — use <span data-mark="...">
  const attrParts = [`data-mark="${escapeAttrValue(markName)}"`];
  for (const [key, value] of Object.entries(markAttrs)) {
    if (value !== undefined && value !== null) {
      const strValue: string =
        typeof value === 'object' ? JSON.stringify(value) : String(value); // eslint-disable-line @typescript-eslint/no-base-to-string
      attrParts.push(`${key}="${escapeAttrValue(strValue)}"`);
    }
  }
  return `<span ${attrParts.join(' ')}>${innerContent}</span>`;
}

/**
 * Serialize a Yjs XmlText node to XML string, preserving formatting marks.
 *
 * Uses `toDelta()` to iterate formatting runs. Each run's attributes
 * correspond to ProseMirror marks (bold, italic, link, etc.) which are
 * serialized as nested XML tags.
 */
function xmlTextToXmlString(text: Y.XmlText): string {
  const delta = text.toDelta() as {
    insert: string;
    attributes?: Record<string, Record<string, unknown>>;
  }[];

  let result = '';
  for (const op of delta) {
    let fragment = escapeXml(op.insert);
    if (op.attributes) {
      // Sort mark names for deterministic output
      const sortedMarks = Object.keys(op.attributes).sort((a, b) =>
        a.localeCompare(b)
      );
      // Wrap innermost-first so output reads outermost-first
      for (const markName of sortedMarks) {
        fragment = wrapInMarkTag(
          markName,
          op.attributes[markName] ?? {},
          fragment
        );
      }
    }
    result += fragment;
  }
  return result;
}

/**
 * Serialize a Yjs XmlElement to XML string.
 *
 * Recursively processes all child elements and text nodes.
 */
function xmlElementToXmlString(element: Y.XmlElement): string {
  const tagName = element.nodeName.toLowerCase();

  // Build attributes string
  const attrs: string[] = [];
  const attributes = element.getAttributes();
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      // Handle different value types
      let strValue: string;
      if (typeof value === 'object') {
        strValue = JSON.stringify(value);
      } else {
        strValue = String(value);
      }
      attrs.push(`${key}="${escapeAttrValue(strValue)}"`);
    }
  }
  const attrsStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

  // Build content from children
  let content = '';
  for (let i = 0; i < element.length; i++) {
    const child = element.get(i);
    if (child instanceof Y.XmlElement) {
      content += xmlElementToXmlString(child);
    } else if (child instanceof Y.XmlText) {
      content += xmlTextToXmlString(child);
    }
  }

  // Self-closing tags for empty elements (except certain block elements)
  const blockElements = [
    'paragraph',
    'heading',
    'blockquote',
    'codeBlock',
    'listItem',
  ];
  if (content === '' && !blockElements.includes(tagName)) {
    return `<${tagName}${attrsStr}/>`;
  }

  return `<${tagName}${attrsStr}>${content}</${tagName}>`;
}

/**
 * Serialize a Yjs XmlFragment to XML string.
 *
 * The resulting XML can be reimported using `applyXmlToFragment`.
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
  let xml = '';
  for (let i = 0; i < fragment.length; i++) {
    const child = fragment.get(i);
    if (child instanceof Y.XmlElement) {
      xml += xmlElementToXmlString(child);
    } else if (child instanceof Y.XmlText) {
      xml += xmlTextToXmlString(child);
    }
  }
  return xml;
}

/**
 * Parse an attribute value, handling JSON-encoded objects.
 */
function parseAttrValue(value: string): unknown {
  // Try to parse as JSON for complex values
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  // Handle booleans
  if (value === 'true') return true;
  if (value === 'false') return false;
  // Handle numbers
  const num = Number(value);
  if (!Number.isNaN(num) && value !== '') return num;
  // Return as string
  return value;
}

/**
 * Determine if a DOM element represents a formatting mark (bold, italic, etc.)
 * rather than a structural element (paragraph, heading, etc.).
 *
 * Checks both the known TAG_TO_MARK mapping and the `data-mark` attribute
 * used for generic/unknown marks.
 */
function isMarkElement(element: Element): boolean {
  const tagName = element.nodeName.toLowerCase();
  // Note: hasAttribute is used intentionally — these are XML Element nodes from
  // DOMParser('text/xml'), not HTMLElement, so .dataset is not available.
  return (
    tagName in TAG_TO_MARK ||
    (tagName === 'span' && element.hasAttribute('data-mark'))
  );
}

/**
 * Resolve the ProseMirror mark name and attributes from a DOM element.
 *
 * For known marks (strong, em, a, etc.) the tag name maps directly.
 * For generic marks serialized as `<span data-mark="...">`, the mark name
 * comes from the attribute and remaining attributes become mark attrs.
 */
function getMarkFromElement(element: Element): {
  name: string;
  attrs: Record<string, unknown>;
} {
  const tagName = element.nodeName.toLowerCase();

  // Generic mark via data-mark attribute on <span>
  // Note: hasAttribute/getAttribute used intentionally — these are XML Element
  // nodes from DOMParser('text/xml'), not HTMLElement, so .dataset is unavailable.
  if (tagName === 'span' && element.hasAttribute('data-mark')) {
    const markName = element.getAttribute('data-mark')!;
    const attrs: Record<string, unknown> = {};
    for (const attr of Array.from(element.attributes)) {
      if (attr.name === 'data-mark') continue;
      attrs[attr.name] = parseAttrValue(attr.value);
    }
    return { name: markName, attrs };
  }

  const markName = TAG_TO_MARK[tagName];
  if (markName === 'link') {
    // Link mark: extract href, title, target from element attributes
    const attrs: Record<string, unknown> = {};
    for (const attrName of LINK_ATTR_NAMES) {
      if (element.hasAttribute(attrName)) {
        attrs[attrName] = element.getAttribute(attrName);
      }
    }
    return { name: markName, attrs };
  }

  // Simple mark (strong, em, u, s, code) — no attributes
  return { name: markName, attrs: {} };
}

/**
 * Recursively collect text runs from a DOM subtree, accumulating marks.
 *
 * Mark tags (strong, em, a, etc.) add to the current mark set.
 * Text nodes produce runs with the accumulated marks.
 * Non-mark elements are NOT expected here and will be skipped.
 */
function collectTextRuns(
  node: Node,
  marks: Record<string, Record<string, unknown>>
): { text: string; attrs: Record<string, Record<string, unknown>> }[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (text === '') return [];
    return [{ text, attrs: { ...marks } }];
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;

    if (isMarkElement(element)) {
      const { name, attrs } = getMarkFromElement(element);
      const newMarks = { ...marks, [name]: attrs };
      const runs: {
        text: string;
        attrs: Record<string, Record<string, unknown>>;
      }[] = [];
      for (const child of Array.from(element.childNodes)) {
        runs.push(...collectTextRuns(child, newMarks));
      }
      return runs;
    }
  }

  return [];
}

/**
 * Process the children of a structural DOM element and return Yjs nodes.
 *
 * Inline content (text nodes and mark elements) is coalesced into single
 * XmlText nodes with formatting applied via delta. Structural child elements
 * are converted to XmlElement nodes.
 */
type TextRun = {
  text: string;
  attrs: Record<string, Record<string, unknown>>;
};

/**
 * Convert pending text runs into a single Yjs XmlText with formatting applied.
 */
function textRunsToXmlText(runs: TextRun[]): Y.XmlText {
  const yText = new Y.XmlText();
  const delta = runs.map(run => {
    const entry: {
      insert: string;
      attributes?: Record<string, Record<string, unknown>>;
    } = { insert: run.text };
    if (Object.keys(run.attrs).length > 0) {
      entry.attributes = run.attrs;
    }
    return entry;
  });
  yText.applyDelta(delta);
  return yText;
}

/**
 * Classify a child DOM node and either append text runs or flush and add a structural element.
 */
function processChildNode(
  child: Node,
  pendingRuns: TextRun[],
  result: (Y.XmlElement | Y.XmlText)[]
): TextRun[] {
  if (child.nodeType === Node.TEXT_NODE) {
    const text = child.textContent || '';
    if (text.trim() !== '' || text === ' ') {
      pendingRuns.push({ text, attrs: {} });
    }
    return pendingRuns;
  }

  if (child.nodeType === Node.ELEMENT_NODE) {
    const element = child as Element;
    if (isMarkElement(element)) {
      pendingRuns.push(...collectTextRuns(element, {}));
    } else {
      if (pendingRuns.length > 0) {
        result.push(textRunsToXmlText(pendingRuns));
        pendingRuns = [];
      }
      const yElement = domElementToYjsElement(element);
      if (yElement) result.push(yElement);
    }
  }

  return pendingRuns;
}

function processElementChildren(parent: Element): (Y.XmlElement | Y.XmlText)[] {
  const result: (Y.XmlElement | Y.XmlText)[] = [];
  let pendingRuns: TextRun[] = [];

  for (const child of Array.from(parent.childNodes)) {
    pendingRuns = processChildNode(child, pendingRuns, result);
  }

  if (pendingRuns.length > 0) {
    result.push(textRunsToXmlText(pendingRuns));
  }
  return result;
}

/**
 * Convert a structural DOM Element to a Yjs XmlElement.
 *
 * Mark-tag children are handled by `processElementChildren`, which coalesces
 * them into XmlText with formatting attributes.
 */
function domElementToYjsElement(element: Element): Y.XmlElement | null {
  const yElement = new Y.XmlElement(element.nodeName.toLowerCase());

  // Copy attributes
  for (const attr of Array.from(element.attributes)) {
    const value = parseAttrValue(attr.value);
    yElement.setAttribute(attr.name, value as string);
  }

  // Process children with mark-awareness
  const children = processElementChildren(element);
  if (children.length > 0) {
    yElement.insert(0, children);
  }

  return yElement;
}

/**
 * Apply XML content to a Yjs XmlFragment as forward CRDT operations.
 *
 * This clears the existing content and inserts new content from the XML,
 * all within a single Yjs transaction. This is the CRDT-correct way to
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
  // Wrap in root element for parsing
  const wrapped = `<root>${xmlString}</root>`;
  const parser = new DOMParser();
  const dom = parser.parseFromString(wrapped, 'text/xml');
  const root = dom.documentElement;

  // Check for parse errors
  const parseError = root.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  // Convert all children to Yjs nodes (mark-aware)
  const children = processElementChildren(root);

  // Apply as a single transaction (forward CRDT operations)
  Y.transact(ydoc, () => {
    // Clear existing content
    if (fragment.length > 0) {
      fragment.delete(0, fragment.length);
    }
    // Insert new content
    if (children.length > 0) {
      fragment.insert(0, children);
    }
  });
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
