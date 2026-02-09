import { configService } from './config.service';
import type { DatabaseInstance } from '../types/context';

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
      return siteUrl.value.replace(/\/+$/, ''); // strip trailing slashes
    }
  } catch {
    // Key might not exist yet — fall through
  }

  // 2. Check DEFAULT_SERVER_NAME environment variable
  const defaultServerName = process.env.DEFAULT_SERVER_NAME?.trim();
  if (defaultServerName) return defaultServerName.replace(/\/+$/, '');

  // 3. Fall back to first allowed origin
  const origins = process.env.ALLOWED_ORIGINS?.split(',');
  if (origins && origins.length > 0 && origins[0].trim()) {
    return origins[0].trim().replace(/\/+$/, '');
  }

  // 4. Last resort
  return 'http://localhost:4200';
}
