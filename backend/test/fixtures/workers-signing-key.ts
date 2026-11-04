/**
 * Run by env-secret-guard.test.ts in a child process with an empty
 * environment, both as it is and bundled the way Wrangler bundles a Worker
 * (with a value written in for `process.env.NODE_ENV`). It makes the runtime
 * look like Cloudflare Workers before any Inkweld module loads (config/env.ts
 * checks once, at import), then prints, for each set of request bindings,
 * what every signing path does. Keys are never printed: each result is a
 * label or an error name.
 */
import type { Context } from 'hono';

const g = globalThis as Record<string, unknown>;
g.caches = {};
g.WebSocketPair = class {};

const { sign } = await import('hono/jwt');
const { config, DEV_FALLBACK_SECRET, SAMPLE_SECRETS } = await import('../../src/config/env');
const { signingSecret } = await import('../../src/config/signing-secret');
const { authService } = await import('../../src/services/auth.service');
const { mcpSigningSecret } = await import('../../src/mcp/mcp.auth');
const { mcpOAuthService } = await import('../../src/services/mcp-oauth.service');

const STRONG_SECRET = 'a-workers-secret-that-is-comfortably-over-32-chars';
const SAMPLE_SECRET = 'placeholder-set-via-wrangler-secret';

const SCENARIOS: Record<string, Record<string, string>> = {
  production: { NODE_ENV: 'production' },
  preview: { NODE_ENV: 'preview' },
  unset: {},
  development: { NODE_ENV: 'development' },
  test: { NODE_ENV: 'test' },
  shortDatabaseKey: {
    NODE_ENV: 'production',
    DATABASE_KEY: 'short',
    SESSION_SECRET: STRONG_SECRET,
  },
  shortDatabaseKeyOnly: { NODE_ENV: 'production', DATABASE_KEY: 'short' },
  sessionSecret: { NODE_ENV: 'production', SESSION_SECRET: STRONG_SECRET },
  sampleSecret: { NODE_ENV: 'production', SESSION_SECRET: SAMPLE_SECRET },
  sampleSecretUnset: { SESSION_SECRET: SAMPLE_SECRET },
  sampleSecretDevelopment: { NODE_ENV: 'development', SESSION_SECRET: SAMPLE_SECRET },
};

type Outcome = { value: unknown } | { error: string };

async function outcome(fn: () => unknown): Promise<Outcome> {
  try {
    return { value: await fn() };
  } catch (err) {
    return { error: (err as Error).name };
  }
}

function label(key: string): string {
  if (key === DEV_FALLBACK_SECRET) return 'development key';
  return SAMPLE_SECRETS.includes(key) ? 'sample key' : 'configured key';
}

function context(bindings: Record<string, string>, token?: string): Context {
  return {
    env: bindings,
    req: {
      header: (name: string) => (name === 'Authorization' && token ? `Bearer ${token}` : undefined),
    },
  } as unknown as Context;
}

const now = Math.floor(Date.now() / 1000);
const session = {
  userId: 'user-1',
  username: 'admin',
  email: '',
  scope: 'full',
  iat: now,
  exp: now + 600,
};
const accessToken = {
  sub: 'user-1',
  username: 'admin',
  session_id: 's-1',
  client_id: 'c-1',
  iat: now,
  exp: now + 600,
};
const devKeySession = await sign(session, DEV_FALLBACK_SECRET, 'HS256');
const sampleKeySession = await sign(session, SAMPLE_SECRET, 'HS256');
const configuredKeySession = await sign(session, STRONG_SECRET, 'HS256');
const devKeyAccessToken = await sign(accessToken, DEV_FALLBACK_SECRET, 'HS256');
const user = { id: 'user-1', username: 'admin' } as Parameters<typeof authService.createSession>[1];

async function sessionUser(bindings: Record<string, string>, token: string): Promise<unknown> {
  return (await authService.getSession(context(bindings, token)))?.userId ?? null;
}

const entries = await Promise.all(
  Object.entries(SCENARIOS).map(async ([name, bindings]) => [
    name,
    {
      signingSecret: await outcome(() => label(signingSecret(bindings))),
      createSession: await outcome(
        async () => typeof (await authService.createSession(context(bindings), user))
      ),
      devKeySession: await outcome(() => sessionUser(bindings, devKeySession)),
      sampleKeySession: await outcome(() => sessionUser(bindings, sampleKeySession)),
      configuredKeySession: await outcome(() => sessionUser(bindings, configuredKeySession)),
      mcpSigningSecret: await outcome(() => label(mcpSigningSecret(bindings))),
      mcpAccessToken: await outcome(
        async () =>
          (await mcpOAuthService.verifyAccessToken(devKeyAccessToken, bindings))?.sub ?? null
      ),
    },
  ])
);

console.log(
  JSON.stringify({
    processKeyIsDevelopmentKey: config.databaseKey === DEV_FALLBACK_SECRET,
    scenarios: Object.fromEntries(entries),
  })
);
