/**
 * Global setup for Wrangler e2e tests
 *
 * Note: D1 database initialization now happens as part of the webServer command
 * in playwright.wrangler.config.ts, ensuring it runs BEFORE the server starts.
 * This globalSetup verifies the server is healthy and turns on AI auto-review
 * against the mock LLM server, so `auto-review.spec.ts` exercises the Worker's
 * review path (the Durable Object document round trip) instead of skipping it.
 * The returned teardown closes the mock server.
 */
import { type APIRequestContext, request } from '@playwright/test';

import {
  type MockLlmServer,
  startMockLlmServer,
  waitForMockLlm,
} from './common/mock-llm-server';
import { TEST_API_KEYS, TEST_PASSWORDS } from './common/test-credentials';

const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:9333';

async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  console.log('\n🔧 Wrangler E2E Global Setup');
  console.log('============================\n');

  let mockLlm: MockLlmServer | undefined;
  try {
    mockLlm = await startMockLlmServer();
    await waitForMockLlm(mockLlm);
    console.log(`   ✅ Mock LLM listening at ${mockLlm.url}\n`);
  } catch (err) {
    console.log(
      `   ⚠️  Could not start mock LLM server: ${String(err)}. Auto-review tests will be skipped gracefully.`
    );
  }

  // Verify backend health
  console.log('1️⃣  Verifying backend health...');
  const context = await request.newContext({ baseURL: API_BASE_URL });

  try {
    const healthResponse = await context.get('/api/v1/health');
    if (!healthResponse.ok()) {
      console.log(
        `   ⚠️  Backend health check failed: ${healthResponse.status()}`
      );
    } else {
      console.log('   ✅ Backend is healthy\n');
    }

    if (mockLlm) {
      console.log('2️⃣  Enabling AI auto-review against the mock LLM...');
      await enableAutoReview(context, mockLlm.url);
    }
  } finally {
    await context.dispose();
  }

  console.log('🔧 Wrangler setup complete\n');
  console.log('============================\n');

  const server = mockLlm;
  return server ? () => server.close() : undefined;
}

/**
 * Turn the AI kill switch off and AI text on, with a fake OpenAI key and the
 * provider endpoint pointed at the mock LLM. The online config does the same
 * with environment variables; Wrangler reads its vars from wrangler.toml, so
 * here it goes through the admin APIs. Image generation stays off.
 */
async function enableAutoReview(
  context: APIRequestContext,
  mockLlmUrl: string
): Promise<void> {
  const loginResponse = await context.post('/api/v1/auth/login', {
    data: { username: 'e2e-admin', password: TEST_PASSWORDS.ADMIN },
  });
  if (!loginResponse.ok()) {
    console.log(`   ⚠️  Admin login failed: ${loginResponse.status()}\n`);
    return;
  }
  const { token } = (await loginResponse.json()) as { token: string };
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const steps: Array<[string, string, Record<string, string>]> = [
    [
      'AI_KILL_SWITCH',
      '/api/v1/admin/config/AI_KILL_SWITCH',
      { value: 'false' },
    ],
    [
      'AI_TEXT_ENABLED',
      '/api/v1/admin/config/AI_TEXT_ENABLED',
      { value: 'true' },
    ],
    [
      'OpenAI key',
      '/api/v1/ai/providers/openai/key',
      { apiKey: TEST_API_KEYS.FAKE_OPENAI },
    ],
    [
      'OpenAI endpoint',
      '/api/v1/ai/providers/openai/endpoint',
      { endpoint: mockLlmUrl },
    ],
  ];
  const results = await Promise.all(
    steps.map(async ([label, path, data]) => {
      const response = await context.put(path, { headers, data });
      return response.ok()
        ? `   ✅ Set ${label}`
        : `   ⚠️  Could not set ${label}: ${response.status()}`;
    })
  );
  console.log(`${results.join('\n')}\n`);
}

export default globalSetup;
