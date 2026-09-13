/**
 * Cut a collaborator's live collaboration sockets after their access changes.
 *
 * Socket access is resolved once at authentication and cached for the life
 * of the connection (and, on Workers, persisted across hibernation), so a
 * removal or role change in the database alone left already-open sessions
 * reading and writing until they disconnected. Closing the sockets makes the
 * client reconnect and re-run the access check.
 *
 * Best-effort: the database change has already happened, so failures here
 * are logged rather than surfaced — the stale session ends on its next
 * reconnect at the latest.
 */

import type { Context } from 'hono';
import { yjsService } from '../services/yjs.service';
import { logger } from '../services/logger.service';
import type { DurableObjectNamespace } from '../types/cloudflare';
import type { AppContext } from '../types/context';

const log = logger.child('CollaboratorRevocation');

export type RevocationReason = 'removed' | 'changed';

export async function revokeCollaboratorSockets(
  c: Context<AppContext>,
  username: string,
  slug: string,
  userId: string,
  reason: RevocationReason
): Promise<void> {
  // Bun/Node: sockets live in this process.
  try {
    yjsService.revokeUserAccess(username, slug, userId, reason);
  } catch (error) {
    log.error('Failed to close local collaboration sockets', error, { username, slug, userId });
  }

  // Cloudflare Workers: sockets live in the project's Durable Object.
  const namespace = (c.env as { YJS_PROJECTS?: DurableObjectNamespace } | undefined)?.YJS_PROJECTS;
  const authorization = c.req.header('Authorization');
  if (!namespace || !authorization) return;
  try {
    const stub = namespace.get(namespace.idFromName(`${username}:${slug}`));
    const docId = encodeURIComponent(`${username}:${slug}:elements`);
    const response = await stub.fetch(
      new Request(`https://yjs-do/api/revoke?documentId=${docId}`, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason }),
      })
    );
    if (!response.ok) {
      log.warn(`Durable Object revoke returned ${response.status}`, { username, slug, userId });
    }
  } catch (error) {
    log.error('Failed to revoke collaboration sockets on Durable Object', error, {
      username,
      slug,
      userId,
    });
  }
}
