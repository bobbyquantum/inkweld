/**
 * AI kill switch enforcement
 *
 * With AI_KILL_SWITCH on, every endpoint that sends content to an AI provider
 * must answer 403 `AI_DISABLED` even when a provider key is configured — the
 * frontend hiding the feature is not enough. Configuration endpoints stay
 * open so an admin can set AI up before turning the switch off.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { config as envConfig } from '../src/config/env';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { configService } from '../src/services/config.service';
import { imageGenerationService } from '../src/services/image-generation.service';
import { imageProfileService } from '../src/services/image-profile.service';
import {
  AI_DISABLED_CODE,
  isAiKillSwitchOn,
  resolveAiKillSwitch,
} from '../src/utils/ai-kill-switch';
import type { ConfigKey } from '../src/db/schema/config';
import {
  enablePasswordLoginForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { TEST_API_KEYS, TEST_PASSWORDS } from './test-credentials';

const USERNAME = 'aikillswitch-user';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';

/** Provider configuration that would make AI work if the switch were off. */
const AI_CONFIG: Partial<Record<ConfigKey, string>> = {
  AI_OPENAI_API_KEY: TEST_API_KEYS.OPENAI,
  AI_IMAGE_ENABLED: 'true',
  AI_IMAGE_OPENAI_ENABLED: 'true',
  AI_TEXT_ENABLED: 'true',
  AI_TEXT_OPENAI_ENABLED: 'true',
  AI_LINT_ENABLED: 'true',
};

const mutableKillSwitch = envConfig.aiKillSwitch as { enabled: boolean; lockedByEnv: boolean };
const originalKillSwitch = { ...mutableKillSwitch };

