/**
 * The one check for a Yjs document id that comes from a client. The Bun sync
 * route (`routes/yjs.routes.ts`), the Worker route that picks a project's
 * Durable Object (`routes/yjs-worker.routes.ts`) and the Durable Object itself
 * (`durable-objects/yjs-project.do.ts`) all read ids with it before doing
 * anything else, and `YjsService` uses it so it never keeps a document it could
 * not persist or find again by project.
 *
 * Accepted: `owner:slug:docName`, where `docName` is `elements` or an element
 * id, all three non-empty, with an optional single trailing `/`. Both forms are
 * expected (see "Yjs Document ID Trailing Slash" in AGENTS.md): y-websocket
 * strips the slashes the frontend's id may end with and appends one `/` (its
 * empty room name), and backend and MCP callers use either form.
 *
 * The owner and slug are always the first two segments. Clients never send the
 * `worldbuilding:` prefix (the frontend only uses it to name IndexedDB
 * databases), so it has no special meaning here: an id that starts with it is
 * read with `worldbuilding` as the owner. Access checks, persistence and the
 * choice of Durable Object therefore always name the same project.
 */

/** A document id that passed {@link parseDocumentId}. */
export interface ParsedDocumentId {
  /** The id as received, trailing slash included. The Bun server stores documents under it. */
  documentId: string;
  /** The id without its trailing slash. The Durable Object keys documents by it. */
  bareId: string;
  /** Username of the project owner. */
  projectOwner: string;
  /** Project slug. */
  slug: string;
  /** `elements` or an element id. May contain `:`, never ends with `/`. */
  docName: string;
  /** True for the project's elements tree (`docName` is `elements`). */
  isElements: boolean;
}

/** Document name of the project-level elements tree. */
const ELEMENTS_DOC_NAME = 'elements';

/**
 * Parse a document id from a client. Returns null for anything that is not
 * `owner:slug:docName` with non-empty parts and at most one trailing `/`.
 */
export function parseDocumentId(documentId: string | null | undefined): ParsedDocumentId | null {
  if (typeof documentId !== 'string') return null;
  const bareId = documentId.endsWith('/') ? documentId.slice(0, -1) : documentId;
  // One trailing slash at most: the Durable Object strips them all, so more
  // than one would name a different document there than on Bun.
  if (bareId.endsWith('/')) return null;

  const ownerEnd = bareId.indexOf(':');
  if (ownerEnd <= 0) return null;
  const slugEnd = bareId.indexOf(':', ownerEnd + 1);
  // Missing second separator, or an empty slug.
  if (slugEnd <= ownerEnd + 1) return null;
  const docName = bareId.slice(slugEnd + 1);
  if (!docName) return null;

  return {
    documentId,
    bareId,
    projectOwner: bareId.slice(0, ownerEnd),
    slug: bareId.slice(ownerEnd + 1, slugEnd),
    docName,
    isElements: docName === ELEMENTS_DOC_NAME,
  };
}

/** The `owner:slug` key of a parsed id: one project, one LevelDB, one Durable Object. */
export function documentProjectKey(
  parsed: Pick<ParsedDocumentId, 'projectOwner' | 'slug'>
): string {
  return `${parsed.projectOwner}:${parsed.slug}`;
}
