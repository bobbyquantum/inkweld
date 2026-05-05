/**
 * `inkweld://` URI codec.
 *
 * Inkweld uses `inkweld://` URIs to refer to project elements from
 * external contexts (markdown exports, MCP tool responses, …) where a
 * stable, dereferenceable identifier is more useful than a raw
 * element ID.
 *
 * URI shapes
 * ----------
 *
 *   1. `inkweld://element/{elementId}` — bare reference (no project
 *      scope). Use when the project context is implicit (e.g. inside a
 *      single project's exported markdown bundle).
 *
 *   2. `inkweld://{username}/{slug}/element/{elementId}` —
 *      project-scoped reference. Preferred for cross-project links
 *      (MCP tools, document exports shared between projects).
 *
 * Both forms accept an optional query string for non-identifying
 * metadata (e.g. `?type=...&note=...`). The decoder ignores unknown
 * query parameters but preserves them on the returned attribute map so
 * callers can re-encode without loss.
 */

/**
 * Decoded `inkweld://` URI. The `elementId` is always present; the
 * project scope is optional. Extra query parameters are returned as
 * arbitrary string-valued attributes for the caller to inspect.
 */
export interface DecodedInkweldUri {
  elementId: string;
  username?: string;
  slug?: string;
  /** Extra query-string parameters, decoded but otherwise untouched. */
  params: Record<string, string>;
}

/** Decode an `inkweld://` URI; returns `null` if the input isn't recognisable. */
export function decodeInkweldUri(uri: string): DecodedInkweldUri | null {
  if (!uri.startsWith('inkweld://')) return null;
  const rest = uri.slice('inkweld://'.length);
  const queryIdx = rest.indexOf('?');
  const pathPart = queryIdx === -1 ? rest : rest.slice(0, queryIdx);
  const queryPart = queryIdx === -1 ? '' : rest.slice(queryIdx + 1);

  const segments = pathPart.split('/').map((s) => safeDecode(s));
  let elementId: string | null = null;
  let username: string | undefined;
  let slug: string | undefined;

  if (segments[0] === 'element' && segments[1]) {
    elementId = segments[1];
  } else if (segments.length >= 4 && segments[2] === 'element' && segments[3]) {
    username = segments[0];
    slug = segments[1];
    elementId = segments[3];
  }
  if (!elementId) return null;

  return {
    elementId,
    ...(username ? { username } : {}),
    ...(slug ? { slug } : {}),
    params: parseQuery(queryPart),
  };
}

/** Shape required to encode a project-scoped or bare URI. */
export interface EncodeInkweldUriInput {
  elementId: string;
  /** Project scope. If omitted, the bare form is emitted. */
  username?: string;
  slug?: string;
  /** Extra query parameters. Empty / null / undefined values are dropped. */
  params?: Record<string, string | number | boolean | null | undefined>;
}

/** Encode an Inkweld element reference as an `inkweld://` URI. */
export function encodeInkweldUri(input: EncodeInkweldUriInput): string {
  const id = encodeURIComponent(input.elementId);
  const path =
    input.username && input.slug
      ? `${encodeURIComponent(input.username)}/${encodeURIComponent(input.slug)}/element/${id}`
      : `element/${id}`;
  const query = encodeQuery(input.params);
  return `inkweld://${path}${query ? '?' + query : ''}`;
}

function parseQuery(q: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!q) return params;
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) {
      params[safeDecode(pair)] = '';
    } else {
      params[safeDecode(pair.slice(0, eq))] = safeDecode(pair.slice(eq + 1));
    }
  }
  return params;
}

function encodeQuery(
  params: Record<string, string | number | boolean | null | undefined> | undefined
): string {
  if (!params) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join('&');
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
