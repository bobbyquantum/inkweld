/**
 * Per-document revision manifest.
 *
 * Reports the current server revision of every prose document in a project so a
 * client can skip WebSocket syncs for documents whose revision it has already
 * seen. Two runtimes are supported behind one signature:
 *
 *  - **Bun/Node**: reads each document's latest LevelDB update clock via
 *    `yjsService.getDocumentRevisions` (one reverse scan per document, no
 *    document loaded).
 *  - **Cloudflare Workers**: asks the project's Durable Object for the same
 *    data through its HTTP API (`GET /api/revisions`), which enumerates the
 *    project's `ITEM` elements and reads one storage row per document.
 *
 * The token is opaque to callers — only ever compared to a token previously
 * received from the *same* deployment.
 */

import { logger } from './logger.service';
import type { DocumentRevisionEntry } from '../types/document-revision.types';
import type { DurableObjectNamespace } from '../types/cloudflare';

const revisionLog = logger.child('DocumentRevision');

/** Minimal env bindings needed to reach the project's Durable Object. */
export interface RevisionEnv {
  YJS_PROJECTS?: DurableObjectNamespace;
}

/** True when running on Cloudflare Workers (DO bindings present). */
function isCloudflareRuntime(env?: Partial<RevisionEnv>): boolean {
  return Boolean(env?.YJS_PROJECTS);
}

/**
 * Return the revision token for every prose (`ITEM`) document in a project.
 *
 * A document that has never been persisted reports `revision: null`; a document
 * whose revision could not be read reports `unknown: true` so callers sync it
 * instead of skipping it.
 */
export async function getProjectDocumentRevisions(
  username: string,
  slug: string,
  env?: Partial<RevisionEnv>,
  authToken = ''
): Promise<DocumentRevisionEntry[]> {
  if (isCloudflareRuntime(env)) {
    return getWorkerDocumentRevisions(username, slug, env, authToken);
  }

  const { yjsService } = await import('./yjs.service');
  const elements = await yjsService.getElements(username, slug);
  const documentIds = elements
    .filter((element) => element.type === 'ITEM')
    .map((element) => `${username}:${slug}:${element.id}`);
  return yjsService.getDocumentRevisions(username, slug, documentIds);
}

/**
 * Cloudflare path: one internal call to the project's Durable Object, which
 * enumerates its own `elements` doc and reports a revision row per document.
 * A single call covers the whole project, so the client never opens a socket
 * (or makes a per-document request) just to discover nothing changed.
 */
async function getWorkerDocumentRevisions(
  username: string,
  slug: string,
  env: Partial<RevisionEnv> | undefined,
  authToken: string
): Promise<DocumentRevisionEntry[]> {
  const namespace = env?.YJS_PROJECTS;
  if (!namespace) return [];

  const projectKey = `${username}:${slug}`;
  const stub = namespace.get(namespace.idFromName(projectKey));
  const docId = `${username}:${slug}:elements`;

  try {
    const response = await stub.fetch(
      new Request(`https://yjs-do/api/revisions?documentId=${encodeURIComponent(docId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    if (!response.ok) {
      revisionLog.warn(
        `Revision manifest for ${projectKey} failed: ${response.status} ${await response.text()}`
      );
      return [];
    }
    const data = (await response.json()) as { documents?: DocumentRevisionEntry[] };
    return data.documents ?? [];
  } catch (error) {
    revisionLog.warn(`Revision manifest for ${projectKey} errored`, {
      error: String(error),
    });
    return [];
  }
}
