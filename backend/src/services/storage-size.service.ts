/**
 * Storage size reporting.
 *
 * Gives an *approximate* figure for how much server-side storage a project
 * uses, split into two buckets:
 *   - `dataBytes` — Yjs document / collaboration data. On Bun/Node this is the
 *     on-disk size of the project directory (including the `.yjs` LevelDB
 *     store). On Cloudflare Workers it is the Durable Object storage size for
 *     the project, queried over the DO HTTP API.
 *   - `mediaBytes` — media files (images/audio/video/PDF/EPUB/etc.) stored in
 *     the storage adapter (filesystem on Bun/Node, R2 on Workers).
 *
 * Both runtimes share a common shape so the frontend can render them
 * identically regardless of deployment.
 */

import type { R2Bucket } from '@cloudflare/workers-types';
import { FileStorageService } from './file-storage.service';
import { getStorageService } from './storage.service';
import type { DurableObjectNamespace } from '../types/cloudflare';

/**
 * Result of a per-project size estimate.
 */
export interface ProjectStorageSize {
  /** Approximate size in bytes of Yjs document / collaboration data. */
  dataBytes: number;
  /** Approximate size in bytes of media files. */
  mediaBytes: number;
}

/** Minimal env bindings needed to query Durable Object storage. */
export interface CloudflareSizeEnv {
  STORAGE?: R2Bucket;
  YJS_PROJECTS?: DurableObjectNamespace;
  DATABASE_KEY?: string;
  SESSION_SECRET?: string;
}

/** True when running on Cloudflare Workers (D1 runtime with DO bindings). */
function isCloudflareRuntime(_r2?: R2Bucket, env?: Partial<CloudflareSizeEnv>): boolean {
  return Boolean(env?.YJS_PROJECTS);
}

/** Minimal structural subset needed to list a project's media files. */
interface MediaLister {
  listProjectFiles(
    username: string,
    slug: string,
    prefix?: string
  ): Promise<Array<{ filename: string; size: number }>>;
}

/** Sum the sizes of media-type files listed by the storage adapter. */
async function getMediaBytes(
  storage: MediaLister,
  username: string,
  slug: string
): Promise<number> {
  const files = await storage.listProjectFiles(username, slug);
  return files.reduce((sum, file) => sum + (file.size ?? 0), 0);
}

/** Approximate Yjs/data bytes on Bun/Node from the on-disk project directory. */
async function getBunDataBytes(username: string, slug: string): Promise<number> {
  try {
    // A fresh instance picks up config.dataPath at call time.
    return await new FileStorageService().getProjectDirectorySize(username, slug);
  } catch {
    return 0;
  }
}

/**
 * Approximate Yjs/data bytes on Cloudflare Workers from the project's Durable
 * Object storage. Returns 0 when DO bindings or a token are unavailable.
 */
async function getWorkerDataBytes(
  username: string,
  slug: string,
  env: Partial<CloudflareSizeEnv> | undefined,
  authToken: string
): Promise<number> {
  const namespace = env?.YJS_PROJECTS;
  if (!namespace || !authToken) return 0;

  try {
    const projectKey = `${username}:${slug}`;
    const stub = namespace.get(namespace.idFromName(projectKey));
    const docId = `${username}:${slug}:elements`;
    const response = await stub.fetch(
      new Request(`https://yjs-do/api/storage-size?documentId=${encodeURIComponent(docId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    );
    if (!response.ok) return 0;
    const data = (await response.json()) as { bytes?: number };
    return typeof data.bytes === 'number' ? data.bytes : 0;
  } catch {
    return 0;
  }
}

/**
 * Compute the approximate storage size of a single project.
 *
 * @param username - Project owner username.
 * @param slug - Project slug.
 * @param r2 - R2 bucket binding, if present (Cloudflare Workers).
 * @param env - Cloudflare bindings used to reach the project's Durable Object.
 * @param authToken - Bearer token the DO HTTP API will verify.
 */
export async function getProjectStorageSize(
  username: string,
  slug: string,
  r2?: R2Bucket,
  env?: Partial<CloudflareSizeEnv>,
  authToken = ''
): Promise<ProjectStorageSize> {
  // On Bun/Node a fresh instance picks up config.dataPath at call time (the
  // shared singleton captures it at import time, which is fine in production
  // but harder to test). On Workers `getStorageService` wraps the R2 bucket.
  const cloudflare = isCloudflareRuntime(r2, env);
  const storage = cloudflare ? getStorageService(r2) : new FileStorageService();

  const mediaBytes = await getMediaBytes(storage, username, slug).catch(() => 0);

  let dataBytes: number;
  if (cloudflare) {
    dataBytes = await getWorkerDataBytes(username, slug, env, authToken);
  } else {
    // On Bun/Node the whole project directory holds both the `.yjs` LevelDB
    // data AND the media files, so subtract media to avoid double-counting.
    const dirBytes = await getBunDataBytes(username, slug);
    dataBytes = Math.max(0, dirBytes - mediaBytes);
  }

  return { dataBytes, mediaBytes };
}
