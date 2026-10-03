import type { Context } from 'hono';
import type { AppContext } from '../types/context';
import type { QuotaStorageContext } from '../services/quota.service';
import type { getStorageService } from '../services/storage.service';

/**
 * The storage bindings and bearer token a quota check needs to measure a
 * project on either runtime: the R2 bucket and Durable Object namespace on
 * Workers (the token authorises the DO's size endpoint), nothing on Bun.
 */
export function quotaStorageContext(c: Context<AppContext>): QuotaStorageContext {
  const authHeader = c.req.header('Authorization') ?? '';
  return {
    r2: c.get('storage'),
    env: c.env as never,
    authToken: authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '',
  };
}

/**
 * Size of a top-level file already stored for a project, or 0 when absent.
 * Lets an overwrite (a retried upload, a replaced cover) be charged only for
 * the growth, and a deletion credit back exactly what it frees.
 */
export async function storedProjectFileSize(
  storage: ReturnType<typeof getStorageService>,
  username: string,
  slug: string,
  filename: string
): Promise<number> {
  const matches = await storage.listProjectFiles(username, slug, filename);
  return matches.find((f) => f.filename === filename)?.size ?? 0;
}
