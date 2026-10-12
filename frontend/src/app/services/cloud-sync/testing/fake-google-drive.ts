import { type DriveFile } from '../google-drive/google-drive-api';

interface StoredFile {
  meta: DriveFile;
  content: Uint8Array;
}

interface Change {
  seq: number;
  fileId: string;
  removed: boolean;
  file?: DriveFile;
}

interface UploadSession {
  fileId?: string;
  name?: string;
}

type Override = (url: URL, init: RequestInit) => Response | undefined;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A Drive-style error body */
export function driveErrorResponse(
  status: number,
  reason: string,
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      error: { code: status, message: reason, errors: [{ reason }] },
    }),
    { status, headers: { 'Content-Type': 'application/json', ...headers } }
  );
}

function notFound(): Response {
  return driveErrorResponse(404, 'notFound');
}

async function bodyBytes(body: RequestInit['body']): Promise<Uint8Array> {
  // Typed arrays from TextEncoder may come from another realm under jsdom
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (typeof body === 'string') return new TextEncoder().encode(body);
  return new Uint8Array();
}

/** Binary-safe split of a multipart/related body into its parts */
function parseMultipart(bytes: Uint8Array, boundary: string): Uint8Array[] {
  let latin1 = '';
  for (const byte of bytes) latin1 += String.fromCodePoint(byte);
  return latin1
    .split(`--${boundary}`)
    .slice(1, -1)
    .map(part => {
      const body = part.slice(part.indexOf('\r\n\r\n') + 4, -2);
      return Uint8Array.from(body, ch => ch.codePointAt(0) ?? 0);
    });
}

/**
 * In-memory imitation of the Drive v3 endpoints GoogleDriveRemoteStore uses:
 * app data listing, the Changes API, metadata, media download, multipart /
 * media / resumable uploads and delete. Pass `fetch` to the store.
 */
export class FakeGoogleDrive {
  readonly files = new Map<string, StoredFile>();
  readonly requests: string[] = [];
  /** Page size for listings and change pages; small values test paging */
  pageSize = 1000;
  private readonly changes: Change[] = [];
  private seq = 0;
  private ids = 0;
  private clock = Date.parse('2026-01-01T00:00:00Z');
  private readonly sessions = new Map<string, UploadSession>();
  private readonly overrides: Override[] = [];
  /** Page tokens older than this answer 410 */
  private oldestValidToken = 0;

