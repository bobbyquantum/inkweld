/**
 * Runtime-aware Yjs Access Layer
 *
 * Provides a unified interface for accessing Yjs documents that works on both:
 * - Bun runtime: Uses LevelDB-based yjsService
 * - Cloudflare Workers: Uses Durable Object HTTP API via YjsWorkerService
 *
 * Runtime detection is based on the presence of ctx.env?.YJS_PROJECTS
 */

import type { McpContext } from '../mcp.types';
import { Element } from '../../schemas/element.schemas';
import { YjsWorkerService, type YjsWorkerContext } from '../../services/yjs-worker.service';

/**
 * Check if running on Cloudflare Workers (has DO bindings)
 */
export function isCloudflareWorkers(ctx: McpContext): boolean {
  return !!ctx.env?.YJS_PROJECTS;
}

/**
 * Get elements for a project (works on both runtimes)
 */
export async function getElements(
  ctx: McpContext,
  username: string,
  slug: string
): Promise<Element[]> {
  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<typeof ctx.env>['YJS_PROJECTS'] },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    return workerService.getElements(username, slug);
  } else {
    // Bun: use LevelDB service (dynamic import to avoid loading y-leveldb on Workers)
    const { yjsService } = await import('../../services/yjs.service');
    const docId = `${username}:${slug}:elements/`;
    const sharedDoc = await yjsService.getDocument(docId);
    const elementsArray = sharedDoc.doc.getArray('elements');
    return elementsArray.toJSON() as Element[];
  }
}

/**
 * Replace all elements in a project (works on both runtimes)
 */
export async function replaceAllElements(
  ctx: McpContext,
  username: string,
  slug: string,
  elements: Element[]
): Promise<void> {
  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<typeof ctx.env>['YJS_PROJECTS'] },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.replaceAllElements(username, slug, elements);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const docId = `${username}:${slug}:elements/`;
    const sharedDoc = await yjsService.getDocument(docId);
    const elementsArray = sharedDoc.doc.getArray('elements');
    sharedDoc.doc.transact(() => {
      elementsArray.delete(0, elementsArray.length);
      elementsArray.insert(0, elements);
    });
  }
}

/**
 * Get a worldbuilding document (works on both runtimes)
 * Returns a wrapper that provides Map-like access to the document data
 */
export interface WorldbuildingDoc {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  toJSON(): Record<string, unknown>;
}

export async function getWorldbuildingDoc(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string
): Promise<WorldbuildingDoc> {
  const docId = `${username}:${slug}:${elementId}/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<typeof ctx.env>['YJS_PROJECTS'] },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    const wrapperDoc = await workerService.getDocument(docId);

    // The worker service returns a read-only wrapper, but we need write capability
    // For now, throw an error for write operations on Workers (not yet implemented)
    const data: Record<string, unknown> = {};
    const rootMap = wrapperDoc.doc.getMap('root');
    const identityMap = wrapperDoc.doc.getMap('identity');

    // Merge root and identity maps
    rootMap.forEach((value, key) => {
      data[key] = value;
    });
    identityMap.forEach((value, key) => {
      data[key] = value;
    });

    return {
      get: (key: string) => data[key],
      set: (_key: string, _value: unknown) => {
        throw new Error('Worldbuilding write not yet supported on Cloudflare Workers');
      },
      has: (key: string) => key in data,
      toJSON: () => ({ ...data }),
    };
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const rootMap = sharedDoc.doc.getMap('root');
    const identityMap = sharedDoc.doc.getMap('identity');

    return {
      get: (key: string) => {
        // Check identity first, then root
        if (identityMap.has(key)) return identityMap.get(key);
        return rootMap.get(key);
      },
      set: (key: string, value: unknown) => {
        // Set in identity map (standard location for worldbuilding)
        identityMap.set(key, value);
      },
      has: (key: string) => identityMap.has(key) || rootMap.has(key),
      toJSON: () => {
        const data: Record<string, unknown> = {};
        rootMap.forEach((v, k) => {
          data[k] = v;
        });
        identityMap.forEach((v, k) => {
          data[k] = v;
        });
        return data;
      },
    };
  }
}

/**
 * Update worldbuilding data (works on both runtimes)
 */
export async function updateWorldbuilding(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string,
  updates: Record<string, unknown>,
  mapName: 'worldbuilding' | 'identity' = 'worldbuilding'
): Promise<void> {
  const docId = `${username}:${slug}:${elementId}/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<typeof ctx.env>['YJS_PROJECTS'] },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);

    // Convert updates to path-based format
    const pathPrefix = mapName === 'identity' ? 'identity.' : 'worldbuilding.';
    const pathUpdates = Object.entries(updates).map(([key, value]) => ({
      path: `${pathPrefix}${key}`,
      value,
    }));
    await workerService.applyUpdates(docId, pathUpdates);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const targetMap = sharedDoc.doc.getMap(mapName);

    sharedDoc.doc.transact(() => {
      for (const [key, value] of Object.entries(updates)) {
        targetMap.set(key, value);
      }
    });
  }
}

