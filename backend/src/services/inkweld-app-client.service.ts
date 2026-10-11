/**
 * "Allow the inkweld.app client" (ALLOW_INKWELD_APP_CLIENT).
 *
 * The official hosted app at https://inkweld.app — which the Android app
 * also loads — can connect to any Inkweld server, but a self-hosted server
 * only trusts the origins in ALLOWED_ORIGINS. This one admin switch adds the
 * hosted app everywhere that trust is checked:
 *
 * - CORS and CSRF (bun-app.ts, worker-app.ts)
 * - the WebAuthn expected origins (`rpFromRequest` in utils/webauthn-utils.ts)
 * - `/.well-known/webauthn` (routes/webauthn-related-origins.routes.ts), the
 *   WebAuthn "related origins" list. Without it a browser on inkweld.app
 *   refuses to use passkeys whose RP ID is this server's domain.
 *
 * The value is read on every request, so it is cached briefly; admin edits
 * clear the cache on the instance that saved them.
 */
import type { DatabaseInstance } from '../types/context';
import { configService } from './config.service';
import { logger } from './logger.service';

/** Origins the switch trusts. */
export const INKWELD_APP_CLIENT_ORIGINS: readonly string[] = ['https://inkweld.app'];

const CACHE_TTL_MS = 5_000;

let cache: { origins: readonly string[]; fetchedAt: number } | null = null;

/**
 * The extra origins to trust for this request: the hosted app's when the
 * switch is on, otherwise none. A config read failure trusts nothing extra.
 */
export async function getInkweldAppClientOrigins(
  db: DatabaseInstance | undefined
): Promise<readonly string[]> {
  if (!db) return [];
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.origins;

  try {
    const enabled = await configService.getBoolean(db, 'ALLOW_INKWELD_APP_CLIENT');
    cache = { origins: enabled ? INKWELD_APP_CLIENT_ORIGINS : [], fetchedAt: now };
    return cache.origins;
  } catch (err) {
    logger.warn('Config', 'Failed to read ALLOW_INKWELD_APP_CLIENT, not trusting inkweld.app', {
      err: String(err),
    });
    return [];
  }
}

/** Forget the cached value so the next request reads the config again. */
export function clearInkweldAppClientCache(): void {
  cache = null;
}
