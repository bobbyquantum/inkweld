/**
 * Pure helpers for the EPUB generator: XML escaping, language handling,
 * identifiers, image type detection and navigation tree building.
 *
 * Kept free of Angular dependencies so they can be tested directly.
 */

/**
 * Characters that are not allowed anywhere in an XML 1.0 document. A single
 * one (commonly a stray control character pasted from another app) makes the
 * whole XHTML file unparseable, and e-readers then refuse to open the
 * chapter, so they are dropped rather than escaped.
 */
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** Escape text for use in XML/XHTML content or a double-quoted attribute. */
export function escapeXml(str: string): string {
  return str
    .replaceAll(INVALID_XML_CHARS, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Primary language subtags written right-to-left. */
const RTL_LANGUAGES = new Set([
  'ar',
  'arc',
  'ckb',
  'dv',
  'fa',
  'he',
  'iw',
  'ks',
  'ku',
  'ps',
  'sd',
  'ug',
  'ur',
  'yi',
]);

/**
 * Normalise a user-supplied language to a BCP 47 tag. EPUB requires a
 * well-formed tag in `dc:language` and `xml:lang`; anything else falls back
 * to English rather than producing an invalid package.
 */
export function normalizeLanguage(language: string | undefined): string {
  const tag = (language ?? '').trim().replaceAll('_', '-');
  if (/^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i.test(tag)) return tag;
  return 'en';
}

/** True when the language's primary subtag is written right-to-left. */
export function isRtlLanguage(language: string): boolean {
  const primary = language.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.has(primary);
}

/**
 * `dcterms:modified` must be `CCYY-MM-DDThh:mm:ssZ` exactly; the
 * milliseconds that `toISOString()` includes are rejected by EPUBCheck.
 */
export function epubTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Strip an ISBN to its digits (plus a trailing X check digit) and accept it
 * only when it has a valid ISBN-10 or ISBN-13 length. Returns null otherwise.
 */
export function normalizeIsbn(isbn: string | undefined): string | null {
  if (!isbn) return null;
  const compact = isbn.replaceAll(/[^0-9Xx]/g, '').toUpperCase();
  if (/^\d{13}$/.test(compact) || /^\d{9}[\dX]$/.test(compact)) {
    return compact;
  }
  return null;
}

/**
 * A UUID derived from a seed, so re-exporting the same publish plan yields
 * the same book identifier. Readers (Apple Books, Kobo, Calibre) use the
 * identifier to recognise a new version of a book they already hold instead
 * of adding a duplicate. Falls back to a random UUID when SubtleCrypto is
 * unavailable.
 */
export async function stableUuid(seed: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(seed)
    );
    const bytes = new Uint8Array(digest).slice(0, 16);
    // Version 5-style layout (name-based) with the RFC 4122 variant.
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(
      ''
    );
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  } catch {
    return crypto.randomUUID();
  }
}

/** Image media types every EPUB 3 reading system must support. */
const CORE_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** File extension for a core EPUB image media type, or null. */
export function coreImageExtension(mediaType: string): string | null {
  return CORE_IMAGE_TYPES[mediaType] ?? null;
}

/**
 * Work out an image's media type from its first bytes, falling back to the
 * blob's declared type. Media stored offline frequently has an empty or
 * generic type, and the manifest must state the real one.
 */
export async function detectImageType(blob: Blob): Promise<string | null> {
  let head: Uint8Array;
  try {
    head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  } catch {
    return declaredImageType(blob);
  }
  if (
    head.length >= 4 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47
  ) {
    return 'image/png';
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8) {
    return 'image/jpeg';
  }
  const ascii = String.fromCodePoint(...head);
  if (ascii.startsWith('GIF8')) return 'image/gif';
  if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(ascii)) return 'image/svg+xml';
  return declaredImageType(blob);
}

function declaredImageType(blob: Blob): string | null {
  const type = blob.type.split(';')[0].trim().toLowerCase();
  if (type === 'image/jpg') return 'image/jpeg';
  return type.startsWith('image/') ? type : null;
}

/** Decode a base64 `data:image/...` URL into a Blob, or null. */
export function dataUrlToBlob(src: string): Blob | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(
    src.trim()
  );
  if (!match) return null;
  try {
    const binary = atob(match[2].replaceAll(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i)!;
    return new Blob([bytes], { type: match[1].toLowerCase() });
  } catch {
    return null;
  }
}

/**
 * Turn plain text typed into a publish-plan field (dedication, custom
 * frontmatter/backmatter) into escaped XHTML paragraphs. Blank lines separate
 * paragraphs; single newlines become line breaks.
 */
export function textToParagraphs(text: string, className?: string): string {
  const cls = className ? ` class="${className}"` : '';
  return text
    .replaceAll('\r\n', '\n')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p${cls}>${p.split('\n').map(escapeXml).join('<br />')}</p>`)
    .join('\n');
}

/** A flat navigation entry, in reading order. */
export interface FlatNavEntry {
  title: string;
  /** Link target; omitted for group headings that have no page of their own. */
  href?: string;
  /** Nesting depth; 0 is top level. */
  level: number;
}

/** A navigation entry with its nested children. */
export interface NavNode {
  title: string;
  href?: string;
  /** Depth in the tree, starting at 0, after normalisation. */
  depth: number;
  children: NavNode[];
}

/**
 * Nest a flat, ordered list of entries by level. An entry becomes a child of
 * the nearest preceding entry with a lower level; skipped levels collapse so
 * the tree never has empty intermediate nodes.
 */
export function buildNavTree(entries: FlatNavEntry[]): NavNode[] {
  const roots: NavNode[] = [];
  const stack: { level: number; node: NavNode }[] = [];
  for (const entry of entries) {
    while ((stack.at(-1)?.level ?? -Infinity) >= entry.level) {
      stack.pop();
    }
    const parent = stack.at(-1)?.node;
    const node: NavNode = {
      title: entry.title,
      href: entry.href,
      depth: parent ? parent.depth + 1 : 0,
      children: [],
    };
    (parent ? parent.children : roots).push(node);
    stack.push({ level: entry.level, node });
  }
  pruneEmptyGroups(roots);
  return roots;
}

/** Remove link-less entries that ended up with no children. */
function pruneEmptyGroups(nodes: NavNode[]): void {
  for (let i = nodes.length - 1; i >= 0; i--) {
    pruneEmptyGroups(nodes[i].children);
    if (!nodes[i].href && nodes[i].children.length === 0) nodes.splice(i, 1);
  }
}

/** Deepest depth in a navigation tree, counting from 1. */
export function navTreeDepth(nodes: NavNode[]): number {
  let max = 0;
  for (const node of nodes) {
    max = Math.max(max, 1 + navTreeDepth(node.children));
  }
  return max;
}

/** The first link in a subtree, used where every entry needs a target. */
export function firstHref(node: NavNode): string | undefined {
  if (node.href) return node.href;
  for (const child of node.children) {
    const href = firstHref(child);
    if (href) return href;
  }
  return undefined;
}
