import type { Context } from 'hono';

import { configService } from './config.service';
import type { DatabaseInstance } from '../types/context';
import { stripTrailingSlashes } from '../utils/string-utils';

/**
 * Resolve the public base URL for constructing email links and other external URLs.
 *
 * Priority order:
 * 1. SITE_URL from database config (admin-configurable)
 * 2. DEFAULT_SERVER_NAME environment variable
 * 3. First ALLOWED_ORIGINS entry
 * 4. Fallback to http://localhost:4200
 */
export async function getBaseUrl(db: DatabaseInstance): Promise<string> {
  // 1. Check database config for SITE_URL (admin-configurable)
  try {
    const siteUrl = await configService.get(db, 'SITE_URL');
    if (siteUrl.value && siteUrl.source !== 'default') {
      return stripTrailingSlashes(siteUrl.value);
    }
  } catch {
    // Key might not exist yet — fall through
  }

  // 2. Check DEFAULT_SERVER_NAME environment variable
  const defaultServerName = process.env.DEFAULT_SERVER_NAME?.trim();
  if (defaultServerName) return stripTrailingSlashes(defaultServerName);

  // 3. Fall back to first allowed origin
  const origins = process.env.ALLOWED_ORIGINS?.split(',');
  if (origins && origins.length > 0 && origins[0].trim()) {
    return stripTrailingSlashes(origins[0].trim());
  }

  // 4. Last resort
  return 'http://localhost:4200';
}

/**
 * The origin a request arrived on, as the caller sees it: a proxy in front of
 * Bun may terminate TLS or rewrite the host, and says so in `X-Forwarded-*`.
 * A caller that lies here only misleads itself, so this must only be used for
 * what goes back to the same caller.
 */
export function getRequestOrigin(c: Context): string {
  const url = new URL(c.req.url);
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  if (forwardedHost) {
    // Setting a host without a port would keep the internal one.
    url.port = '';
    url.host = forwardedHost;
  }
  const forwardedProto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedProto === 'https' || forwardedProto === 'http') {
    url.protocol = `${forwardedProto}:`;
  }
  return url.origin;
}

/**
 * Resolve the public URL of this API server, for links that the server itself
 * must answer (e.g. `/share/:token`).
 *
 * Unlike {@link getBaseUrl} this is not the frontend: on a split deployment
 * (Cloudflare Pages + Workers) the two are different origins.
 *
 * Priority order:
 * 1. BASE_URL (Workers binding or environment variable)
 * 2. The origin the request arrived on ({@link getRequestOrigin})
 */
export function getPublicApiUrl(c: Context): string {
  const configured =
    (c.env as Record<string, string | undefined> | undefined)?.BASE_URL || process.env.BASE_URL;
  if (configured?.trim()) return stripTrailingSlashes(configured.trim());
  return getRequestOrigin(c);
}