/**
 * Update document ProseMirror content (works on both runtimes)
 *
 * Replaces the content of a document's ProseMirror XmlFragment with new XML content.
 * Uses forward CRDT operations (delete + insert) within a Yjs transaction to ensure
 * proper sync with all connected clients.
 *
 * @param ctx - MCP context
 * @param username - Project owner username
 * @param slug - Project slug
 * @param elementId - Document element ID
 * @param xmlContent - ProseMirror XML string (e.g., "<paragraph>Hello world</paragraph>")
 */
export async function updateDocumentContent(
  ctx: McpContext,
  username: string,
  slug: string,
  elementId: string,
  xmlContent: string
): Promise<void> {
  const docId = `${username}:${slug}:${elementId}/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: Send XML to the DO which handles
    // the Yjs XmlFragment operations directly
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<typeof ctx.env>['YJS_PROJECTS'] },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.updateProsemirrorContent(docId, xmlContent);
  } else {
    // Bun: use LevelDB service for direct Yjs access
    const Y = await import('yjs');
    const parsedNodes = parseXmlToYjsNodes(Y, xmlContent);

    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const xmlFragment = sharedDoc.doc.getXmlFragment('prosemirror');

    // Apply as a single transaction (forward CRDT operations)
    sharedDoc.doc.transact(() => {
      // Clear existing content
      if (xmlFragment.length > 0) {
        xmlFragment.delete(0, xmlFragment.length);
      }
      // Insert new content
      if (parsedNodes.length > 0) {
        xmlFragment.insert(0, parsedNodes);
      }
    });
  }
}

// ============================================
// Simple ProseMirror XML Parser
// ============================================

/**
 * Map of inline mark tag names to their ProseMirror mark names.
 * These tags should become formatting attributes on Y.XmlText,
 * NOT Y.XmlElement nodes. y-prosemirror crashes if mark tags
 * are stored as XmlElement because they aren't valid ProseMirror node types.
 */
const MARK_TAGS: Record<string, string> = {
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
};

/**
 * Map of common alternative tag names to their correct ProseMirror node names.
 */
const NODE_TAG_ALIASES: Record<string, string> = {
  numbered_list: 'ordered_list',
  ol: 'ordered_list',
  ul: 'bullet_list',
};

/**
 * Parse a ProseMirror XML string into Yjs XmlElement/XmlText nodes.
 *
 * Handles the simple XML subset used by ProseMirror:
 * - Element tags: <paragraph>, <heading level="1">, <blockquote>, etc.
 * - Self-closing tags: <hard_break/>, <image src="..."/>
 * - Text content (with XML entity decoding)
 * - Nested elements
 * - Inline marks: <bold>, <strong>, <em>, <italic>, etc. → formatted Y.XmlText
 */
function parseXmlToYjsNodes(
  Y: typeof import('yjs'),
  xmlString: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  if (!xmlString.trim()) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes: any[] = [];
  let pos = 0;

  while (pos < xmlString.length) {
    // Skip whitespace between top-level block elements (newlines, indentation)
    // y-prosemirror crashes (toArray not a function) if XmlText nodes appear at fragment level
    if (/\s/.test(xmlString[pos]) && xmlString[pos] !== '<') {
      const wsEnd = xmlString.indexOf('<', pos);
      const ws = xmlString.substring(pos, wsEnd === -1 ? xmlString.length : wsEnd);
      if (!ws.trim()) {
        pos = wsEnd === -1 ? xmlString.length : wsEnd;
        continue;
      }
    }

    const result = parseNode(Y, xmlString, pos);
    if (!result) break;
    for (const node of result.nodes) {
      nodes.push(node);
    }
    if (result.pos <= pos) break; // prevent infinite loop
    pos = result.pos;
  }

  return nodes;
}

/**
 * Parse a single node (element or text) from the XML string at the given position.
 * @param marks - Accumulated inline marks from parent mark tags (e.g., { strong: {}, em: {} })
 */
function parseNode(
  Y: typeof import('yjs'),
  xml: string,
  pos: number,
  marks: Record<string, unknown> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { nodes: any[]; pos: number } | null {
  if (pos >= xml.length) return null;

  // Check if this is a tag
  if (xml[pos] === '<') {
    // Skip comments
    if (xml.startsWith('<!--', pos)) {
      const endComment = xml.indexOf('-->', pos + 4);
      if (endComment === -1) return null;
      return { nodes: [], pos: endComment + 3 };
    }
    // Closing tag - return null to signal parent to stop
    if (xml[pos + 1] === '/') {
      return null;
    }
    return parseElement(Y, xml, pos, marks);
  }

  // Text content - collect until next '<'
  return parseText(Y, xml, pos, marks);
}

/**
 * Parse a text node from the XML string.
 * @param marks - Inline marks to apply as formatting attributes on the XmlText
 */
function parseText(
  Y: typeof import('yjs'),
  xml: string,
  pos: number,
  marks: Record<string, unknown> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { nodes: any[]; pos: number } {
  let end = xml.indexOf('<', pos);
  if (end === -1) end = xml.length;

  const rawText = xml.substring(pos, end);
  const text = decodeXmlEntities(rawText);

  // Skip whitespace-only text that contains newlines (insignificant whitespace
  // between block elements like paragraphs, list items, etc.)
  if (!text.trim() && /\n/.test(text)) {
    return { nodes: [], pos: end };
  }

  const yText = new Y.XmlText();
  const hasMarks = Object.keys(marks).length > 0;
  yText.insert(0, text, hasMarks ? { ...marks } : undefined);

  return { nodes: [yText], pos: end };
}

/**
 * Parse an XML element (opening tag, children, closing tag) from the XML string.
 * Handles both block-level elements (paragraph, heading, etc.) and inline mark tags
 * (bold, italic, etc.). Mark tags are converted to formatted Y.XmlText nodes instead
 * of Y.XmlElement, matching how y-prosemirror represents ProseMirror marks.
 *
 * @param marks - Accumulated inline marks from parent mark tags
 */
function parseElement(
  Y: typeof import('yjs'),
  xml: string,
  pos: number,
  marks: Record<string, unknown> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { nodes: any[]; pos: number } {
  // Parse opening tag: <tagName attr1="val1" attr2="val2">
  // or self-closing: <tagName attr1="val1"/>
  const tagMatch = xml.substring(pos).match(/^<([a-zA-Z_][a-zA-Z0-9_-]*)/);
  if (!tagMatch) {
    // Not a valid tag, treat as text
    return parseText(Y, xml, pos, marks);
  }

  const rawTagName = tagMatch[1].toLowerCase();
  let cursor = pos + tagMatch[0].length;

  // Parse attributes
  const attrs: Record<string, string> = {};
  while (cursor < xml.length) {
    // Skip whitespace
    while (cursor < xml.length && /\s/.test(xml[cursor])) cursor++;

    // Check for end of tag
    if (xml[cursor] === '>' || (xml[cursor] === '/' && xml[cursor + 1] === '>')) {
      break;
    }

    // Parse attribute: name="value" or name='value'
    const attrMatch = xml
      .substring(cursor)
      .match(/^([a-zA-Z_][a-zA-Z0-9_-]*)=(?:"([^"]*)"|'([^']*)')/);
    if (attrMatch) {
      const attrName = attrMatch[1];
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? '';
      attrs[attrName] = decodeXmlEntities(attrValue);
      cursor += attrMatch[0].length;
    } else {
      // Skip unrecognized character
      cursor++;
    }
  }

  // Check if this is an inline mark tag (bold, italic, etc.)
  const markName = MARK_TAGS[rawTagName];
  if (markName) {
    // Build mark value (for link marks include href/title, for others just {})
    const markValue =
      rawTagName === 'a' || markName === 'link'
        ? { href: attrs.href || '', ...(attrs.title ? { title: attrs.title } : {}) }
        : {};
    const newMarks = { ...marks, [markName]: markValue };

    // Self-closing mark (unusual but handle gracefully)
    if (xml[cursor] === '/' && xml[cursor + 1] === '>') {
      return { nodes: [], pos: cursor + 2 };
    }
    if (xml[cursor] === '>') cursor++;

    // Parse children with accumulated marks — returns formatted XmlText nodes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = [];
    const closingTag = `</${rawTagName}>`;
    while (cursor < xml.length) {
      if (xml.substring(cursor).toLowerCase().startsWith(closingTag)) {
        cursor += closingTag.length;
        break;
      }
      const childResult = parseNode(Y, xml, cursor, newMarks);
      if (!childResult) {
        const closeMatch = xml.substring(cursor).match(/^<\/[a-zA-Z_][a-zA-Z0-9_-]*>/);
        if (closeMatch) cursor += closeMatch[0].length;
        break;
      }
      for (const node of childResult.nodes) children.push(node);
      if (childResult.pos <= cursor) break;
      cursor = childResult.pos;
    }
    return { nodes: children, pos: cursor };
  }

  // Regular element — apply node tag aliases (e.g., numbered_list → ordered_list)
  const tagName = NODE_TAG_ALIASES[rawTagName] ?? rawTagName;

  // Check for self-closing tag
  const selfClosing = xml[cursor] === '/' && xml[cursor + 1] === '>';
  if (selfClosing) {
    cursor += 2;
    const yElement = new Y.XmlElement(tagName);
    for (const [key, value] of Object.entries(attrs)) {
      yElement.setAttribute(key, parseAttrValue(value) as string);
    }
    return { nodes: [yElement], pos: cursor };
  }

  // Skip '>'
  if (xml[cursor] === '>') cursor++;

  // Parse children until closing tag
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [];
  const closingTag = `</${rawTagName}>`;

  while (cursor < xml.length) {
    // Check for closing tag
    if (xml.substring(cursor).toLowerCase().startsWith(closingTag)) {
      cursor += closingTag.length;
      break;
    }

    const childResult = parseNode(Y, xml, cursor);
    if (!childResult) {
      // Closing tag of parent element found, advance past it
      const closeMatch = xml.substring(cursor).match(/^<\/[a-zA-Z_][a-zA-Z0-9_-]*>/);
      if (closeMatch) {
        cursor += closeMatch[0].length;
      }
      break;
    }
    for (const node of childResult.nodes) {
      children.push(node);
    }
    if (childResult.pos <= cursor) break; // prevent infinite loop
    cursor = childResult.pos;
  }

  const yElement = new Y.XmlElement(tagName);
  for (const [key, value] of Object.entries(attrs)) {
    yElement.setAttribute(key, parseAttrValue(value) as string);
  }
  if (children.length > 0) {
    yElement.insert(0, children);
  }

  return { nodes: [yElement], pos: cursor };
}

/**
 * Parse an XML attribute value, handling JSON-encoded objects, booleans, and numbers.
 */
function parseAttrValue(value: string): unknown {
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;
  return value;
}

/**
 * Decode standard XML entities in text content.
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

/**
 * Relationship type stored in the relationships array
 */
export interface Relationship {
  id: string;
  sourceElementId: string;
  targetElementId: string;
  relationshipTypeId: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get all relationships for a project (works on both runtimes)
 */
export async function getRelationships(
  ctx: McpContext,
  username: string,
  slug: string
): Promise<Relationship[]> {
  const docId = `${username}:${slug}:elements/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API to get document and read relationships array
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<typeof ctx.env>['YJS_PROJECTS'] },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    const doc = await workerService.getDocument(docId);
    const relationshipsArray = doc.doc.getArray('relationships');
    const relationships: Relationship[] = [];
    relationshipsArray.forEach((value) => {
      if (value && typeof value === 'object') {
        relationships.push(value as Relationship);
      }
    });
    return relationships;
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const relationshipsArray = sharedDoc.doc.getArray('relationships');
    return relationshipsArray.toJSON() as Relationship[];
  }
}

