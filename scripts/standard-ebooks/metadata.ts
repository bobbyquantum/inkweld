/**
 * Parses Standard Ebooks content.opf and toc.xhtml files
 * to extract book metadata, spine order, and table of contents.
 */

import { XMLParser } from 'fast-xml-parser';
import type { SEBookMetadata, SESpineItem, SETocEntry } from './types.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name) => {
    // These elements can appear multiple times
    return [
      'dc:subject',
      'dc:source',
      'dc:creator',
      'dc:contributor',
      'meta',
      'item',
      'itemref',
      'li',
      'ol',
      'a',
    ].includes(name);
  },
});

/**
 * Parse content.opf to extract metadata and spine order.
 */
export function parseContentOpf(opfXml: string): {
  metadata: SEBookMetadata;
  spine: SESpineItem[];
  manifest: Map<string, string>;
} {
  const parsed = xmlParser.parse(opfXml);
  const pkg = parsed.package || parsed['opf:package'];
  const meta = pkg.metadata;
  const manifestSection = pkg.manifest;
  const spineSection = pkg.spine;

  // ── Extract metadata ──
  const title = extractText(meta['dc:title']);
  const author = extractCreator(meta['dc:creator']);
  const language = extractText(meta['dc:language']);
  const description = extractText(meta['dc:description']) || '';

  // Extract SE-specific metadata from <meta> elements
  let wordCount: number | undefined;
  let readingEase: number | undefined;
  const subjects: string[] = [];
  const seSubjects: string[] = [];

  const metaElements = ensureArray(meta.meta);
  for (const m of metaElements) {
    const property = m['@_property'] || '';
    const content = m['#text'] || m['@_content'] || '';
    if (property === 'se:word-count') wordCount = parseInt(content, 10);
    if (property === 'se:reading-ease.flesch') readingEase = parseFloat(content);
    if (property === 'se:subject') seSubjects.push(String(content));
  }

  // DC subjects
  const dcSubjects = ensureArray(meta['dc:subject']);
  for (const s of dcSubjects) {
    subjects.push(extractText(s));
  }

  // Source URLs
  const sourceUrls: string[] = [];
  const dcSources = ensureArray(meta['dc:source']);
  for (const s of dcSources) {
    sourceUrls.push(extractText(s));
  }

  const metadata: SEBookMetadata = {
    title,
    author,
    language,
    description,
    wordCount,
    readingEase,
    subjects,
    seSubjects,
    sourceUrls,
  };

  // ── Build manifest map (id → href) ──
  const manifestMap = new Map<string, string>();
  const items = ensureArray(manifestSection.item);
  for (const item of items) {
    manifestMap.set(item['@_id'], item['@_href']);
  }

  // ── Extract spine (reading order) ──
  const spine: SESpineItem[] = [];
  const itemrefs = ensureArray(spineSection.itemref);
  for (const ref of itemrefs) {
    const id = ref['@_idref'];
    const href = manifestMap.get(id) || '';
    const linear = ref['@_linear'] !== 'no';
    spine.push({ id, href, linear });
  }

  return { metadata, spine, manifest: manifestMap };
}

/**
 * Parse toc.xhtml to extract the hierarchical table of contents.
 */
export function parseTocXhtml(tocXml: string): SETocEntry[] {
  const parsed = xmlParser.parse(tocXml);

  // Navigate to the nav element with epub:type="toc"
  const html = parsed.html || parsed['html'];
  const body = html?.body;
  if (!body) return [];

  // Find the toc nav — could be body.nav or body.section.nav etc.
  const nav = findTocNav(body);
  if (!nav) return [];

  // Parse the nested <ol> structure
  const ol = nav.ol;
  if (!ol) return [];

  return parseOlEntries(ensureArray(ol)[0]);
}

// ── Helpers ─────────────────────────────────────────────────────

function findTocNav(node: Record<string, unknown>): Record<string, unknown> | null {
  // Direct nav element
  if (node.nav) {
    const navs = ensureArray(node.nav as Record<string, unknown>[]);
    for (const nav of navs) {
      const epubType = (nav as Record<string, unknown>)['@_epub:type'] || '';
      if (String(epubType).includes('toc')) return nav as Record<string, unknown>;
    }
  }

  // Check section children
  if (node.section) {
    const sections = ensureArray(node.section as Record<string, unknown>[]);
    for (const section of sections) {
      const result = findTocNav(section as Record<string, unknown>);
      if (result) return result;
    }
  }

  return null;
}

function parseOlEntries(ol: Record<string, unknown>): SETocEntry[] {
  if (!ol || !ol.li) return [];
  const entries: SETocEntry[] = [];

  const lis = ensureArray(ol.li);
  for (const li of lis) {
    const liObj = li as Record<string, unknown>;
    // Each <li> contains an <a> and optionally a nested <ol>
    const anchors = ensureArray(liObj.a);
    const anchor = anchors[0] as Record<string, unknown> | undefined;
    if (!anchor) continue;

    const label = extractTextDeep(anchor);
    const href = String(anchor['@_href'] || '');

    // Nested <ol> for sub-entries
    let children: SETocEntry[] = [];
    if (liObj.ol) {
      const nestedOl = ensureArray(liObj.ol);
      children = parseOlEntries(nestedOl[0] as Record<string, unknown>);
    }

    entries.push({ label: label.trim(), href, children });
  }

  return entries;
}

/** Extract plain text from a DC element (may be string or object with #text) */
function extractText(el: unknown): string {
  if (typeof el === 'string') return el;
  if (typeof el === 'number') return String(el);
  if (el && typeof el === 'object' && '#text' in el) return String((el as Record<string, unknown>)['#text']);
  return '';
}

/** Extract text recursively from a parsed XML node (handles nested spans etc.) */
function extractTextDeep(node: unknown): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';

  const obj = node as Record<string, unknown>;
  let text = '';

  if ('#text' in obj) text += String(obj['#text']);

  // Recurse into child elements (span, abbr, etc.)
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('@_') || key === '#text') continue;
    if (Array.isArray(value)) {
      for (const item of value) text += extractTextDeep(item);
    } else {
      text += extractTextDeep(value);
    }
  }

  return text;
}

/** Extract the primary creator (author) from dc:creator */
function extractCreator(el: unknown): string {
  if (!el) return 'Unknown';
  const creators = ensureArray(el);
  // Take the first creator
  return extractText(creators[0]) || 'Unknown';
}

/** Ensure a value is an array */
function ensureArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
}
