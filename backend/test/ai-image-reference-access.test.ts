import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../src/db/index';
import { projects, users } from '../src/db/schema/index';
import { imageGenerationService } from '../src/services/image-generation.service';
import { imageProfileService } from '../src/services/image-profile.service';
import {
  enablePasswordLoginForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

/**
 * `POST /api/v1/ai/image/generate` loads reference images from the project
 * named by the free-form `projectKey` and forwards them to the image
 * provider. That project must be readable by the caller; previously any
 * authenticated user could name any `username/slug`.
 */
describe('AI image generation: reference-image project access', () => {
  let baseUrl: string;
  let owner: TestClient;
  let outsider: TestClient;
  const OWNER = 'aiimg-owner';
  const OUTSIDER = 'aiimg-outsider';
  const SLUG = 'aiimg-project';
  const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
  const spies: Array<ReturnType<typeof spyOn>> = [];

  const body = (projectKey: string) => ({
    prompt: 'a castle',
    profileId: PROFILE_ID,
    projectKey,
    worldbuildingContext: [
      { elementId: 'el-1', name: 'Castle', type: 'location', role: 'reference', data: {} },
    ],
  });

  beforeAll(async () => {
    ({ baseUrl } = await startTestServer());
    await enablePasswordLoginForTests();
    const db = getDatabase();
    for (const name of [OWNER, OUTSIDER]) {
      await db.delete(users).where(eq(users.username, name));
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: name,
        email: `${name}@example.com`,
        password: await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10),
        approved: true,
        enabled: true,
      });
    }
    owner = new TestClient(baseUrl);
    outsider = new TestClient(baseUrl);
    expect(await owner.login(OWNER, TEST_PASSWORDS.DEFAULT)).toBe(true);
    expect(await outsider.login(OUTSIDER, TEST_PASSWORDS.DEFAULT)).toBe(true);

    const created = await owner.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: SLUG, title: 'AI image project' }),
    });
    expect(created.response.status).toBe(201);

    // Get past the provider/profile checks that run before the access check.
    spies.push(spyOn(imageGenerationService, 'isAvailable').mockResolvedValue(true));
    spies.push(
      spyOn(imageProfileService, 'getById').mockResolvedValue({
        id: PROFILE_ID,
        enabled: true,
        provider: 'openai',
        modelId: 'gpt-image-1',
        modelConfig: null,
        defaultSize: null,
        supportedSizes: null,
        usesAspectRatioOnly: false,
      } as never)
    );
  });

  afterAll(async () => {
    for (const spy of spies) spy.mockRestore();
    const db = getDatabase();
    await db.delete(projects).where(eq(projects.slug, SLUG));
    for (const name of [OWNER, OUTSIDER]) {
      await db.delete(users).where(eq(users.username, name));
    }
    await stopTestServer();
  });

  it('rejects reference images from a project the caller cannot read', async () => {
    const { response } = await outsider.request('/api/v1/ai/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(`${OWNER}/${SLUG}`)),
    });
    expect(response.status).toBe(404);
  });

  it('rejects a projectKey that does not exist', async () => {
    const { response } = await owner.request('/api/v1/ai/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(`${OWNER}/no-such-project`)),
    });
    expect(response.status).toBe(404);
  });

  it('lets the owner through the access check', async () => {
    const { response } = await owner.request('/api/v1/ai/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(`${OWNER}/${SLUG}`)),
    });
    // Past the access check the request proceeds to reference-image loading
    // and the (unconfigured) provider; whatever that yields, it is not 404.
    expect(response.status).not.toBe(404);
  });
});
