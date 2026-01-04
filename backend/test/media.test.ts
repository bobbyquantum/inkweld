import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer, TestClient } from './server-test-helper';

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

    // Register and login
    await client.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email: 'media@example.com' }),
    });
    await client.login(username, password);

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