describe('AI kill switch', () => {
  let client: TestClient;
  let anonymous: TestClient;
  const spies: Array<ReturnType<typeof spyOn>> = [];
  let generateSpy: ReturnType<typeof spyOn>;

  const imageBody = JSON.stringify({ prompt: 'a castle', profileId: PROFILE_ID });
  const json = { 'Content-Type': 'application/json' };

  /** Every AI endpoint that must be blocked while the switch is on. */
  const aiEndpoints: Array<{ name: string; path: string; init?: RequestInit }> = [
    {
      name: 'image generation',
      path: '/api/v1/ai/image/generate',
      init: { method: 'POST', headers: json, body: imageBody },
    },
    {
      name: 'streaming image generation',
      path: '/api/v1/ai/image/generate-stream',
      init: { method: 'POST', headers: json, body: imageBody },
    },
    { name: 'image provider status', path: '/api/v1/ai/image/status' },
    {
      name: 'image prompt optimisation',
      path: '/api/v1/ai/text/optimize-image-prompt',
      init: { method: 'POST', headers: json, body: JSON.stringify({ rawInput: 'a castle' }) },
    },
    { name: 'text provider status', path: '/api/v1/ai/text/status' },
    {
      name: 'paragraph lint',
      path: '/api/v1/ai/lint',
      init: {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ paragraph: 'Some text.', style: 'default', level: 'low' }),
      },
    },
    {
      name: 'document auto-review',
      path: `/api/v1/projects/${USERNAME}/any-project/docs/doc-1/auto-review/review`,
      init: {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ style: 'default', level: 'low' }),
      },
    },
  ];

  const setKillSwitch = (value: 'true' | 'false') =>
    configService.set(getDatabase(), 'AI_KILL_SWITCH', value);

  beforeAll(async () => {
    const { baseUrl } = await startTestServer();
    await enablePasswordLoginForTests();
    const db = getDatabase();

    await db.delete(users).where(eq(users.username, USERNAME));
    await db.insert(users).values({
      id: crypto.randomUUID(),
      username: USERNAME,
      email: `${USERNAME}@example.com`,
      password: await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10),
      approved: true,
      enabled: true,
    });
    client = new TestClient(baseUrl);
    anonymous = new TestClient(baseUrl);
    expect(await client.login(USERNAME, TEST_PASSWORDS.DEFAULT)).toBe(true);

    for (const [key, value] of Object.entries(AI_CONFIG)) {
      await configService.set(db, key as ConfigKey, value);
    }

    // Never reach a real provider: report one as available and fake the result.
    spies.push(spyOn(imageGenerationService, 'isAvailable').mockResolvedValue(true));
    spies.push(
      spyOn(imageProfileService, 'getById').mockResolvedValue({
        id: PROFILE_ID,
        name: 'Test profile',
        enabled: true,
        provider: 'openai',
        modelId: 'gpt-image-1',
        modelConfig: null,
        defaultSize: null,
        supportedSizes: null,
        usesAspectRatioOnly: false,
        creditCost: 1,
      } as never)
    );
    generateSpy = spyOn(imageGenerationService, 'generate').mockResolvedValue({
      created: 0,
      data: [{ b64Json: 'AAAA', index: 0 }],
      provider: 'openai',
      model: 'gpt-image-1',
    } as never);
    spies.push(generateSpy);
  });

  afterEach(() => {
    mutableKillSwitch.enabled = originalKillSwitch.enabled;
    mutableKillSwitch.lockedByEnv = originalKillSwitch.lockedByEnv;
    generateSpy.mockClear();
  });

  afterAll(async () => {
    for (const spy of spies) spy.mockRestore();
    const db = getDatabase();
    await configService.delete(db, 'AI_KILL_SWITCH');
    for (const key of Object.keys(AI_CONFIG)) {
      await configService.delete(db, key as ConfigKey);
    }
    await db.delete(users).where(eq(users.username, USERNAME));
    await stopTestServer();
  });

  describe('when on', () => {
    beforeAll(() => setKillSwitch('true'));

    for (const endpoint of aiEndpoints) {
      it(`blocks ${endpoint.name} with 403 AI_DISABLED`, async () => {
        const { response, json: readJson } = await client.request(endpoint.path, endpoint.init);
        const body = await readJson();
        expect(response.status).toBe(403);
        expect(body).toMatchObject({ code: AI_DISABLED_CODE });
        expect((body as { error: string }).error).toContain('AI kill switch');
      });
    }

    it('never calls the image provider', async () => {
      await client.request('/api/v1/ai/image/generate', {
        method: 'POST',
        headers: json,
        body: imageBody,
      });
      expect(generateSpy).not.toHaveBeenCalled();
    });

    it('still requires authentication first', async () => {
      const { response } = await anonymous.request('/api/v1/ai/image/generate', {
        method: 'POST',
        headers: json,
        body: imageBody,
      });
      expect(response.status).toBe(401);
    });

    it('leaves configuration endpoints and the lint status probe open', async () => {
      const sizes = await client.request('/api/v1/ai/image/custom-sizes');
      expect(sizes.response.status).toBe(200);
      const models = await client.request('/api/v1/ai/text/default-models');
      expect(models.response.status).toBe(200);
      const lintStatus = await client.request('/api/v1/ai/lint/status');
      expect(lintStatus.response.status).toBe(200);
      expect(await lintStatus.json()).toMatchObject({ enabled: false });
    });

    it('reports AI as unavailable in the public feature flags', async () => {
      const { json: readJson } = await anonymous.request('/api/v1/config/features');
      expect(await readJson()).toMatchObject({ aiKillSwitch: true, aiImageGeneration: false });
    });
  });

  describe('when off', () => {
    beforeAll(() => setKillSwitch('false'));

    it('generates images', async () => {
      const { response } = await client.request('/api/v1/ai/image/generate', {
        method: 'POST',
        headers: json,
        body: imageBody,
      });
      expect(response.status).toBe(200);
      expect(generateSpy).toHaveBeenCalledTimes(1);
    });

    it('serves provider status', async () => {
      const image = await client.request('/api/v1/ai/image/status');
      expect(image.response.status).toBe(200);
      const text = await client.request('/api/v1/ai/text/status');
      expect(text.response.status).toBe(200);
    });

    it('lets text requests reach their own availability checks', async () => {
      await configService.set(getDatabase(), 'AI_TEXT_ENABLED', 'false');
      try {
        const { response, json: readJson } = await client.request(
          '/api/v1/ai/text/optimize-image-prompt',
          { method: 'POST', headers: json, body: JSON.stringify({ rawInput: 'a castle' }) }
        );
        const body = await readJson();
        // Past the kill switch the handler's own "text generation disabled"
        // check answers, not the kill switch.
        expect(response.status).toBe(503);
        expect(body).not.toMatchObject({ code: AI_DISABLED_CODE });
      } finally {
        await configService.set(getDatabase(), 'AI_TEXT_ENABLED', 'true');
      }
    });

    it('is overridden by an environment lock that turns it on', async () => {
      mutableKillSwitch.lockedByEnv = true;
      mutableKillSwitch.enabled = true;
      const { response, json: readJson } = await client.request('/api/v1/ai/image/generate', {
        method: 'POST',
        headers: json,
        body: imageBody,
      });
      expect(response.status).toBe(403);
      expect(await readJson()).toMatchObject({ code: AI_DISABLED_CODE });
      expect(generateSpy).not.toHaveBeenCalled();
    });
  });

  describe('effective state', () => {
    it('follows the stored value when not locked by env', async () => {
      mutableKillSwitch.lockedByEnv = false;
      const db = getDatabase();
      await setKillSwitch('true');
      expect(await isAiKillSwitchOn(db)).toBe(true);
      await setKillSwitch('false');
      expect(await isAiKillSwitchOn(db)).toBe(false);
    });

    it('defaults to on when nothing is stored', async () => {
      mutableKillSwitch.lockedByEnv = false;
      const db = getDatabase();
      await configService.delete(db, 'AI_KILL_SWITCH');
      expect(await isAiKillSwitchOn(db)).toBe(true);
    });

    it('uses the env value when locked, whatever is stored', async () => {
      const db = getDatabase();
      mutableKillSwitch.lockedByEnv = true;

      mutableKillSwitch.enabled = false;
      await setKillSwitch('true');
      expect(await isAiKillSwitchOn(db)).toBe(false);
      expect(resolveAiKillSwitch('true')).toBe(false);

      mutableKillSwitch.enabled = true;
      await setKillSwitch('false');
      expect(await isAiKillSwitchOn(db)).toBe(true);
      expect(resolveAiKillSwitch('false')).toBe(true);
    });

    it('accepts "1" as on', () => {
      mutableKillSwitch.lockedByEnv = false;
      expect(resolveAiKillSwitch('1')).toBe(true);
      expect(resolveAiKillSwitch('0')).toBe(false);
    });
  });
});