  readonly fetch = (async (
    input: RequestInfo | URL,
    init: RequestInit = {}
  ): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input : input.url
    );
    const method = init.method ?? 'GET';
    this.requests.push(`${method} ${url.pathname}`);
    for (const [index, override] of this.overrides.entries()) {
      const response = override(url, init);
      if (response) {
        this.overrides.splice(index, 1);
        return response;
      }
    }
    return this.handle(method, url, init);
  }) as typeof fetch;

  /** Answer the next request matching `test` with `response` instead */
  failNext(
    test: (method: string, url: URL) => boolean,
    response: () => Response
  ): void {
    this.overrides.push((url, init) =>
      test(init.method ?? 'GET', url) ? response() : undefined
    );
  }

  /** Make every page token issued so far invalid */
  expirePageTokens(): void {
    this.oldestValidToken = this.seq + 1;
  }

  /** A write made by another device */
  externalWrite(name: string, content: string | Uint8Array): DriveFile {
    const existing = [...this.files.values()].find(f => f.meta.name === name);
    return this.store(name, content, existing?.meta.id);
  }

  /** A file created by another device, even if the name already exists */
  externalCreate(name: string, content: string | Uint8Array): DriveFile {
    return this.store(name, content);
  }

  externalDelete(name: string): void {
    for (const file of [...this.files.values()]) {
      if (file.meta.name === name) this.remove(file.meta.id);
    }
  }

  namesInOrder(): string[] {
    return [...this.files.values()].map(f => f.meta.name).sort();
  }

  text(name: string): string | undefined {
    const file = [...this.files.values()].find(f => f.meta.name === name);
    return file ? new TextDecoder().decode(file.content) : undefined;
  }

  count(prefix: string): number {
    return this.requests.filter(r => r.startsWith(prefix)).length;
  }

  countExact(request: string): number {
    return this.requests.filter(r => r === request).length;
  }

  private store(
    name: string,
    content: string | Uint8Array,
    fileId?: string
  ): DriveFile {
    const bytes =
      typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const existing = fileId ? this.files.get(fileId) : undefined;
    this.clock += 1000;
    const now = new Date(this.clock).toISOString();
    const id = existing?.meta.id ?? `file-${++this.ids}`;
    const meta: DriveFile = {
      id,
      name,
      size: String(bytes.byteLength),
      version: String(Number(existing?.meta.version ?? 0) + 1),
      headRevisionId: `rev-${id}-${Number(existing?.meta.version ?? 0) + 1}`,
      modifiedTime: now,
      createdTime: existing?.meta.createdTime ?? now,
      trashed: false,
    };
    this.files.set(id, { meta, content: bytes });
    this.changes.push({
      seq: ++this.seq,
      fileId: id,
      removed: false,
      file: meta,
    });
    return meta;
  }

  private remove(fileId: string): boolean {
    if (!this.files.delete(fileId)) return false;
    this.changes.push({ seq: ++this.seq, fileId, removed: true });
    return true;
  }

  private async handle(
    method: string,
    url: URL,
    init: RequestInit
  ): Promise<Response> {
    const path = url.pathname;
    if (path === '/drive/v3/changes/startPageToken') {
      return json({ startPageToken: String(this.seq + 1) });
    }
    if (path === '/drive/v3/changes') return this.listChanges(url);
    if (path === '/drive/v3/files' && method === 'GET') {
      return this.listFiles(url);
    }
    if (path.startsWith('/session/')) return this.finishSession(path, init);
    const fileMatch = /^\/(upload\/)?drive\/v3\/files(?:\/([^/]+))?$/.exec(
      path
    );
    if (!fileMatch) return notFound();
    const [, upload, id] = fileMatch;
    if (upload) return this.upload(method, url, init, id);
    const file = id ? this.files.get(id) : undefined;
    if (method === 'DELETE') {
      return id && this.remove(id)
        ? new Response(null, { status: 204 })
        : notFound();
    }
    if (!file) return notFound();
    if (url.searchParams.get('alt') === 'media') {
      return new Response(file.content as BodyInit, { status: 200 });
    }
    return json(file.meta);
  }

  private listFiles(url: URL): Response {
    const all = [...this.files.values()].map(f => f.meta);
    const start = Number(url.searchParams.get('pageToken') ?? 0);
    const page = all.slice(start, start + this.pageSize);
    const next = start + this.pageSize;
    return json({
      files: page,
      ...(next < all.length ? { nextPageToken: String(next) } : {}),
    });
  }

  private listChanges(url: URL): Response {
    const token = Number(url.searchParams.get('pageToken'));
    if (!Number.isFinite(token) || token < this.oldestValidToken) {
      return driveErrorResponse(410, 'invalidPageToken');
    }
    const pending = this.changes.filter(c => c.seq >= token);
    const page = pending.slice(0, this.pageSize);
    const more = pending.length > this.pageSize;
    return json({
      changes: page.map(c => ({
        fileId: c.fileId,
        removed: c.removed,
        ...(c.file ? { file: c.file } : {}),
      })),
      ...(more
        ? { nextPageToken: String(pending[this.pageSize].seq) }
        : { newStartPageToken: String(this.seq + 1) }),
    });
  }

  private async upload(
    method: string,
    url: URL,
    init: RequestInit,
    id: string | undefined
  ): Promise<Response> {
    const uploadType = url.searchParams.get('uploadType');
    if (id && !this.files.has(id)) return notFound();
    if (uploadType === 'resumable') {
      const session = `/session/${this.sessions.size + 1}`;
      const metadata = JSON.parse(init.body as string) as { name?: string };
      this.sessions.set(session, { fileId: id, name: metadata.name });
      return new Response(null, {
        status: 200,
        headers: { Location: `https://upload.fake${session}` },
      });
    }
    const bytes = await bodyBytes(init.body);
    if (uploadType === 'media' && id && method === 'PATCH') {
      const name = this.files.get(id)?.meta.name ?? '';
      return json(this.store(name, bytes, id));
    }
    if (uploadType === 'multipart' && method === 'POST') {
      const contentType = new Headers(init.headers).get('Content-Type') ?? '';
      const boundary = /boundary=(.+)$/.exec(contentType)?.[1] ?? '';
      const [metaPart, contentPart] = parseMultipart(bytes, boundary);
      const metadata = JSON.parse(new TextDecoder().decode(metaPart)) as {
        name: string;
        parents?: string[];
      };
      if (metadata.parents?.[0] !== 'appDataFolder') {
        return driveErrorResponse(400, 'notAppDataFolder');
      }
      return json(this.store(metadata.name, contentPart));
    }
    return driveErrorResponse(400, 'badUpload');
  }

  private async finishSession(
    path: string,
    init: RequestInit
  ): Promise<Response> {
    const session = this.sessions.get(path);
    if (!session) return notFound();
    this.sessions.delete(path);
    const bytes = await bodyBytes(init.body);
    if (session.fileId) {
      const name = this.files.get(session.fileId)?.meta.name ?? '';
      return json(this.store(name, bytes, session.fileId));
    }
    return json(this.store(session.name ?? '', bytes));
  }
}
