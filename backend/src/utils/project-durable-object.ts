/**
 * Cloudflare Workers only: operations on a project's Durable Object that go
 * with deleting or renaming the project. The DO is named `username:slug`, so
 * a project re-created under the same slug maps to the same object and would
 * otherwise resurrect the deleted documents, and a renamed project maps to a
 * different, empty one.
 */

import type { Context } from 'hono';
import { forEachPage } from '@inkweld/async';
import { InternalError } from '../errors';
import { logger } from '../services/logger.service';
import type { DurableObjectNamespace } from '../types/cloudflare';
import type { AppContext } from '../types/context';

const projectDoLog = logger.child('ProjectDurableObject');

/**
 * Durable Object routes for moving a project to a new slug. Each takes the
 * object's own `documentId` plus `from` and `to` slugs, and is authorized by
 * `resolveProjectRenameAccess` against whichever slug the project has.
 *
 * On the old object (`from`): `lock` closes its sockets and holds off writes,
 * `export` returns a page of rows, `unlock` gives up, and `complete` wipes it
 * once the database carries the new slug. On the new object (`to`): `discard`
 * wipes it and `import` writes a page of rows under the new keys.
 */
export const RENAME_ROUTES = {
  lock: '/api/rename/lock',
  export: '/api/rename/export',
  unlock: '/api/rename/unlock',
  complete: '/api/rename/complete',
  discard: '/api/rename/discard',
  import: '/api/rename/import',
} as const;

/** Response header carrying the (URI-encoded) key the next export page starts after. */
export const RENAME_NEXT_CURSOR_HEADER = 'X-Rename-Next-Cursor';

function projectNamespace(c: Context<AppContext>): DurableObjectNamespace | undefined {
  return (c.env as { YJS_PROJECTS?: DurableObjectNamespace } | undefined)?.YJS_PROJECTS;
}

function requireAuthorization(c: Context<AppContext>, action: string): string {
  const authorization = c.req.header('Authorization');
  if (!authorization) {
    throw new InternalError(`Cannot ${action} project documents without a session token`);
  }
  return authorization;
}

/**
 * No-op when there is no YJS_PROJECTS binding (Bun/Node, where the Yjs
 * service and the project directory removal already covered the documents).
 * The DO re-checks that the bearer token belongs to the owner (or an active
 * site admin, for account deletion), so the caller's Authorization header is
 * forwarded as-is.
 */
export async function destroyProjectDurableObject(
  c: Context<AppContext>,
  username: string,
  slug: string
): Promise<void> {
  const namespace = projectNamespace(c);
  if (!namespace) return;
  const authorization = requireAuthorization(c, 'remove');
  const stub = namespace.get(namespace.idFromName(`${username}:${slug}`));
  const docId = encodeURIComponent(`${username}:${slug}:elements`);
  const response = await stub.fetch(
    new Request(`https://yjs-do/api/destroy?documentId=${docId}`, {
      method: 'POST',
      headers: { Authorization: authorization },
    })
  );
  if (!response.ok) {
    throw new InternalError(`Failed to remove project documents (${response.status})`);
  }
}

/** Moving a project's Durable Object storage to the object of its new slug. */
export interface ProjectDurableObjectMove {
  /**
   * Lock the old object, empty the new one and copy every document row
   * across. On failure the copy is discarded and the old object unlocked
   * before the error is rethrown.
   */
  copy(): Promise<void>;
  /** Undo a finished copy: empty the new object and unlock the old one. */
  abort(): Promise<void>;
  /** After the database carries the new slug: wipe the old object. */
  complete(): Promise<void>;
}

/**
 * Prepare to move `username:fromSlug`'s Durable Object to `username:toSlug`,
 * or return null when there is no YJS_PROJECTS binding (Bun/Node keep
 * documents in the project directory's LevelDB instead).
 *
 * The Worker shuttles the rows page by page rather than having one object
 * call the other, so each step carries the caller's own token and is
 * authorized like any other DO request.
 */
export function prepareProjectDurableObjectMove(
  c: Context<AppContext>,
  username: string,
  fromSlug: string,
  toSlug: string
): ProjectDurableObjectMove | null {
  const namespace = projectNamespace(c);
  if (!namespace) return null;
  const authorization = requireAuthorization(c, 'move');

  const call = async (
    slug: string,
    path: string,
    init: { method: 'GET' | 'POST'; startAfter?: string; body?: ArrayBuffer }
  ): Promise<Response> => {
    const url = new URL(`https://yjs-do${path}`);
    url.searchParams.set('documentId', `${username}:${slug}:elements`);
    url.searchParams.set('from', fromSlug);
    url.searchParams.set('to', toSlug);
    if (init.startAfter !== undefined) url.searchParams.set('startAfter', init.startAfter);
    const stub = namespace.get(namespace.idFromName(`${username}:${slug}`));
    const response = await stub.fetch(
      new Request(url.href, {
        method: init.method,
        headers: { Authorization: authorization },
        ...(init.body ? { body: init.body } : {}),
      })
    );
    if (!response.ok) {
      throw new InternalError(`Failed to move project documents (${path}: ${response.status})`);
    }
    return response;
  };

  const abort = async (): Promise<void> => {
    const results = await Promise.allSettled([
      call(toSlug, RENAME_ROUTES.discard, { method: 'POST' }),
      call(fromSlug, RENAME_ROUTES.unlock, { method: 'POST' }),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        projectDoLog.error(`Rolling back rename of ${username}:${fromSlug}`, result.reason);
      }
    }
  };

  const copy = async (): Promise<void> => {
    try {
      await call(fromSlug, RENAME_ROUTES.lock, { method: 'POST' });
      // The new object may hold rows of a project that once had this slug.
      await call(toSlug, RENAME_ROUTES.discard, { method: 'POST' });
      // Each page starts after the previous one's last key.
      await forEachPage<ArrayBuffer, string>(
        async (startAfter) => {
          const response = await call(fromSlug, RENAME_ROUTES.export, {
            method: 'GET',
            startAfter,
          });
          const next = response.headers.get(RENAME_NEXT_CURSOR_HEADER);
          return {
            page: await response.arrayBuffer(),
            next: next ? decodeURIComponent(next) : undefined,
          };
        },
        async (page) => {
          await call(toSlug, RENAME_ROUTES.import, { method: 'POST', body: page });
        }
      );
    } catch (error) {
      await abort();
      throw error;
    }
  };

  const complete = async (): Promise<void> => {
    await call(fromSlug, RENAME_ROUTES.complete, { method: 'POST' });
  };

  return { copy, abort, complete };
}
