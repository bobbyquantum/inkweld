/**
 * Thin, dependency-free wrappers around the Google Drive v3 endpoints Cloud
 * Sync needs. Kept free of Angular so they can be unit tested with a mocked
 * `fetch`.
 *
 * Inkweld asks only for the `drive.appdata` scope, so everything lives in the
 * hidden per-app `appDataFolder`: the user cannot see or edit the files, and
 * Inkweld cannot see anything else in their Drive.
 */

export const GOOGLE_DRIVE_APPDATA_SCOPE =
  'https://www.googleapis.com/auth/drive.appdata';

const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

/** The magic parent id / space name of the hidden app data folder */
export const APP_DATA_FOLDER = 'appDataFolder';

/**
 * Largest body sent in one multipart or media upload. Google caps both at
 * 5 MB; anything bigger goes through a resumable session.
 */
export const SIMPLE_UPLOAD_LIMIT = 5 * 1024 * 1024;

/** File fields every call asks for, so index entries are always complete */
export const DRIVE_FILE_FIELDS =
  'id,name,size,version,headRevisionId,modifiedTime,createdTime,trashed';

export interface DriveFile {
  id: string;
  name: string;
  /** int64 as a decimal string; absent for zero-byte files on some calls */
  size?: string;
  /** int64 as a decimal string; bumps on every change, metadata included */
  version?: string;
  /** Changes only when content does; set for every non-Google-Docs file */
  headRevisionId?: string;
  modifiedTime?: string;
  createdTime?: string;
  trashed?: boolean;
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface DriveChange {
  fileId: string;
  removed?: boolean;
  file?: DriveFile;
}

export interface DriveChangeList {
  changes: DriveChange[];
  nextPageToken?: string;
  /** Present on the last page: the token to poll from next time */
  newStartPageToken?: string;
}

export class DriveApiError extends Error {
  constructor(
    public readonly status: number,
    /** First `errors[].reason`, e.g. "notFound", "userRateLimitExceeded" */
    public readonly reason: string,
    message: string,
    public readonly endpoint = '',
    /** Seconds the server asked us to wait, from Retry-After */
    public readonly retryAfterSeconds?: number
  ) {
    super(
      endpoint
        ? `Google Drive ${endpoint} failed (${status}): ${message}`
        : `Google Drive API error ${status}: ${message}`
    );
    this.name = 'DriveApiError';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** The access token is missing, invalid or expired */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** Drive is throttling us: 429, or 403 with a rate-limit reason */
  get isRateLimited(): boolean {
    return (
      this.status === 429 ||
      (this.status === 403 &&
        (this.reason === 'rateLimitExceeded' ||
          this.reason === 'userRateLimitExceeded'))
    );
  }

  /** A changes page token Drive no longer accepts; rebuild from a listing */
  get isInvalidPageToken(): boolean {
    return (
      this.status === 410 ||
      (this.status === 400 && this.reason === 'invalid') ||
      this.reason === 'invalidPageToken'
    );
  }
}

async function throwForResponse(
  response: Response,
  endpoint: string
): Promise<never> {
  const text = await response.text();
  let reason = '';
  let message = response.statusText;
  try {
    const body = JSON.parse(text) as {
      error?: {
        message?: string;
        errors?: { reason?: string }[];
      };
    };
    reason = body.error?.errors?.[0]?.reason ?? '';
    message = body.error?.message ?? message;
  } catch {
    message = text || message;
  }
  const header = response.headers.get('Retry-After')?.trim();
  const retryAfter =
    header && /^\d+$/.test(header) ? Number(header) : undefined;
  throw new DriveApiError(
    response.status,
    reason,
    message,
    endpoint,
    retryAfter
  );
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

async function driveJson<T>(response: Response, endpoint: string): Promise<T> {
  if (!response.ok) await throwForResponse(response, endpoint);
  return (await response.json()) as T;
}

export interface GoogleDriveUser {
  /** Stable, unique id of the Google account */
  permissionId: string;
  emailAddress: string;
  displayName: string;
}

/** The account that owns the token */
export async function getGoogleDriveUser(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<GoogleDriveUser> {
  const url = new URL(`${API_BASE}/about`);
  url.searchParams.set('fields', 'user(permissionId,emailAddress,displayName)');
  const response = await fetchFn(url.toString(), {
    headers: authHeaders(accessToken),
  });
  const body = await driveJson<{ user: GoogleDriveUser }>(
    response,
    'about.get'
  );
  return body.user;
}

/** One page of every file in the app data folder */
export async function listAppDataFiles(
  accessToken: string,
  pageToken: string | undefined,
  fetchFn: typeof fetch = fetch
): Promise<DriveFileList> {
  const url = new URL(`${API_BASE}/files`);
  url.searchParams.set('spaces', APP_DATA_FOLDER);
  url.searchParams.set('q', 'trashed = false');
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set('fields', `nextPageToken,files(${DRIVE_FILE_FIELDS})`);
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const response = await fetchFn(url.toString(), {
    headers: authHeaders(accessToken),
  });
  return driveJson<DriveFileList>(response, 'files.list');
}

/** Token marking "now" in the user's change log */
export async function getChangesStartPageToken(
  accessToken: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const response = await fetchFn(`${API_BASE}/changes/startPageToken`, {
    headers: authHeaders(accessToken),
  });
  const body = await driveJson<{ startPageToken: string }>(
    response,
    'changes.getStartPageToken'
  );
  return body.startPageToken;
}

/** One page of app data changes since `pageToken` */
export async function listAppDataChanges(
  accessToken: string,
  pageToken: string,
  fetchFn: typeof fetch = fetch
): Promise<DriveChangeList> {
  const url = new URL(`${API_BASE}/changes`);
  url.searchParams.set('pageToken', pageToken);
  url.searchParams.set('spaces', APP_DATA_FOLDER);
  url.searchParams.set('includeRemoved', 'true');
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set(
    'fields',
    `nextPageToken,newStartPageToken,changes(fileId,removed,file(${DRIVE_FILE_FIELDS}))`
  );
  const response = await fetchFn(url.toString(), {
    headers: authHeaders(accessToken),
  });
  return driveJson<DriveChangeList>(response, 'changes.list');
}

/** Current metadata of one file */
export async function getDriveFileMetadata(
  accessToken: string,
  fileId: string,
  fetchFn: typeof fetch = fetch
): Promise<DriveFile> {
  const url = new URL(`${API_BASE}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('fields', DRIVE_FILE_FIELDS);
  const response = await fetchFn(url.toString(), {
    headers: authHeaders(accessToken),
  });
  return driveJson<DriveFile>(response, 'files.get');
}

/** Download a file's bytes */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  fetchFn: typeof fetch = fetch
): Promise<Uint8Array> {
  const response = await fetchFn(
    `${API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: authHeaders(accessToken) }
  );
  if (!response.ok) await throwForResponse(response, 'files.get (media)');
  return new Uint8Array(await response.arrayBuffer());
}

/** Delete a file permanently (skipping the trash) */
export async function deleteDriveFile(
  accessToken: string,
  fileId: string,
  fetchFn: typeof fetch = fetch
): Promise<void> {
  const response = await fetchFn(
    `${API_BASE}/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE', headers: authHeaders(accessToken) }
  );
  if (!response.ok) await throwForResponse(response, 'files.delete');
}

const CONTENT_TYPE = 'application/octet-stream';

/**
 * Create a file named `name` in the app data folder. Small files go up in one
 * multipart request; larger ones through a resumable session.
 */
export async function createAppDataFile(
  accessToken: string,
  name: string,
  content: Uint8Array,
  fetchFn: typeof fetch = fetch
): Promise<DriveFile> {
  const metadata = { name, parents: [APP_DATA_FOLDER], mimeType: CONTENT_TYPE };
  if (content.byteLength > SIMPLE_UPLOAD_LIMIT) {
    return resumableUpload(
      accessToken,
      'POST',
      `${UPLOAD_BASE}/files`,
      metadata,
      content,
      fetchFn
    );
  }
  const boundary = `inkweld-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${CONTENT_TYPE}\r\n\r\n`,
    content as BlobPart,
    `\r\n--${boundary}--`,
  ]);
  const url = new URL(`${UPLOAD_BASE}/files`);
  url.searchParams.set('uploadType', 'multipart');
  url.searchParams.set('fields', DRIVE_FILE_FIELDS);
  const response = await fetchFn(url.toString(), {
    method: 'POST',
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  return driveJson<DriveFile>(response, 'files.create');
}

/** Replace the content of an existing file */
export async function updateDriveFileContent(
  accessToken: string,
  fileId: string,
  content: Uint8Array,
  fetchFn: typeof fetch = fetch
): Promise<DriveFile> {
  const endpoint = `${UPLOAD_BASE}/files/${encodeURIComponent(fileId)}`;
  if (content.byteLength > SIMPLE_UPLOAD_LIMIT) {
    return resumableUpload(
      accessToken,
      'PATCH',
      endpoint,
      {},
      content,
      fetchFn
    );
  }
  const url = new URL(endpoint);
  url.searchParams.set('uploadType', 'media');
  url.searchParams.set('fields', DRIVE_FILE_FIELDS);
  const response = await fetchFn(url.toString(), {
    method: 'PATCH',
    headers: { ...authHeaders(accessToken), 'Content-Type': CONTENT_TYPE },
    body: content as BodyInit,
  });
  return driveJson<DriveFile>(response, 'files.update');
}

/**
 * Open a resumable session, then send the whole body in one PUT. The session
 * URI comes back in `Location`, which Google's upload endpoint exposes to
 * browser origins.
 */
async function resumableUpload(
  accessToken: string,
  method: 'POST' | 'PATCH',
  endpoint: string,
  metadata: Record<string, unknown>,
  content: Uint8Array,
  fetchFn: typeof fetch
): Promise<DriveFile> {
  const url = new URL(endpoint);
  url.searchParams.set('uploadType', 'resumable');
  url.searchParams.set('fields', DRIVE_FILE_FIELDS);
  const start = await fetchFn(url.toString(), {
    method,
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': CONTENT_TYPE,
      'X-Upload-Content-Length': String(content.byteLength),
    },
    body: JSON.stringify(metadata),
  });
  if (!start.ok) await throwForResponse(start, 'upload (resumable start)');
  const sessionUri = start.headers.get('Location');
  if (!sessionUri) {
    throw new DriveApiError(
      start.status,
      'noSessionUri',
      'Resumable upload did not return a session URI',
      'upload (resumable start)'
    );
  }
  const response = await fetchFn(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Type': CONTENT_TYPE },
    body: content as BodyInit,
  });
  return driveJson<DriveFile>(response, 'upload (resumable)');
}
