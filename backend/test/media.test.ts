import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';
import { getDatabase } from '../src/db/index';
import { users, projects } from '../src/db/schema/index';

describe('Media Routes', () => {
  let baseUrl: string;
  let client: TestClient;
  const username = 'mediauser';
  const password = 'password123';
  const slug = 'media-test-project';

  beforeAll(async () => {
    const server = await startTestServer();
    baseUrl = server.baseUrl;
    client = new TestClient(baseUrl);

    const db = getDatabase();

    // Clean up any existing test data
    await db.delete(projects).where(eq(projects.slug, slug));
    await db.delete(users).where(eq(users.username, username));

    // Create approved test user directly in database
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      id: crypto.randomUUID(),
      username,
      email: 'media@example.com',
      password: hashedPassword,
      approved: true,
      enabled: true,
    });

    // Login to get session
    const loggedIn = await client.login(username, password);
    expect(loggedIn).toBe(true);

    // Create a project
    await client.request('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Media Test Project', slug }),
    });
  });

  afterAll(async () => {
    await stopTestServer();
  });

  it('should upload an image successfully', async () => {
    const formData = new FormData();
    const blob = new Blob(['fake-image-content'], { type: 'image/png' });
    formData.append('file', blob, 'test-image.png');

    const { response, json } = await client.request(`/api/v1/media/${username}/${slug}`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(200);
    const data = (await json()) as { filename: string };
    expect(data.filename).toBe('test-image.png');
  });

  it('should upload a PDF successfully', async () => {
    const formData = new FormData();
    const blob = new Blob(['fake-pdf-content'], { type: 'application/pdf' });
    formData.append('file', blob, 'test-book.pdf');

    const { response, json } = await client.request(`/api/v1/media/${username}/${slug}`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(200);
    const data = (await json()) as { filename: string };
    expect(data.filename).toBe('test-book.pdf');
  });

  it('should upload an EPUB successfully', async () => {
    const formData = new FormData();
    const blob = new Blob(['fake-epub-content'], { type: 'application/epub+zip' });
    formData.append('file', blob, 'test-book.epub');

    const { response, json } = await client.request(`/api/v1/media/${username}/${slug}`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(200);
    const data = (await json()) as { filename: string };
    expect(data.filename).toBe('test-book.epub');
  });

  it('should upload a Markdown file successfully', async () => {
    const formData = new FormData();
    const blob = new Blob(['# Markdown content'], { type: 'text/markdown' });
    formData.append('file', blob, 'test-book.md');

    const { response, json } = await client.request(`/api/v1/media/${username}/${slug}`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(200);
    const data = (await json()) as { filename: string };
    expect(data.filename).toBe('test-book.md');
  });

  it('should list uploaded media including PDF and EPUB', async () => {
    const { response, json } = await client.request(`/api/v1/media/${username}/${slug}`);
    expect(response.status).toBe(200);
    const data = (await json()) as { items: Array<{ filename: string }> };

    const filenames = data.items.map((item) => item.filename);
    expect(filenames).toContain('test-image.png');
    expect(filenames).toContain('test-book.pdf');
    expect(filenames).toContain('test-book.epub');
    expect(filenames).toContain('test-book.md');
  });

  it('should reject unsupported file types', async () => {
    const formData = new FormData();
    const blob = new Blob(['fake-exe-content'], { type: 'application/x-msdownload' });
    formData.append('file', blob, 'test.exe');

    const { response } = await client.request(`/api/v1/media/${username}/${slug}`, {
      method: 'POST',
      body: formData,
    });

    expect(response.status).toBe(400);
  });
});
