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

  if (rest.length === 1) {
    switch (rest[0]) {
      case 'project.json':
        return { username, slug, kind: 'project' };
      case `elements${YJS_EXTENSION}`:
        return { username, slug, kind: 'elements' };
      case 'media.json':
        return { username, slug, kind: 'media-index' };
      default:
        return null;
    }
  }

  if (rest.length === 2) {
    const [folder, file] = rest;
    if (!file) return null;
    if (folder === 'media') {
      return { username, slug, kind: 'media', id: file };
    }
    if (!file.endsWith(YJS_EXTENSION)) return null;
    const id = file.slice(0, -YJS_EXTENSION.length);
    if (!id) return null;
    if (folder === 'documents') {
      return { username, slug, kind: 'document', id };
    }
    if (folder === 'worldbuilding') {
      return { username, slug, kind: 'worldbuilding', id };
    }
  }

  if (rest.length === 3 && rest[0] === 'snapshots') {
    const [, documentId, file] = rest;
    if (!documentId || !file.endsWith('.json')) return null;
    const snapshotId = file.slice(0, -'.json'.length);
    if (!snapshotId) return null;
    return { username, slug, kind: 'snapshot', id: documentId, snapshotId };
  }
  return null;
}

/** Derive "username/slug" from a local document or worldbuilding doc id */
export function projectKeyFromDocId(docId: string): string | null {
  const parts = docId.split(':');
  if (parts[0] === 'worldbuilding') parts.shift();
  if (parts.length < 3) return null;
  return projectKeyOf(parts[0], parts[1]);
}
