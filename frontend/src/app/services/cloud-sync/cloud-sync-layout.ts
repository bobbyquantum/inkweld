/**
 * Remote folder layout for Cloud Sync. Every path is relative to the
 * provider app folder and starts with "/".
 *
 * ```
 * /manifest.json
 * /projects/<username>/<slug>/project.json        project metadata (LWW)
 * /projects/<username>/<slug>/elements.yjs        full Yjs state of the elements doc
 * /projects/<username>/<slug>/documents/<id>.yjs  prose documents (ITEM elements)
 * /projects/<username>/<slug>/worldbuilding/<id>.yjs
 * /projects/<username>/<slug>/snapshots/<docId>/<snapshotId>.json  immutable version-history entries
 * /projects/<username>/<slug>/media.json          media index (union merge)
 * /projects/<username>/<slug>/media/<mediaId>     raw blob bytes
 * ```
 *
 * Yjs files hold `Y.encodeStateAsUpdate(doc)`; merging is `Y.applyUpdate`,
 * so two devices editing before either syncs converge without conflicts.
 */

export const CLOUD_PROJECTS_ROOT = '/projects';
export const YJS_EXTENSION = '.yjs';

export function projectFolder(username: string, slug: string): string {
  return `${CLOUD_PROJECTS_ROOT}/${username}/${slug}`;
}

export function projectJsonPath(username: string, slug: string): string {
  return `${projectFolder(username, slug)}/project.json`;
}

export function elementsPath(username: string, slug: string): string {
  return `${projectFolder(username, slug)}/elements${YJS_EXTENSION}`;
}

export function documentPath(
  username: string,
  slug: string,
  elementId: string
): string {
  return `${projectFolder(username, slug)}/documents/${elementId}${YJS_EXTENSION}`;
}

export function worldbuildingPath(
  username: string,
  slug: string,
  elementId: string
): string {
  return `${projectFolder(username, slug)}/worldbuilding/${elementId}${YJS_EXTENSION}`;
}

export function snapshotsFolder(username: string, slug: string): string {
  return `${projectFolder(username, slug)}/snapshots`;
}

export function snapshotPath(
  username: string,
  slug: string,
  documentId: string,
  snapshotId: string
): string {
  return `${snapshotsFolder(username, slug)}/${documentId}/${snapshotId}.json`;
}

export function mediaIndexPath(username: string, slug: string): string {
  return `${projectFolder(username, slug)}/media.json`;
}

export function mediaPath(
  username: string,
  slug: string,
  mediaId: string
): string {
  return `${projectFolder(username, slug)}/media/${mediaId}`;
}

/** Local IndexedDB doc id for a prose document (unprefixed, see DocumentService) */
export function documentDocId(
  username: string,
  slug: string,
  elementId: string
): string {
  return `${username}:${slug}:${elementId}`;
}

/** Local IndexedDB doc id for a worldbuilding element (unprefixed) */
export function worldbuildingDocId(
  username: string,
  slug: string,
  elementId: string
): string {
  return `worldbuilding:${username}:${slug}:${elementId}`;
}

/** "username/slug", the key used by media, activation and tombstone stores */
export function projectKeyOf(username: string, slug: string): string {
  return `${username}/${slug}`;
}

export function splitProjectKey(
  projectKey: string
): { username: string; slug: string } | null {
  const idx = projectKey.indexOf('/');
  if (idx <= 0 || idx === projectKey.length - 1) return null;
  return {
    username: projectKey.slice(0, idx),
    slug: projectKey.slice(idx + 1),
  };
}

export type RemotePathKind =
  | 'project'
  | 'elements'
  | 'document'
  | 'worldbuilding'
  | 'media-index'
  | 'media'
  | 'snapshot';

export interface ParsedRemotePath {
  username: string;
  slug: string;
  kind: RemotePathKind;
  /** element id for documents/worldbuilding/snapshots, media id for media */
  id?: string;
  /** snapshot id for snapshots */
  snapshotId?: string;
}

/**
 * Parse a remote path back into its parts. Returns null for anything outside
 * the layout, so unknown files in the folder are ignored rather than fatal.
 */
export function parseRemotePath(path: string): ParsedRemotePath | null {
  if (!path.startsWith(`${CLOUD_PROJECTS_ROOT}/`)) return null;
  const parts = path.slice(CLOUD_PROJECTS_ROOT.length + 1).split('/');
  if (parts.length < 3) return null;
  const [username, slug, ...rest] = parts;
  if (!username || !slug) return null;

  let parsed: Omit<ParsedRemotePath, 'username' | 'slug'> | null = null;
  if (rest.length === 1) parsed = parseProjectLevelFile(rest[0]);
  else if (rest.length === 2) parsed = parseFolderFile(rest[0], rest[1]);
  else if (rest.length === 3) parsed = parseSnapshotFile(rest);
  return parsed ? { username, slug, ...parsed } : null;
}

type ParsedKindPart = Omit<ParsedRemotePath, 'username' | 'slug'>;

const PROJECT_LEVEL_FILES: Record<string, RemotePathKind> = {
  'project.json': 'project',
  [`elements${YJS_EXTENSION}`]: 'elements',
  'media.json': 'media-index',
};

function parseProjectLevelFile(file: string): ParsedKindPart | null {
  const kind = PROJECT_LEVEL_FILES[file];
  return kind ? { kind } : null;
}

function parseFolderFile(folder: string, file: string): ParsedKindPart | null {
  if (!file) return null;
  if (folder === 'media') return { kind: 'media', id: file };
  const id = stripSuffix(file, YJS_EXTENSION);
  if (!id) return null;
  if (folder === 'documents') return { kind: 'document', id };
  if (folder === 'worldbuilding') return { kind: 'worldbuilding', id };
  return null;
}

function parseSnapshotFile(rest: string[]): ParsedKindPart | null {
  const [folder, documentId, file] = rest;
  if (folder !== 'snapshots' || !documentId) return null;
  const snapshotId = stripSuffix(file, '.json');
  return snapshotId ? { kind: 'snapshot', id: documentId, snapshotId } : null;
}

/** The name without `suffix`, or null when it lacks the suffix or is empty */
function stripSuffix(file: string, suffix: string): string | null {
  if (!file.endsWith(suffix)) return null;
  const stem = file.slice(0, -suffix.length);
  return stem || null;
}

/** Derive "username/slug" from a local document or worldbuilding doc id */
export function projectKeyFromDocId(docId: string): string | null {
  const parts = docId.split(':');
  if (parts[0] === 'worldbuilding') parts.shift();
  if (parts.length < 3) return null;
  return projectKeyOf(parts[0], parts[1]);
}