/**
 * Replace all relationships in a project (works on both runtimes)
 */
export async function replaceAllRelationships(
  ctx: McpContext,
  username: string,
  slug: string,
  relationships: Relationship[]
): Promise<void> {
  const docId = `${username}:${slug}:elements/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<typeof ctx.env>['YJS_PROJECTS'] },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.mutateRelationships(docId, 'replace', relationships);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const relationshipsArray = sharedDoc.doc.getArray('relationships');
    sharedDoc.doc.transact(() => {
      relationshipsArray.delete(0, relationshipsArray.length);
      relationshipsArray.insert(0, relationships);
    });
  }
}

/**
 * Add a relationship (works on both runtimes)
 */
export async function addRelationship(
  ctx: McpContext,
  username: string,
  slug: string,
  relationship: Relationship
): Promise<void> {
  const docId = `${username}:${slug}:elements/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<typeof ctx.env>['YJS_PROJECTS'] },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.mutateRelationships(docId, 'add', [relationship]);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const relationshipsArray = sharedDoc.doc.getArray('relationships');
    sharedDoc.doc.transact(() => {
      relationshipsArray.push([relationship]);
    });
  }
}

/**
 * Update project metadata coverMediaId in the Yjs elements document (works on both runtimes).
 *
 * The frontend stores `coverMediaId` in the `projectMeta` Y.Map inside the elements doc
 * (`${username}:${slug}:elements/`). When MCP changes the cover, we must update this so
 * all connected clients immediately see the new cover.
 */
export async function updateProjectMetaCoverMediaId(
  ctx: McpContext,
  username: string,
  slug: string,
  coverMediaId: string
): Promise<void> {
  const docId = `${username}:${slug}:elements/`;

  if (isCloudflareWorkers(ctx)) {
    // Cloudflare Workers: use DO HTTP API with path-based updates
    const workerCtx: YjsWorkerContext = {
      env: ctx.env as { YJS_PROJECTS: NonNullable<typeof ctx.env>['YJS_PROJECTS'] },
      authToken: ctx.authToken ?? '',
    };
    const workerService = new YjsWorkerService(workerCtx);
    await workerService.applyUpdates(docId, [
      { path: 'projectMeta.coverMediaId', value: coverMediaId },
      { path: 'projectMeta.updatedAt', value: new Date().toISOString() },
    ]);
  } else {
    // Bun: use LevelDB service
    const { yjsService } = await import('../../services/yjs.service');
    const sharedDoc = await yjsService.getDocument(docId);
    const metaMap = sharedDoc.doc.getMap<string>('projectMeta');
    sharedDoc.doc.transact(() => {
      metaMap.set('coverMediaId', coverMediaId);
      metaMap.set('updatedAt', new Date().toISOString());
    });
  }
}
