import {
  expect,
  generateUniqueSlug,
  getApiBaseUrl,
  type Page,
  test,
} from './fixtures';

/**
 * Renaming a project (changing its slug) must take its server-side files
 * with it. Media and covers are stored under `<username>/<slug>/`: a
 * directory on Bun, R2 keys on Workers, where the rename used to leave them
 * behind under the old slug (and the cover endpoint then returned 404).
 * Runs under every online config, the wrangler one included.
 */

/** 1x1 transparent PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(() =>
    localStorage.getItem('srv:server-1:auth_token')
  );
  expect(token).toBeTruthy();
  return token!;
}

/**
 * Send a request from inside the page, as the app does: the backend's CSRF
 * check only accepts state-changing requests the browser marks as
 * same-origin or that come from an allowed Origin.
 */
async function send(
  page: Page,
  token: string,
  path: string,
  init: {
    method: string;
    json?: unknown;
    png?: { field: string; name: string };
  }
): Promise<{ status: number; text: string }> {
  return page.evaluate(
    async ({ url, auth, method, json, png, pngBase64 }) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${auth}`,
      };
      let body: BodyInit | undefined;
      if (png) {
        const form = new FormData();
        const bytes = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));
        form.append(
          png.field,
          new File([bytes], png.name, { type: 'image/png' })
        );
        body = form;
      } else if (json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(json);
      }
      const res = await fetch(url, { method, headers, body });
      return { status: res.status, text: await res.text() };
    },
    {
      url: `${getApiBaseUrl()}${path}`,
      auth: token,
      method: init.method,
      json: init.json,
      png: init.png,
      pngBase64: PNG_BASE64,
    }
  );
}

test.describe('Project rename storage', () => {
  test('media and the cover are readable under the new slug', async ({
    authenticatedPage: page,
  }) => {
    const token = await sessionToken(page);
    const username = page.testCredentials.username;
    const oldSlug = generateUniqueSlug('rename-from');
    const newSlug = generateUniqueSlug('rename-to');
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const base = getApiBaseUrl();

    const created = await send(page, token, '/api/v1/projects', {
      method: 'POST',
      json: { slug: oldSlug, title: 'Rename Storage' },
    });
    expect(created.status, created.text).toBe(201);

    const media = await send(
      page,
      token,
      `/api/v1/media/${username}/${oldSlug}`,
      {
        method: 'POST',
        png: { field: 'file', name: 'pixel.png' },
      }
    );
    expect(media.status, media.text).toBe(200);

    const cover = await send(
      page,
      token,
      `/api/v1/projects/${username}/${oldSlug}/cover`,
      { method: 'POST', png: { field: 'cover', name: 'cover.png' } }
    );
    expect(cover.status, cover.text).toBe(200);

    const renamed = await send(
      page,
      token,
      `/api/v1/projects/${username}/${oldSlug}`,
      { method: 'PUT', json: { slug: newSlug } }
    );
    expect(renamed.status, renamed.text).toBe(200);

    const mediaAfter = await page.request.get(
      `${base}/api/v1/media/${username}/${newSlug}/pixel.png`,
      auth
    );
    expect(mediaAfter.status()).toBe(200);
    expect(Buffer.from(await mediaAfter.body()).toString('base64')).toBe(
      PNG_BASE64
    );

    const coverAfter = await page.request.get(
      `${base}/api/v1/projects/${username}/${newSlug}/cover`,
      auth
    );
    expect(coverAfter.status()).toBe(200);
    expect((await coverAfter.body()).byteLength).toBeGreaterThan(0);

    // The old slug no longer holds the files, and redirects to the new one.
    const oldProject = await page.request.get(
      `${base}/api/v1/projects/${username}/${oldSlug}`,
      { ...auth, maxRedirects: 0 }
    );
    expect(oldProject.status()).toBe(301);
    expect(((await oldProject.json()) as { newSlug: string }).newSlug).toBe(
      newSlug
    );
  });
});
