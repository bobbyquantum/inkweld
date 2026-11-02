import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { configService } from '../src/services/config.service';
import { getDatabase } from '../src/db/index';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

describe('OIDC-only authentication mode', () => {
  let client: TestClient;

  beforeAll(async () => {
    const db = getDatabase();
    await configService.set(db, 'OIDC_ONLY', 'true');
    await configService.set(db, 'OIDC_ENABLED', 'false');
    await configService.set(db, 'GITHUB_ENABLED', 'true');
    await configService.set(db, 'PASSWORD_LOGIN_ENABLED', 'true');
    await configService.set(db, 'PASSKEYS_ENABLED', 'true');
    const server = await startTestServer();
    client = new TestClient(server.baseUrl);
  });

  afterAll(async () => {
    const db = getDatabase();
    await configService.delete(db, 'OIDC_ONLY');
    await configService.delete(db, 'OIDC_ENABLED');
    await configService.delete(db, 'GITHUB_ENABLED');
    await configService.delete(db, 'PASSWORD_LOGIN_ENABLED');
    await configService.delete(db, 'PASSKEYS_ENABLED');
    await stopTestServer();
  });

  it('exposes OIDC but hides other OAuth providers', async () => {
    const { json } = await client.request('/api/v1/auth/providers');
    expect(await json()).toEqual({ providers: { github: false, oidc: true } });
  });

  it('rejects password login and local registration', async () => {
    const login = await client.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'local-user', password: 'Password123!' }),
    });
    expect(login.response.status).toBe(403);

    const registration = await client.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'local-user', password: 'Password123!' }),
    });
    expect(registration.response.status).toBe(403);
  });

  it('rejects passkey, password-recovery, GitHub and ingress sign-in', async () => {
    const passkeys = await client.request('/api/v1/auth/passkeys');
    const passwordRecovery = await client.request('/api/v1/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.test' }),
    });
    const github = await client.request('/api/v1/auth/github', { redirect: 'manual' });
    const ingress = await client.request('/api/v1/auth/ingress', {
      method: 'POST',
    });

    expect(passkeys.response.status).toBe(403);
    expect(passwordRecovery.response.status).toBe(404);
    expect(github.response.status).toBe(403);
    expect(ingress.response.status).toBe(403);
  });
});
