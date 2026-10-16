import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { configService } from '../src/services/config.service';
import { imageAuditService } from '../src/services/image-audit.service';
import { imageGenerationService } from '../src/services/image-generation.service';
import { imageProfileService } from '../src/services/image-profile.service';
import type { ResolvedImageRequest } from '../src/types/image-generation';
import {
  enablePasswordLoginForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

/**
 * Profiles store sizes in the provider's own format ("16:9@4K", "1:1@512sq",
 * "2.35:1"), so the generate endpoint must accept them and pass the profile's
 * aspect-ratio flag through to the provider.
 */
describe('AI image generation: size formats', () => {
  let client: TestClient;
  const USERNAME = 'aiimg-size-user';
  const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
  const spies: Array<ReturnType<typeof spyOn>> = [];
  let generate: ReturnType<typeof spyOn>;
  let supportedSizes: string[] = [];

  beforeAll(async () => {
    const { baseUrl } = await startTestServer();
    await enablePasswordLoginForTests();
    const db = getDatabase();
    await configService.set(db, 'AI_KILL_SWITCH', 'false');
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
    expect(await client.login(USERNAME, TEST_PASSWORDS.DEFAULT)).toBe(true);

    spies.push(spyOn(imageGenerationService, 'isAvailable').mockResolvedValue(true));
    // The mocked profile has no row for the audit log to reference.
    spies.push(spyOn(imageAuditService, 'create').mockResolvedValue(undefined as never));
    spies.push(
      spyOn(imageProfileService, 'getById').mockImplementation(
        async () =>
          ({
            id: PROFILE_ID,
            name: 'Scanned Fal model',
            enabled: true,
            provider: 'falai',
            modelId: 'google/nano-banana-2.1',
            modelConfig: null,
            defaultSize: supportedSizes[0] ?? null,
            supportedSizes,
            usesAspectRatioOnly: true,
            creditCost: 0,
          }) as never
      )
    );
    generate = spyOn(imageGenerationService, 'generate').mockImplementation(
      async (_db, request: ResolvedImageRequest) => ({
        created: 0,
        data: [{ url: 'https://example.com/out.png', index: 0 }],
        provider: 'falai',
        model: request.model,
        request: { prompt: request.prompt, size: request.size },
      })
    );
    spies.push(generate);
  });

  beforeEach(() => {
    generate.mockClear();
  });

  afterAll(async () => {
    for (const spy of spies) spy.mockRestore();
    const db = getDatabase();
    await configService.delete(db, 'AI_KILL_SWITCH');
    await db.delete(users).where(eq(users.username, USERNAME));
    await stopTestServer();
  });

  const post = (size: unknown) =>
    client.request('/api/v1/ai/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a lighthouse', profileId: PROFILE_ID, size }),
    });

  for (const size of ['16:9@4K', '1:1@512sq', '2.35:1', '1600x2560']) {
    it(`accepts ${size} when the profile supports it`, async () => {
      supportedSizes = [size];
      const { response } = await post(size);
      expect(response.status).toBe(200);
      const [, request] = generate.mock.calls[0] as [unknown, ResolvedImageRequest];
      expect(request.size).toBe(size);
      expect(request.usesAspectRatioOnly).toBe(true);
    });
  }

  it('rejects a size the profile does not list', async () => {
    supportedSizes = ['16:9@4K'];
    const { response } = await post('16:9@2K');
    expect(response.status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });

  for (const size of ['<img src=x>', '16:9@', '16:9@4K@2K', '1:1@4 K', '16x', '']) {
    it(`rejects ${JSON.stringify(size)}, which is not a size`, async () => {
      supportedSizes = [];
      const { response } = await post(size);
      expect(response.status).toBe(400);
      expect(generate).not.toHaveBeenCalled();
    });
  }
});
