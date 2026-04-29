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
 * Derive the WebAuthn RP config from the current Hono request context.
 *
 * Runtime-aware: reads secrets from `c.env` (Cloudflare Workers) or
 * `process.env` / the static `config` object (Bun).
 *
 * Security note: when `ALLOWED_ORIGINS` is `'*'` the function falls back to
 * the request `Origin` header in non-production environments. In production
 * it throws immediately so the misconfiguration surfaces loudly.
 */
export function rpFromContext(c: Context): PasskeyRpConfig {
  // Cloudflare Workers exposes secrets via c.env; Bun reads them from
  // process.env. Read both, preferring the request-scoped binding.
  const env = (c.env ?? undefined) as Record<string, string | undefined> | undefined;

  const rpId = env?.WEBAUTHN_RP_ID || config.webauthn.rpId;
  const rpName = env?.WEBAUTHN_RP_NAME || config.webauthn.rpName;

  // Origins — prefer ALLOWED_ORIGINS env (Workers / Bun process.env), fall
  // back to the parsed config. A non-empty but blank value (",", "  ") would
  // otherwise produce an empty origins array and fail every WebAuthn check,
  // so we explicitly fall back when the parsed list is empty too.
  const rawAllowedOrigins = env?.ALLOWED_ORIGINS ?? process.env['ALLOWED_ORIGINS'];
  const parsedOrigins = rawAllowedOrigins
    ? rawAllowedOrigins
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const configOrigins = parsedOrigins.length > 0 ? parsedOrigins : [...config.allowedOrigins];

  // WebAuthn requires an exact origin match — never silently trust the
  // client-supplied Origin header in production. If the operator left
  // ALLOWED_ORIGINS='*':
  //   - In production: throw so the misconfiguration surfaces immediately.
  //     Operators must set ALLOWED_ORIGINS to the explicit origin(s) users
  //     access the app from (e.g. "https://app.example.com").
  //   - In any other env (development, test, e2e): fall back to the request's
  //     Origin header so local dev and Docker e2e setups that legitimately
  //     use '*' to accept any port/host continue to work. The browser's
  //     same-origin enforcement on the WebAuthn API still binds credentials
  //     to the RP ID, so a forged server-side Origin alone is not exploitable.
  let origins: string[];
  if (configOrigins.includes('*')) {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(
        'ALLOWED_ORIGINS contains "*" which is not a valid WebAuthn expected ' +
          'origin in production. Configure ALLOWED_ORIGINS with an explicit ' +
          'comma-separated list of origins (e.g. "https://app.example.com").'
      );
    }
    const requestOrigin = c.req.header('origin');
    origins = requestOrigin ? [requestOrigin] : ['http://localhost'];
  } else {
    origins = configOrigins;
  }

  return { rpId, rpName, origins };
}
