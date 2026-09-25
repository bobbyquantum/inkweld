/**
 * Integration tests for hosted legal documents and policy acceptance:
 * GET /api/v1/config/legal/{document}, the legal fields of
 * GET /api/v1/config/features, the acceptedPolicyVersion check at
 * registration, and /api/v1/users/me/policy-acceptance.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';

import {
  enablePasswordLoginForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { configService } from '../src/services/config.service';
import { computeLegalVersion } from '../src/services/legal.service';

const LEGAL_KEYS = [
  'PRIVACY_POLICY_CONTENT',
  'PRIVACY_POLICY_URL',
  'TERMS_OF_SERVICE_CONTENT',
  'TERMS_OF_SERVICE_URL',
  'REQUIRE_POLICY_ACCEPTANCE',
] as const;
const TEST_USERNAMES = ['legalnoaccept', 'legalaccepted', 'legalstale', 'legaloptional'];

interface Features {
  privacyPolicyUrl?: string;
  termsUrl?: string;
  hasPrivacyPolicy: boolean;
  hasTerms: boolean;
  policyVersion?: string;
  requirePolicyAcceptance: boolean;
}

interface AcceptanceStatus {
  required: boolean;
  currentVersion?: string;
  acceptedVersion: string | null;
  acceptedAt: number | null;
  needsAcceptance: boolean;
}

describe('legal documents and policy acceptance', () => {
  let baseUrl: string;
  let anon: TestClient;

  async function resetLegalConfig() {
    const db = getDatabase();
    for (const key of LEGAL_KEYS) {
      delete process.env[key];
      await configService.delete(db, key);
    }
  }

  async function features(): Promise<Features> {
    const { response, json } = await anon.request('/api/v1/config/features');
    expect(response.status).toBe(200);
    return (await json()) as Features;
  }

  /** The current policy version; fails the test if none is configured. */
  async function currentVersion(): Promise<string> {
    const { policyVersion } = await features();
    if (!policyVersion) throw new Error('expected a policy version');
    return policyVersion;
  }

  function register(username: string, acceptedPolicyVersion?: string) {
    return anon.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: TEST_PASSWORDS.E2E_ADMIN,
        email: `${username}@example.com`,
        acceptedPolicyVersion,
      }),
    });
  }

  async function loggedIn(username: string): Promise<TestClient> {
    const client = new TestClient(baseUrl);
    expect(await client.login(username, TEST_PASSWORDS.E2E_ADMIN)).toBe(true);
    return client;
  }

  beforeAll(async () => {
    const started = await startTestServer();
    baseUrl = started.baseUrl;
    anon = new TestClient(baseUrl);
    await enablePasswordLoginForTests();
    await getDatabase().delete(users).where(inArray(users.username, TEST_USERNAMES));
  });

  beforeEach(resetLegalConfig);

  afterAll(async () => {
    await resetLegalConfig();
    await getDatabase().delete(users).where(inArray(users.username, TEST_USERNAMES));
    await stopTestServer();
  });

  describe('computeLegalVersion', () => {
    it('is undefined when nothing is configured', async () => {
      expect(await computeLegalVersion({}, {})).toBeUndefined();
    });

    it('changes when either document changes', async () => {
      const a = await computeLegalVersion({ content: 'v1' }, {});
      const b = await computeLegalVersion({ content: 'v2' }, {});
      const c = await computeLegalVersion({ content: 'v1' }, { url: 'https://x.test/t' });
      expect(a).toMatch(/^[0-9a-f]{16}$/);
      expect(new Set([a, b, c]).size).toBe(3);
      expect(await computeLegalVersion({ content: 'v1' }, {})).toBe(a as string);
    });
  });

  describe('GET /api/v1/config/legal/{document}', () => {
    it('404s when the document is not configured', async () => {
      const { response } = await anon.request('/api/v1/config/legal/privacy');
      expect(response.status).toBe(404);
    });

    it('serves hosted content anonymously, preferring it over a URL', async () => {
      const db = getDatabase();
      await configService.set(db, 'PRIVACY_POLICY_CONTENT', '# Our policy\n\nHello.');
      await configService.set(db, 'PRIVACY_POLICY_URL', 'https://example.com/privacy');

      const { response, json } = await anon.request('/api/v1/config/legal/privacy');
      expect(response.status).toBe(200);
      const body = (await json()) as Record<string, string>;
      expect(body.content).toBe('# Our policy\n\nHello.');
      expect(body.url).toBeUndefined();
      expect(body.version).toBe(await currentVersion());

      // Terms are still unconfigured.
      expect((await anon.request('/api/v1/config/legal/terms')).response.status).toBe(404);
    });

    it('returns the external URL when no content is set', async () => {
      await configService.set(getDatabase(), 'TERMS_OF_SERVICE_URL', 'https://example.com/terms');
      const { json } = await anon.request('/api/v1/config/legal/terms');
      const body = (await json()) as Record<string, string>;
      expect(body.url).toBe('https://example.com/terms');
      expect(body.content).toBeUndefined();
    });

    it('rejects unknown documents', async () => {
      const { response } = await anon.request('/api/v1/config/legal/cookies');
      expect(response.status).toBe(400);
    });
  });

  describe('features payload', () => {
    it('reports nothing when unconfigured, even if acceptance is required', async () => {
      await configService.set(getDatabase(), 'REQUIRE_POLICY_ACCEPTANCE', 'true');
      const f = await features();
      expect(f.hasPrivacyPolicy).toBe(false);
      expect(f.hasTerms).toBe(false);
      expect(f.policyVersion).toBeUndefined();
      expect(f.requirePolicyAcceptance).toBe(false);
    });

    it('hides the external URL when hosted content is set', async () => {
      const db = getDatabase();
      await configService.set(db, 'PRIVACY_POLICY_CONTENT', 'Hosted');
      await configService.set(db, 'PRIVACY_POLICY_URL', 'https://example.com/privacy');
      await configService.set(db, 'TERMS_OF_SERVICE_URL', 'https://example.com/terms');
      const f = await features();
      expect(f.hasPrivacyPolicy).toBe(true);
      expect(f.privacyPolicyUrl).toBeUndefined();
      expect(f.hasTerms).toBe(true);
      expect(f.termsUrl).toBe('https://example.com/terms');
      expect(f.requirePolicyAcceptance).toBe(false);
    });
  });

  describe('registration and re-acceptance', () => {
    beforeEach(async () => {
      const db = getDatabase();
      await configService.set(db, 'PRIVACY_POLICY_CONTENT', 'Policy v1');
      await configService.set(db, 'REQUIRE_POLICY_ACCEPTANCE', 'true');
    });

    it('rejects registration without an accepted version', async () => {
      const { response, json } = await register('legalnoaccept');
      expect(response.status).toBe(400);
      expect(((await json()) as { error: string }).error).toContain('accept');
    });

    it('rejects registration with a stale version', async () => {
      const { response } = await register('legalstale', 'deadbeefdeadbeef');
      expect(response.status).toBe(400);
    });

    it('records the accepted version, then asks again after the policy changes', async () => {
      const version = await currentVersion();
      const { response } = await register('legalaccepted', version);
      expect(response.status).toBe(200);

      const row = await getDatabase()
        .select()
        .from(users)
        .where(eq(users.username, 'legalaccepted'))
        .get();
      expect(row?.policyAcceptedVersion).toBe(version);
      expect(row?.policyAcceptedAt).toBeGreaterThan(0);

      const client = await loggedIn('legalaccepted');
      let status = (await (
        await client.request('/api/v1/users/me/policy-acceptance')
      ).json()) as AcceptanceStatus;
      expect(status.needsAcceptance).toBe(false);

      await configService.set(getDatabase(), 'PRIVACY_POLICY_CONTENT', 'Policy v2');
      const newVersion = await currentVersion();
      expect(newVersion).not.toBe(version);

      status = (await (
        await client.request('/api/v1/users/me/policy-acceptance')
      ).json()) as AcceptanceStatus;
      expect(status).toMatchObject({
        required: true,
        currentVersion: newVersion,
        acceptedVersion: version,
        needsAcceptance: true,
      });

      // Accepting the old version is refused; the current one is recorded.
      const post = (v: string) =>
        client.request('/api/v1/users/me/policy-acceptance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: v }),
        });
      expect((await post(version)).response.status).toBe(400);
      const accepted = await post(newVersion);
      expect(accepted.response.status).toBe(200);
      expect(((await accepted.json()) as AcceptanceStatus).needsAcceptance).toBe(false);

      status = (await (
        await client.request('/api/v1/users/me/policy-acceptance')
      ).json()) as AcceptanceStatus;
      expect(status.needsAcceptance).toBe(false);
      expect(status.acceptedVersion).toBe(newVersion);
    });

    it('does not require acceptance when the setting is off', async () => {
      await configService.delete(getDatabase(), 'REQUIRE_POLICY_ACCEPTANCE');
      const { response } = await register('legaloptional');
      expect(response.status).toBe(200);
      const client = await loggedIn('legaloptional');
      const status = (await (
        await client.request('/api/v1/users/me/policy-acceptance')
      ).json()) as AcceptanceStatus;
      expect(status).toMatchObject({ required: false, needsAcceptance: false });
    });

    it('requires authentication for the acceptance endpoints', async () => {
      const { response } = await anon.request('/api/v1/users/me/policy-acceptance');
      expect(response.status).toBe(401);
    });
  });
});
