import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_MEDIA_UPLOAD_BYTES,
  rejectEmptyUpload,
  requireUploadedFile,
  sanitizeUploadFilename,
} from '../src/utils/upload';

describe('sanitizeUploadFilename', () => {
  it('keeps ordinary filenames intact', () => {
    expect(sanitizeUploadFilename('cover.jpg')).toBe('cover.jpg');
    expect(sanitizeUploadFilename('Chapter 1 (draft) [v2].md')).toBe('Chapter 1 (draft) [v2].md');
  });

  it('keeps only the last path segment for either separator', () => {
    expect(sanitizeUploadFilename('sub/dir/evil.png')).toBe('evil.png');
    expect(sanitizeUploadFilename('..\\..\\evil.png')).toBe('evil.png');
    expect(sanitizeUploadFilename('/absolute/path.png')).toBe('path.png');
  });

  it('never yields a traversal or hidden-file name', () => {
    expect(sanitizeUploadFilename('..')).toBeNull();
    expect(sanitizeUploadFilename('.')).toBeNull();
    expect(sanitizeUploadFilename('')).toBeNull();
    expect(sanitizeUploadFilename('///')).toBeNull();
    expect(sanitizeUploadFilename('.htaccess')).toBe('htaccess');
    expect(sanitizeUploadFilename('a..b.png')).toBe('a.b.png');
  });

  it('replaces characters outside the allow-list and strips control characters', () => {
    expect(sanitizeUploadFilename('we\u0000ird<>:"|?*.png')).toBe('weird_______.png');
  });

  it('truncates very long names but keeps the extension', () => {
    const name = sanitizeUploadFilename('x'.repeat(300) + '.jpeg');
    expect(name?.length).toBeLessThanOrEqual(200);
    expect(name?.endsWith('.jpeg')).toBe(true);
  });
});

describe('upload limits', () => {
  it('lets images be at least as large as validateImage accepts', () => {
    expect(MAX_IMAGE_UPLOAD_BYTES).toBeGreaterThanOrEqual(10 * 1024 * 1024);
  });
  it('allows media larger than images (video, audio)', () => {
    expect(MAX_MEDIA_UPLOAD_BYTES).toBeGreaterThan(MAX_IMAGE_UPLOAD_BYTES);
  });
});

describe('empty upload handling', () => {
  const app = new Hono();
  app.use('/upload', rejectEmptyUpload);
  app.post('/upload', async (c) => {
    const body = await c.req.parseBody();
    const file = requireUploadedFile(c, body['file'], 'Missing file');
    return c.json({ size: file.size });
  });
  app.on(['GET', 'DELETE'], '/upload', (c) => c.json({ ok: true }));
  app.onError((err, c) => c.json({ name: err.name, message: err.message }, 400));

  const send = (init: RequestInit) => app.request('http://localhost/upload', init);

  it('explains an upload whose body is empty', async () => {
    const res = await send({
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': '0' },
      body: '',
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { name: string; message: string };
    expect(data.name).toBe('BadRequestError');
    expect(data.message).toContain('The upload arrived empty');
  });

  it('leaves bodiless GET and DELETE requests alone', async () => {
    for (const method of ['GET', 'DELETE']) {
      const res = await send({ method, headers: { 'Content-Length': '0' } });
      expect(res.status).toBe(200);
    }
  });

  it('explains a zero-byte file', async () => {
    const form = new FormData();
    form.append('file', new Blob([], { type: 'image/png' }), 'empty.png');
    const res = await send({ method: 'POST', body: form });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toContain('The uploaded file is empty (0 bytes)');
  });

  it('uses the route message when the field is missing', async () => {
    const form = new FormData();
    form.append('other', 'value');
    const res = await send({ method: 'POST', body: form });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { message: string };
    expect(data.message).toBe('Missing file');
  });

  it('returns a non-empty file', async () => {
    const form = new FormData();
    form.append('file', new Blob(['abc'], { type: 'image/png' }), 'a.png');
    const res = await send({ method: 'POST', body: form });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { size: number }).size).toBe(3);
  });
});
