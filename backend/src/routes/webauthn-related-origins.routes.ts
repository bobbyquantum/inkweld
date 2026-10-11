/**
 * GET /.well-known/webauthn — WebAuthn "related origin requests".
 *
 * A browser only lets a page use passkeys whose RP ID is the page's own
 * domain (or a parent of it). When a page on another origin asks for this
 * server's RP ID, the browser fetches `https://<rp id>/.well-known/webauthn`
 * and allows the ceremony if the page's origin is listed in `origins`.
 *
 * Served only while ALLOW_INKWELD_APP_CLIENT is on, so the official
 * inkweld.app client (and the Android app) can sign in with passkeys
 * registered on this server. The browser fetches it from the RP ID's host,
 * so this only helps when that host is served by this backend.
 */
import { Hono } from 'hono';
import type { AppContext } from '../types/context';
import { getInkweldAppClientOrigins } from '../services/inkweld-app-client.service';

const webauthnRelatedOriginsRoutes = new Hono<AppContext>();

webauthnRelatedOriginsRoutes.get('/', async (c) => {
  const origins = await getInkweldAppClientOrigins(c.get('db'));
  if (origins.length === 0) {
    return c.json({ error: 'Not found' }, 404);
  }
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ origins: [...origins] });
});

export default webauthnRelatedOriginsRoutes;
