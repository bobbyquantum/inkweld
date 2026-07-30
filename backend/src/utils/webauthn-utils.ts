/**
 * WebAuthn utility helpers shared across passkey route files.
 *
 * Extracted from passkey.routes.ts so that passkey-recovery.routes.ts
 * can import the RP-config resolver without creating a route→route dependency.
 */

import type { Context } from 'hono';
import type { PasskeyRpConfig } from '../services/passkey.service';
import { config } from '../config/env';

/**
 * Resolve the RP ID from environment, falling back to the static config, then
 * deriving from the first ALLOWED_ORIGINS entry when the env var is missing or
 * still set to the dev default ('localhost').  The derived fallback ensures
 * that even if the wrangler.toml is missing WEBAUTHN_RP_ID (e.g. after a
 * setup-script regeneration that dropped it), the RP ID is still correct as
 * long as ALLOWED_ORIGINS is set — which the setup script always injects.
 */
function resolveRpId(envRpId: string | undefined, configOrigins: string[]): string {
  const explicit = envRpId || config.webauthn.rpId;
  if (explicit && explicit !== 'localhost') return explicit;

  if (configOrigins.length === 0) return explicit;
  const firstOrigin = configOrigins[0];
  if (firstOrigin === '*') return explicit;

  try {
    const derived = new URL(firstOrigin).hostname;
    if (derived && derived !== 'localhost') return derived;
  } catch {
    // malformed origin — fall through to whatever we had
  }
  return explicit;
}

/**
 * Resolve the expected-origins list for WebAuthn verification.  When the
 * configured origins include '*' the behaviour depends on the environment:
 * production throws (misconfiguration must surface loudly), while dev/test
 * falls back to the request Origin header so local setups that legitimately
 * use '*' continue to work.
 */
function resolveOrigins(configOrigins: string[], requestOrigin: string | undefined): string[] {
  if (!configOrigins.includes('*')) return configOrigins;

  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'ALLOWED_ORIGINS contains "*" which is not a valid WebAuthn expected ' +
        'origin in production. Configure ALLOWED_ORIGINS with an explicit ' +
        'comma-separated list of origins (e.g. "https://app.example.com").'
    );
  }
  return requestOrigin ? [requestOrigin] : ['http://localhost'];
}

/**
 * Derive the WebAuthn RP config from the current Hono request context.
 *
 * Runtime-aware: reads secrets from `c.env` (Cloudflare Workers) or
 * `process.env` / the static `config` object (Bun).
 */
export function rpFromContext(c: Context): PasskeyRpConfig {
  const env = (c.env ?? undefined) as Record<string, string | undefined> | undefined;

  const rawAllowedOrigins = env?.ALLOWED_ORIGINS ?? process.env['ALLOWED_ORIGINS'];
  const parsedOrigins = rawAllowedOrigins
    ? rawAllowedOrigins
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const configOrigins = parsedOrigins.length > 0 ? parsedOrigins : [...config.allowedOrigins];

  const rpId = resolveRpId(env?.WEBAUTHN_RP_ID, configOrigins);
  const rpName = env?.WEBAUTHN_RP_NAME || config.webauthn.rpName;
  const origins = resolveOrigins(configOrigins, c.req.header('origin'));

  return { rpId, rpName, origins };
}
