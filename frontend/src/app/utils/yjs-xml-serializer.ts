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
 * Escape special XML characters in text content.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape special XML characters in attribute values.
 * Attributes are enclosed in double quotes, so we only need to escape those.
 */
function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/**
 * Serialize a Yjs XmlText node to XML string.
 */
function xmlTextToXmlString(text: Y.XmlText): string {
  // XmlText can have formatting runs with different attributes
  // For now, we just get the plain text content
  // TODO: Handle text formatting marks if needed
  const textContent = text.toString() as string;
  return escapeXml(textContent);
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
      const strValue =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
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
 * // Returns: "<paragraph>Hello <text bold="true">world</text></paragraph>"
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
  if (!isNaN(num) && value !== '') return num;
  // Return as string
  return value;
}

/**
 * Recursively convert a DOM Node to a Yjs XmlElement or XmlText.
 */
function domNodeToYjsNode(node: Node): Y.XmlElement | Y.XmlText | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (text.trim() === '' && text !== ' ') {
      // Skip whitespace-only text nodes (but preserve single spaces)
      return null;
    }
    const yText = new Y.XmlText();
    yText.insert(0, text);
    return yText;
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const yElement = new Y.XmlElement(element.nodeName.toLowerCase());

    // Copy attributes
    for (const attr of Array.from(element.attributes)) {
      const value = parseAttrValue(attr.value);
      // Yjs setAttribute accepts any value at runtime, but TypeScript types are strict
      yElement.setAttribute(attr.name, value as string);
    }

    // Process children
    const children: (Y.XmlElement | Y.XmlText)[] = [];
    for (let i = 0; i < element.childNodes.length; i++) {
      const childNode = domNodeToYjsNode(element.childNodes[i]);
      if (childNode) {
        children.push(childNode);
      }
    }

    if (children.length > 0) {
      yElement.insert(0, children);
    }

    return yElement;
  }

  return null;
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

  // Convert all children to Yjs nodes
  const children: (Y.XmlElement | Y.XmlText)[] = [];
  for (let i = 0; i < root.childNodes.length; i++) {
    const yNode = domNodeToYjsNode(root.childNodes[i]);
    if (yNode) {
      children.push(yNode);
    }
  }

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
