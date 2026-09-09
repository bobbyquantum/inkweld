/**
 * Thin, dependency-free WebDAV helpers for the Nextcloud Cloud Sync adapter.
 * Kept free of Angular so they can be unit tested with a mocked `fetch`.
 *
 * Nextcloud exposes each user's files at
 * `<server>/remote.php/dav/files/<loginName>/`. Inkweld keeps everything in
 * one folder under that root (see `NEXTCLOUD_APP_FOLDER`).
 */

/** Folder inside the user's Nextcloud files that holds the Inkweld mirror */
export const NEXTCLOUD_APP_FOLDER = 'Inkweld';

const DAV_NS = 'DAV:';

/** Credentials for one Nextcloud account */
export interface NextcloudCredentials {
  /** Server origin plus any install path, no trailing slash */
  serverUrl: string;
  loginName: string;
  /** A per-app password from Settings > Security, never the account password */
  appPassword: string;
}

/** One entry of a PROPFIND multistatus response */
export interface DavEntry {
  /** Decoded absolute pathname on the server, e.g. `/remote.php/dav/files/u/Inkweld/a.json` */
  pathname: string;
  isCollection: boolean;
  etag: string;
  size: number;
  modifiedAt?: string;
}

export class WebDavError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly url: string,
    /** Seconds the server asked us to wait, from Retry-After */
    public readonly retryAfterSeconds?: number
  ) {
    super(`WebDAV ${method} ${url} failed (${status})`);
    this.name = 'WebDavError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Wrong or revoked app password (401), or a user the password cannot act as (403) */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** `If-Match` did not match the current ETag */
  get isPreconditionFailed(): boolean {
    return this.status === 412;
  }

  /** PUT into a folder that does not exist yet */
  get isMissingParent(): boolean {
    return this.status === 409;
  }

  get isRateLimited(): boolean {
    return this.status === 429 || this.status === 503;
  }
}

/**
 * Turn whatever the user typed into a canonical server URL: scheme added,
 * trailing slashes and any pasted `index.php`/`remote.php` tail removed.
 * Throws when the result is not an http(s) URL.
 */
export function normalizeNextcloudServerUrl(input: string): string {
  let raw = input.trim();
  if (!raw) throw new Error('Enter your Nextcloud address');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That does not look like a valid Nextcloud address');
  }
  let path = url.pathname
    .replace(/\/(index|remote)\.php(\/.*)?$/i, '')
    .replace(/\/apps\/.*$/i, '')
    .replace(/\/+$/, '');
  if (path === '/') path = '';
  return `${url.origin}${path}`;
}

/** Base URL of the user's WebDAV files root, with a trailing slash */
export function buildDavFilesRoot(creds: NextcloudCredentials): string {
  return `${creds.serverUrl}/remote.php/dav/files/${encodeURIComponent(
    creds.loginName
  )}/`;
}

/**
 * Absolute URL for an app-folder-relative path ("/" is the app folder). Each
 * segment is percent-encoded so titles with spaces or `#` survive.
 */
export function buildDavUrl(
  creds: NextcloudCredentials,
  appPath: string
): string {
  const segments = appPath
    .split('/')
    .filter(Boolean)
    .map(s => encodeURIComponent(s));
  return `${buildDavFilesRoot(creds)}${[NEXTCLOUD_APP_FOLDER, ...segments].join('/')}`;
}

/** Decoded pathname of the app folder root, with a trailing slash */
export function appFolderPathname(creds: NextcloudCredentials): string {
  return `${decodeURIComponent(new URL(buildDavFilesRoot(creds)).pathname)}${NEXTCLOUD_APP_FOLDER}/`;
}

export function basicAuthHeader(creds: NextcloudCredentials): string {
  const bytes = new TextEncoder().encode(
    `${creds.loginName}:${creds.appPassword}`
  );
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `Basic ${btoa(binary)}`;
}

/** Strip quotes and the weak-validator prefix so ETags compare as plain strings */
export function normalizeEtag(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/^W\//i, '')
    .replace(/^"(.*)"$/, '$1');
}

function readRetryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get('Retry-After');
  if (header && /^\d+$/.test(header.trim())) return Number(header);
  return undefined;
}

