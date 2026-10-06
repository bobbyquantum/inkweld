/**
 * Content-Security-Policy for the served SPA document.
 *
 * The policy's job is to stop injected script: only scripts from this origin
 * run, plus whatever the admin's CUSTOM_HEAD_HTML / CUSTOM_BODY_HTML needs —
 * inline scripts there are allowed by hash and external `<script src>` origins
 * by origin, both computed from the rendered document, so a pasted analytics
 * snippet keeps working without extra configuration. Scripts those snippets
 * load at runtime (tag managers, chat widgets) need their origins listed in
 * CONTENT_SECURITY_POLICY_TRUSTED_SOURCES.
 *
 * Everything else is deliberately loose. Users connect to other Inkweld
 * servers, Dropbox and Nextcloud, and embed remote images, so connect-src and
 * img-src allow any https/wss origin. Angular and Material inject inline
 * styles at runtime, so style-src keeps 'unsafe-inline'. script-src needs
 * 'unsafe-eval' because Typst's wasm-bindgen glue (PDF export and preview)
 * calls `new Function(...)`; drop it to 'wasm-unsafe-eval' if a later
 * typst.ts stops doing that. Inline script stays blocked either way.
 *
 * The Cloudflare Pages deployment serves the same base policy statically from
 * frontend/public/_headers; csp.spec.ts keeps the two in step.
 */

import { createHash } from 'node:crypto';

export type CspMode = 'enforce' | 'report-only' | 'off';

const BASE_DIRECTIVES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'", "'unsafe-eval'"]],
  ['style-src', ["'self'", "'unsafe-inline'"]],
  ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
  ['font-src', ["'self'", 'data:']],
  ['connect-src', ["'self'", 'https:', 'wss:', 'blob:', 'data:']],
  ['media-src', ["'self'", 'data:', 'blob:', 'https:']],
  ['worker-src', ["'self'", 'blob:']],
  ['frame-src', ["'self'", 'blob:']],
  ['manifest-src', ["'self'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'self'"]],
];

/** Directives that admin trusted sources are added to. */
const TRUSTED_SOURCE_DIRECTIVES = new Set(['script-src', 'style-src', 'font-src', 'frame-src']);

/**
 * A host source as CSP defines it: optional http(s) scheme, optional `*.`
 * wildcard, host, optional port, optional path. Anything else — keywords,
 * quotes, `;` or `,` that would end the directive — is dropped, so a stored
 * value can never rewrite the rest of the policy.
 */
const HOST_SOURCE =
  /^(?:https?:\/\/)?(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::(?:\d{1,5}|\*))?(?:\/[\w\-./~%]*)?$/i;

export function parseCspMode(value: string | null | undefined): CspMode {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'report-only' || normalized === 'off') return normalized;
  return 'enforce';
}

export function cspHeaderName(mode: CspMode): string | null {
  if (mode === 'off') return null;
  return mode === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
}

/** Split the admin's whitespace/comma-separated list, keeping valid host sources. */
export function parseTrustedSources(value: string | null | undefined): string[] {
  if (!value) return [];
  const tokens = value.split(/[\s,]+/).filter((token) => HOST_SOURCE.test(token));
  return [...new Set(tokens)];
}

interface ScriptTag {
  attributes: string;
  content: string;
}

/**
 * Find every `<script>` element in a document. A plain scan rather than one
 * regex over the whole document, which keeps it linear on arbitrary admin HTML.
 */
function findScriptTags(html: string): ScriptTag[] {
  const lower = html.toLowerCase();
  const tags: ScriptTag[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const open = lower.indexOf('<script', cursor);
    if (open === -1) break;
    const nameEnd = open + '<script'.length;
    const next = lower.charAt(nameEnd);
    // `<scripts>` or `<script-foo>` are other elements.
    if (next !== '>' && next !== '/' && !/\s/.test(next)) {
      cursor = nameEnd;
      continue;
    }
    const openEnd = lower.indexOf('>', nameEnd);
    if (openEnd === -1) break;
    const close = lower.indexOf('</script', openEnd + 1);
    if (close === -1) break;
    tags.push({
      attributes: html.slice(nameEnd, openEnd),
      content: html.slice(openEnd + 1, close),
    });
    cursor = close + '</script'.length;
  }
  return tags;
}

function srcAttribute(attributes: string): string | null {
  const match = /(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attributes);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? '').trim();
}

/** `'sha256-…'` sources for each inline script, so the browser runs exactly those. */
export function collectInlineScriptHashes(html: string): string[] {
  const hashes = findScriptTags(html)
    .filter((tag) => srcAttribute(tag.attributes) === null)
    .map((tag) => `'sha256-${createHash('sha256').update(tag.content, 'utf8').digest('base64')}'`);
  return [...new Set(hashes)];
}

/** Origins of external `<script src>` URLs. Relative URLs are already covered by 'self'. */
export function collectExternalScriptOrigins(html: string): string[] {
  const origins: string[] = [];
  for (const tag of findScriptTags(html)) {
    const src = srcAttribute(tag.attributes);
    if (!src) continue;
    const absolute = src.startsWith('//') ? `https:${src}` : src;
    if (!/^https?:\/\//i.test(absolute)) continue;
    try {
      origins.push(new URL(absolute).origin);
    } catch {
      // Not a URL the browser could load either.
    }
  }
  return [...new Set(origins)];
}

/**
 * An HTML comment that changes whenever the CSP settings do, for injection
 * into index.html. The Angular service worker caches index.html *with its
 * response headers* and only refetches it when the document's hash in
 * ngsw.json changes, so a header-only change would never reach installed
 * clients. Empty for the default settings, which keeps index.html
 * byte-identical to the build.
 */
export function cspSettingsComment(
  mode: CspMode,
  trustedSources: string | null | undefined
): string {
  const sources = parseTrustedSources(trustedSources);
  if (mode === 'enforce' && sources.length === 0) return '';
  const fingerprint = createHash('sha256')
    .update(`${mode}\n${sources.join(' ')}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `<!-- inkweld-csp:${fingerprint} -->`;
}

export interface BuildCspOptions {
  /** The document being served; its inline and external scripts are allowed. */
  html?: string;
  /** Raw CONTENT_SECURITY_POLICY_TRUSTED_SOURCES value. */
  trustedSources?: string | null;
}

export function buildContentSecurityPolicy(options: BuildCspOptions = {}): string {
  const trusted = parseTrustedSources(options.trustedSources);
  const html = options.html ?? '';
  const scriptExtras = [...collectExternalScriptOrigins(html), ...collectInlineScriptHashes(html)];

  return BASE_DIRECTIVES.map(([name, base]) => {
    const sources = [...base];
    if (TRUSTED_SOURCE_DIRECTIVES.has(name)) sources.push(...trusted);
    if (name === 'script-src') sources.push(...scriptExtras);
    return `${name} ${[...new Set(sources)].join(' ')}`;
  }).join('; ');
}
