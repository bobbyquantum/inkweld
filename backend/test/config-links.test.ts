/**
 * Integration tests for the legal-link fields exposed by
 * GET /api/v1/config/features (PRIVACY_POLICY_URL / TERMS_OF_SERVICE_URL)
 * and the admin-config plumbing behind them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { startTestServer, stopTestServer, TestClient } from './server-test-helper';
import { getDatabase } from '../src/db/index';
import { configService } from '../src/services/config.service';

interface FeaturesResponse {
  privacyPolicyUrl?: string;
  termsUrl?: string;
  [key: string]: unknown;
}

describe('config features – legal links', () => {
  let baseUrl: string;
  let anonClient: TestClient;

  beforeAll(async () => {
    const started = await startTestServer();
    baseUrl = started.baseUrl;
    anonClient = new TestClient(baseUrl);

    // Never let host environment variables leak into expectations.
    delete process.env.PRIVACY_POLICY_URL;
    delete process.env.TERMS_OF_SERVICE_URL;

    const db = getDatabase();
    await configService.delete(db, 'PRIVACY_POLICY_URL');
    await configService.delete(db, 'TERMS_OF_SERVICE_URL');
    await configService.set(db, 'CUSTOM_HEAD_HTML', '<meta name="t" content="1">');
    await configService.set(db, 'CUSTOM_BODY_HTML', '');
  });

  afterAll(async () => {
    const db = getDatabase();
    await configService.delete(db, 'PRIVACY_POLICY_URL');
    await configService.delete(db, 'TERMS_OF_SERVICE_URL');
    await configService.delete(db, 'CUSTOM_HEAD_HTML');
    await configService.delete(db, 'CUSTOM_BODY_HTML');
    await stopTestServer();
  });

  async function getFeatures(): Promise<FeaturesResponse> {
    const { response, json } = await anonClient.request('/api/v1/config/features');
    expect(response.status).toBe(200);
    return (await json()) as FeaturesResponse;
  }

  it('omits the legal link fields when nothing is configured', async () => {
    const features = await getFeatures();

    expect(features.privacyPolicyUrl).toBeUndefined();
    expect(features.termsUrl).toBeUndefined();
    // Custom HTML must never be exposed through the features payload —
    // it is injected server-side into index.html only.
    expect(features.customHeadHtml).toBeUndefined();
    expect(features.customBodyHtml).toBeUndefined();
  });

  it('exposes the configured links to anonymous clients', async () => {
    const db = getDatabase();
    await configService.set(db, 'PRIVACY_POLICY_URL', 'https://example.com/privacy');
    await configService.set(db, 'TERMS_OF_SERVICE_URL', 'https://example.com/terms');

    const features = await getFeatures();
    expect(features.privacyPolicyUrl).toBe('https://example.com/privacy');
    expect(features.termsUrl).toBe('https://example.com/terms');
  });

  it('omits a field when its value is blank', async () => {
    const db = getDatabase();
    await configService.set(db, 'TERMS_OF_SERVICE_URL', '   ');

    const features = await getFeatures();
    expect(features.privacyPolicyUrl).toBe('https://example.com/privacy');
    expect(features.termsUrl).toBeUndefined();
  });
});