async function davFetch(
  creds: NextcloudCredentials,
  method: string,
  url: string,
  init: { headers?: Record<string, string>; body?: BodyInit } = {},
  fetchFn: typeof fetch = fetch
): Promise<Response> {
  const response = await fetchFn(url, {
    method,
    headers: {
      Authorization: basicAuthHeader(creds),
      // Nextcloud skips the interactive login redirect for requests that
      // declare themselves as XHR; without this a 401 can become an HTML page.
      'X-Requested-With': 'XMLHttpRequest',
      ...init.headers,
    },
    body: init.body,
  });
  if (!response.ok) {
    throw new WebDavError(
      response.status,
      method,
      url,
      readRetryAfterSeconds(response)
    );
  }
  return response;
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:resourcetype/>
    <d:getetag/>
    <d:getcontentlength/>
    <d:getlastmodified/>
  </d:prop>
</d:propfind>`;

/**
 * PROPFIND at `depth` 0 or 1 (Nextcloud disables `infinity` by default), so
 * callers walk deeper folders themselves.
 */
export async function davPropfind(
  creds: NextcloudCredentials,
  url: string,
  depth: 0 | 1,
  fetchFn: typeof fetch = fetch
): Promise<DavEntry[]> {
  const response = await davFetch(
    creds,
    'PROPFIND',
    url,
    {
      headers: {
        Depth: String(depth),
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: PROPFIND_BODY,
    },
    fetchFn
  );
  return parseMultistatus(await response.text());
}

/** Parse a `207 Multi-Status` body into entries that reported a 200 propstat */
export function parseMultistatus(xml: string): DavEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const entries: DavEntry[] = [];
  const responses = doc.getElementsByTagNameNS(DAV_NS, 'response');
  for (const node of Array.from(responses)) {
    const href = firstText(node, 'href');
    if (!href) continue;
    const okProps = Array.from(
      node.getElementsByTagNameNS(DAV_NS, 'propstat')
    ).find(ps => /\b200\b/.test(firstText(ps, 'status')));
    if (!okProps) continue;
    const resourceType = okProps.getElementsByTagNameNS(
      DAV_NS,
      'resourcetype'
    )[0];
    const isCollection =
      !!resourceType &&
      resourceType.getElementsByTagNameNS(DAV_NS, 'collection').length > 0;
    const size = Number(firstText(okProps, 'getcontentlength') || '0');
    const modified = firstText(okProps, 'getlastmodified');
    entries.push({
      pathname: decodeHrefPathname(href),
      isCollection,
      etag: normalizeEtag(firstText(okProps, 'getetag')),
      size: Number.isFinite(size) ? size : 0,
      modifiedAt: modified ? toIso(modified) : undefined,
    });
  }
  return entries;
}

function firstText(parent: Element, localName: string): string {
  const el = parent.getElementsByTagNameNS(DAV_NS, localName)[0];
  return el?.textContent?.trim() ?? '';
}

/** hrefs may be absolute URLs or server-relative; either way we want the decoded pathname */
function decodeHrefPathname(href: string): string {
  let pathname = href;
  if (/^https?:\/\//i.test(href)) {
    try {
      pathname = new URL(href).pathname;
    } catch {
      pathname = href;
    }
  }
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function toIso(httpDate: string): string | undefined {
  const ms = Date.parse(httpDate);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

export async function davGet(
  creds: NextcloudCredentials,
  url: string,
  fetchFn: typeof fetch = fetch
): Promise<{ content: Uint8Array; etag: string; modifiedAt?: string }> {
  const response = await davFetch(creds, 'GET', url, {}, fetchFn);
  const modified = response.headers.get('Last-Modified');
  return {
    content: new Uint8Array(await response.arrayBuffer()),
    etag: normalizeEtag(
      response.headers.get('OC-ETag') ?? response.headers.get('ETag')
    ),
    modifiedAt: modified ? toIso(modified) : undefined,
  };
}

/**
 * PUT a file. `ifMatch` turns on optimistic concurrency: Nextcloud answers
 * 412 when the current ETag differs. Returns the new ETag when the server
 * reported one (Nextcloud always does, via `OC-ETag`).
 */
export async function davPut(
  creds: NextcloudCredentials,
  url: string,
  content: Uint8Array,
  options: { ifMatch?: string } = {},
  fetchFn: typeof fetch = fetch
): Promise<{ etag: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
  };
  if (options.ifMatch) headers['If-Match'] = `"${options.ifMatch}"`;
  const response = await davFetch(
    creds,
    'PUT',
    url,
    { headers, body: content as BodyInit },
    fetchFn
  );
  return {
    etag: normalizeEtag(
      response.headers.get('OC-ETag') ?? response.headers.get('ETag')
    ),
  };
}

export async function davDelete(
  creds: NextcloudCredentials,
  url: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  await davFetch(creds, 'DELETE', url, {}, fetchFn);
}

/** MKCOL one folder. A 405 means it already exists and is treated as success. */
export async function davMkcol(
  creds: NextcloudCredentials,
  url: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  try {
    await davFetch(creds, 'MKCOL', url, {}, fetchFn);
  } catch (error) {
    if (error instanceof WebDavError && error.status === 405) return;
    throw error;
  }
}
