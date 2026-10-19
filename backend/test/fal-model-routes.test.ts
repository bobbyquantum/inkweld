import { afterAll, afterEach, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import {
  enablePasswordLoginForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { TEST_PASSWORDS } from './test-credentials';

/**
 * The admin profile dialog lists Fal.ai models and then reads the picked
 * model's schema for its sizes. Requests to api.fal.ai are answered from
 * recorded fixtures; everything else goes to the test server.
 */
describe('Fal.ai model routes', () => {
  let client: TestClient;
  const USERNAME = 'falai-routes-user';
  const realFetch = globalThis.fetch;
  let falRequests: URL[] = [];
  let fetchSpy: ReturnType<typeof spyOn> | undefined;

  const nanoBanana = JSON.parse(
    readFileSync(
      join(import.meta.dir, 'fixtures', 'fal-models', 'google_nano-banana-2.1.json'),
      'utf8'
    )
  );

  function answerFal(handler: (url: URL) => unknown): void {
    falRequests = [];
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname !== 'api.fal.ai') return realFetch(input, init);
      falRequests.push(url);
      return new Response(JSON.stringify(handler(url)));
    });
  }

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
    expect(await client.login(USERNAME, TEST_PASSWORDS.DEFAULT)).toBe(true);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
  });

  afterAll(async () => {
    await getDatabase().delete(users).where(eq(users.username, USERNAME));
    await stopTestServer();
  });

  it('reads a model schema by an id containing slashes', async () => {
    answerFal(() => ({ models: [nanoBanana], has_more: false, next_cursor: null }));

    const { response, json } = await client.request(
      `/api/v1/ai/providers/falai/models/${encodeURIComponent('google/nano-banana-2.1')}/metadata`
    );

    expect(response.status).toBe(200);
    const body = (await json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      id: 'google/nano-banana-2.1',
      name: 'Nano Banana 2.1',
      sizeMode: 'aspect_ratio',
      usesAspectRatioOnly: true,
      defaultSize: '1:1@1K',
    });
    expect(body.supportedSizes).toContain('16:9@4K');
    expect(falRequests[0].searchParams.get('endpoint_id')).toBe('google/nano-banana-2.1');
  });

  it('lists models from every page in Fal order', async () => {
    const entry = (id: string) => ({
      endpoint_id: id,
      metadata: { display_name: id, category: 'image-to-image', description: '', status: 'active' },
    });
    answerFal((url) =>
      url.searchParams.get('cursor')
        ? { models: [entry('a/later-page')], has_more: false, next_cursor: null }
        : { models: [entry('z/popular'), entry('b/next')], has_more: true, next_cursor: 'Mg' }
    );

    const { response, json } = await client.request(
      '/api/v1/ai/providers/falai/models?category=image-to-image'
    );

    expect(response.status).toBe(200);
    const body = (await json()) as { models: Array<{ id: string }> };
    expect(body.models.map((m) => m.id)).toEqual(['z/popular', 'b/next', 'a/later-page']);
    expect(falRequests).toHaveLength(2);
  });
});
