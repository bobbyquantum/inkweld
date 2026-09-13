/**
 * Cloudflare Workers only: ask a project's Durable Object to close its
 * sockets and wipe its storage as part of deleting the project. The DO is
 * named `username:slug`, so a project re-created under the same slug maps to
 * the same object and would otherwise resurrect the deleted documents.
 */

import type { Context } from 'hono';
import { InternalError } from '../errors';
import type { DurableObjectNamespace } from '../types/cloudflare';
import type { AppContext } from '../types/context';

/**
 * No-op when there is no YJS_PROJECTS binding (Bun/Node, where the Yjs
 * service and the project directory removal already covered the documents).
 * The DO re-checks that the bearer token belongs to the owner, so the
 * caller's Authorization header is forwarded as-is.
 */
export async function destroyProjectDurableObject(
  c: Context<AppContext>,
  username: string,
  slug: string
): Promise<void> {
  const namespace = (c.env as { YJS_PROJECTS?: DurableObjectNamespace } | undefined)?.YJS_PROJECTS;
  if (!namespace) return;
  const authorization = c.req.header('Authorization');
  if (!authorization) {
    throw new InternalError('Cannot remove project documents without a session token');
  }
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
