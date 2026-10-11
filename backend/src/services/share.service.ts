import { eq } from 'drizzle-orm';

import { publishedFiles, type PublishedFile } from '../db/schema';
import type { DatabaseInstance } from '../types/context';

/**
 * Look up a published file by its share token.
 *
 * Returns null unless sharing is on ("Anyone with link" or "Anyone"); a token
 * on its own is not permission.
 */
export async function findSharedFile(
  db: DatabaseInstance,
  shareToken: string
): Promise<PublishedFile | null> {
  const [file] = await db
    .select()
    .from(publishedFiles)
    .where(eq(publishedFiles.shareToken, shareToken));

  if (!file || !isSharedPermission(file.sharePermission)) {
    return null;
  }
  return file;
}

/** Whether a permission lets people without an account open the file. */
export function isSharedPermission(permission: string): boolean {
  return permission === 'link' || permission === 'public';
}
