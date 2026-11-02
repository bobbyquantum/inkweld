import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Database as BunDatabase } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import { join } from 'node:path';
import * as schema from '../src/db/schema';
import { users } from '../src/db/schema/users';
import { configService } from '../src/services/config.service';
import { oidcAuthService } from '../src/services/oidc-auth.service';
import { userService } from '../src/services/user.service';

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

describe('OIDC authentication service', () => {
  const sqlite = new BunDatabase(':memory:');
  const db = drizzle(sqlite, { schema });
  let issuerServer: ReturnType<typeof Bun.serve>;
  let issuer = '';
  let publishedIssuer: string | null = null;
  let authorizationParameters: URLSearchParams | null = null;
  let nonceOverride: string | null = null;
  let tokenRequests = 0;
  let discoveryRequests = 0;
  let discoveryUnavailable = false;
  let keyPair: CryptoKeyPair;
  let publicJwk: JsonWebKey & { kid: string; use: string };

  beforeAll(async () => {
    migrate(db, { migrationsFolder: join(import.meta.dir, '../drizzle') });
    keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
    publicJwk = {
      ...(await crypto.subtle.exportKey('jwk', keyPair.publicKey)),
      kid: 'oidc-test-key',
      alg: 'RS256',
      use: 'sig',
    };

    issuerServer = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === '/.well-known/openid-configuration') {
          discoveryRequests++;
          if (discoveryUnavailable) return new Response('Unavailable', { status: 503 });
          return Response.json({
            issuer: publishedIssuer ?? issuer,
            authorization_endpoint: `${issuer}authorize`,
            token_endpoint: `${issuer}token`,
            jwks_uri: `${issuer}jwks`,
            response_types_supported: ['code'],
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['RS256'],
            token_endpoint_auth_methods_supported: ['client_secret_post'],
          });
        }
        if (url.pathname === '/jwks') {
          return Response.json({ keys: [publicJwk] });
        }
        if (url.pathname === '/token' && request.method === 'POST') {
          const form = await request.formData();
          const verifier = form.get('code_verifier');
          const challenge = authorizationParameters?.get('code_challenge');
          if (typeof verifier !== 'string' || !authorizationParameters || !challenge) {
            return Response.json({ error: 'invalid_request' }, { status: 400 });
          }
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
          expect(base64Url(new Uint8Array(digest))).toBe(challenge);

          tokenRequests++;
          const now = Math.floor(Date.now() / 1000);
          const header = base64Url(
            JSON.stringify({ alg: 'RS256', kid: 'oidc-test-key', typ: 'JWT' })
          );
          const payload = base64Url(
            JSON.stringify({
              iss: publishedIssuer ?? issuer,
              sub: 'oidc-subject-1',
              aud: 'inkweld-test-client',
              exp: now + 300,
              iat: now,
              nonce: nonceOverride ?? authorizationParameters.get('nonce'),
              email: 'oidc-user@example.test',
              email_verified: true,
              preferred_username: 'oidc-user',
              name: 'OIDC User',
            })
          );
          const signed = `${header}.${payload}`;
          const signature = new Uint8Array(
            await crypto.subtle.sign(
              { name: 'RSASSA-PKCS1-v1_5' },
              keyPair.privateKey,
              new TextEncoder().encode(signed)
            )
          );
          return Response.json({
            access_token: 'oidc-test-access-token',
            token_type: 'Bearer',
            expires_in: 300,
            id_token: `${signed}.${base64Url(signature)}`,
          });
        }
        return new Response('Not found', { status: 404 });
      },
    });
    issuer = `http://127.0.0.1:${issuerServer.port}/`;

    await configService.set(db, 'OIDC_ISSUER_URL', issuer);
    await configService.set(db, 'OIDC_CLIENT_ID', 'inkweld-test-client');
    await configService.set(db, 'OIDC_CLIENT_SECRET', 'oidc-test-secret');
    await configService.set(db, 'OIDC_CALLBACK_URL', 'http://localhost:8333/api/v1/auth/oidc');
  });

  afterAll(async () => {
    await issuerServer.stop(true);
    sqlite.close();
  });

  it('uses discovery, state, nonce and PKCE, then consumes the authorization state once', async () => {
    const authorizationUrl = await oidcAuthService.createAuthorizationUrl(db);
    authorizationParameters = authorizationUrl.searchParams;
    const state = authorizationParameters.get('state');
    expect(state).toBeTruthy();
    expect(authorizationParameters.get('scope')).toContain('openid');
    expect(authorizationParameters.get('code_challenge_method')).toBe('S256');

    const callback = new URL('http://internal/api/v1/auth/oidc');
    callback.searchParams.set('code', 'one-time-code');
    callback.searchParams.set('state', state!);
    discoveryUnavailable = true;
    const result = await oidcAuthService.completeAuthorization(db, state!, callback);
    discoveryUnavailable = false;

    expect(result.issuer).toBe(issuer);
    expect(result.claims.sub).toBe('oidc-subject-1');
    expect(result.claims.email_verified).toBe(true);
    expect(tokenRequests).toBe(1);
    expect(discoveryRequests).toBe(1);
    await expect(oidcAuthService.completeAuthorization(db, state!, callback)).rejects.toThrow(
      'OIDC authorization state is invalid or expired'
    );
    expect(tokenRequests).toBe(1);
  });

  it('accepts a provider whose issuer has no trailing slash', async () => {
    // Pocket ID, Google and Authelia publish `https://id.example.com`, which
    // `new URL()` normalizes to a different string.
    publishedIssuer = issuer.slice(0, -1);
    await configService.set(db, 'OIDC_ISSUER_URL', publishedIssuer);
    // A different secret forces fresh discovery instead of the cached metadata.
    await configService.set(db, 'OIDC_CLIENT_SECRET', 'no-trailing-slash');
    try {
      const authorizationUrl = await oidcAuthService.createAuthorizationUrl(db);
      authorizationParameters = authorizationUrl.searchParams;
      const state = authorizationParameters.get('state')!;
      const callback = new URL('http://internal/api/v1/auth/oidc');
      callback.searchParams.set('code', 'one-time-code');
      callback.searchParams.set('state', state);

      const result = await oidcAuthService.completeAuthorization(db, state, callback);

      expect(result.issuer).toBe(publishedIssuer);
      expect(result.claims.iss).toBe(publishedIssuer);
    } finally {
      publishedIssuer = null;
      await configService.set(db, 'OIDC_ISSUER_URL', issuer);
      await configService.set(db, 'OIDC_CLIENT_SECRET', 'oidc-test-secret');
    }
  });

  it('invalidates cached discovery when client settings change', async () => {
    const before = discoveryRequests;
    await configService.set(db, 'OIDC_CLIENT_ID', 'changed-client');
    const url = await oidcAuthService.createAuthorizationUrl(db);
    expect(url.searchParams.get('client_id')).toBe('changed-client');
    expect(discoveryRequests).toBe(before + 1);
    await configService.set(db, 'OIDC_CLIENT_ID', 'inkweld-test-client');
  });

  it('refreshes discovery after ten minutes', async () => {
    await oidcAuthService.createAuthorizationUrl(db);
    const before = discoveryRequests;
    const now = Date.now();
    const clock = spyOn(Date, 'now').mockReturnValue(now + 10 * 60 * 1000 + 1);
    try {
      await oidcAuthService.createAuthorizationUrl(db);
      expect(discoveryRequests).toBe(before + 1);
    } finally {
      clock.mockRestore();
    }
  });

  it('purges expired authorization transactions even without a new sign-in', async () => {
    await db.insert(schema.oidcLoginTransactions).values({
      stateHash: 'expired',
      nonce: 'expired',
      codeVerifier: 'expired',
      expiresAt: Date.now() - 1,
    });
    await oidcAuthService.cleanupTransactions(db);
    const rows = await db
      .select()
      .from(schema.oidcLoginTransactions)
      .where(eq(schema.oidcLoginTransactions.stateHash, 'expired'));
    expect(rows).toHaveLength(0);
  });

  it('rejects missing and insecure OIDC settings before enabling OIDC-only', async () => {
    await expect(
      oidcAuthService.validateConfiguration(db, { OIDC_CLIENT_SECRET: '' })
    ).rejects.toThrow('are required');
    await expect(
      oidcAuthService.validateConfiguration(db, {
        OIDC_CALLBACK_URL: 'http://public.example/callback',
      })
    ).rejects.toThrow('must use HTTPS');
  });

  it('rejects a token with a mismatched nonce', async () => {
    const authorizationUrl = await oidcAuthService.createAuthorizationUrl(db);
    authorizationParameters = authorizationUrl.searchParams;
    const state = authorizationParameters.get('state')!;
    nonceOverride = 'wrong-nonce';
    const callback = new URL('http://internal/api/v1/auth/oidc');
    callback.searchParams.set('code', 'one-time-code');
    callback.searchParams.set('state', state);

    await expect(oidcAuthService.completeAuthorization(db, state, callback)).rejects.toThrow();
    nonceOverride = null;
  });

  it('maps accounts only by issuer and subject, never by email', async () => {
    const first = await userService.createOrUpdateOidcUser(
      db,
      {
        issuer,
        subject: 'subject-a',
        username: 'oidc-account-a',
        email: 'shared@example.test',
        emailVerified: true,
        name: 'First User',
      },
      { autoApprove: true }
    );
    const sameIdentity = await userService.createOrUpdateOidcUser(
      db,
      {
        issuer,
        subject: 'subject-a',
        username: 'ignored-username',
        email: 'updated@example.test',
        emailVerified: true,
        name: 'Updated User',
      },
      { autoApprove: true }
    );
    const sameEmail = await userService.createOrUpdateOidcUser(
      db,
      {
        issuer,
        subject: 'subject-b',
        username: 'oidc-account-b',
        email: 'shared@example.test',
        emailVerified: false,
        name: 'Second User',
      },
      { autoApprove: true }
    );

    expect(sameIdentity.id).toBe(first.id);
    expect(sameIdentity.name).toBe('Updated User');
    expect(sameEmail.id).not.toBe(first.id);
    expect(await userService.findByOidcIdentity(db, issuer, 'subject-b')).toMatchObject({
      id: sameEmail.id,
    });
    await Promise.all([
      userService.setUserAdminIfNoneExists(db, first.id),
      userService.setUserAdminIfNoneExists(db, sameEmail.id),
    ]);
    const adminCount = await db.$count(users, eq(users.isAdmin, true));
    expect(adminCount).toBe(1);
    await db.delete(users).where(eq(users.id, first.id));
    await db.delete(users).where(eq(users.id, sameEmail.id));
  });
});
