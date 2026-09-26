import { TEST_PASSWORDS } from '../common/test-credentials';
import {
  createProject,
  expect,
  getApiBaseUrl,
  openUserSettings,
  type Page,
  test,
} from './fixtures';

/**
 * Self-service account deletion (required by Google Play for apps that allow
 * account creation): from Settings → Account, and from the public
 * /delete-account page the store listing links to.
 */

async function currentSession(
  page: Page
): Promise<{ token: string; username: string; id: string }> {
  const token = await page.evaluate(() =>
    localStorage.getItem('srv:server-1:auth_token')
  );
  expect(token).toBeTruthy();
  const response = await page.request.get(
    `${getApiBaseUrl()}/api/v1/users/me`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const me = (await response.json()) as { username: string; id: string };
  return { token: token!, username: me.username, id: me.id };
}

async function confirmDeletion(page: Page, username: string): Promise<void> {
  const dialog = page.getByTestId('confirmation-dialog');
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByTestId('confirm-delete-button');
  await expect(confirm).toBeDisabled();
  await dialog.getByTestId('confirm-dialog-input').fill(username);
  await confirm.click();
}

async function expectAccountGone(page: Page, token: string): Promise<void> {
  // Only the URL is checked here: the authenticatedPage fixture re-injects
  // the (now deleted) token on every load, and its 401 sends the app home.
  // The confirmation screen is covered by the anonymous test below.
  await page.waitForURL(/\/delete-account\?deleted=1/);
  const response = await page.request.get(
    `${getApiBaseUrl()}/api/v1/users/me`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(response.status()).toBe(401);
}

/** 1x1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

function api(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Documents in the server's copy of a project tree, read through the sync
 * manifest — LevelDB on Bun, the project's Durable Object on Workers — or -1
 * when the project cannot be read.
 */
async function countServerDocuments(
  page: Page,
  auth: string,
  username: string,
  slug: string
): Promise<number> {
  const res = await page.request.get(
    `${getApiBaseUrl()}/api/v1/projects/${username}/${slug}/docs/sync-manifest`,
    { headers: api(auth) }
  );
  if (!res.ok()) return -1;
  const { documents } = (await res.json()) as { documents: unknown[] };
  return documents.length;
}

/** IndexedDB databases this page's origin holds whose name mentions `text`. */
async function databasesMentioning(
  page: Page,
  text: string
): Promise<string[]> {
  return page.evaluate(async needle => {
    const all = await indexedDB.databases();
    return all.map(db => db.name ?? '').filter(name => name.includes(needle));
  }, text);
}

test.describe('Account deletion', () => {
  test('deletes the account from Settings → Account', async ({
    authenticatedPage: page,
  }) => {
    const { token, username } = await currentSession(page);

    await openUserSettings(page);
    const section = page.getByTestId('delete-account-section');
    await section.scrollIntoViewIfNeeded();
    await section.getByTestId('delete-account-button').click();
    await confirmDeletion(page, username);

    await expectAccountGone(page, token);
  });

  test('deletes the account from the public /delete-account page', async ({
    authenticatedPage: page,
  }) => {
    const { token, username } = await currentSession(page);

    await page.goto('/delete-account');
    await page.getByTestId('delete-account-button').click();
    await confirmDeletion(page, username);

    await expectAccountGone(page, token);
  });

  test('removes owned projects, their documents and media, on the server and the device', async ({
    authenticatedPage: page,
  }) => {
    const { token, username } = await currentSession(page);
    const slug = `doomed-${Date.now().toString(36)}`;
    const base = getApiBaseUrl();

    // A project with Yjs content (opened in the editor, so it is cached on
    // the device too) and an uploaded media file. The sync manifest lists the
    // documents in the server's copy of the project tree on both runtimes:
    // LevelDB on Bun, the project's Durable Object on Workers.
    const serverDocuments = (auth: string) =>
      countServerDocuments(page, auth, username, slug);
    await createProject(page, 'Doomed Project', slug);
    await expect.poll(() => serverDocuments(token)).toBeGreaterThan(0);
    // Uploaded from inside the page, as the app does: the backend's CSRF
    // check (enforced outside the test env, e.g. in the Docker image) only
    // accepts form uploads the browser marks as same-origin or that come from
    // an allowed Origin, and Playwright's API client can do neither.
    const upload = await page.evaluate(
      async ({ url, auth, png }) => {
        const body = new FormData();
        const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
        body.append(
          'file',
          new File([bytes], 'pixel.png', { type: 'image/png' })
        );
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${auth}` },
          body,
        });
        return { status: res.status, text: await res.text() };
      },
      {
        url: `${base}/api/v1/media/${username}/${slug}`,
        auth: token,
        png: PNG.toString('base64'),
      }
    );
    expect(upload.status, upload.text).toBe(200);
    const mediaUrl = `${base}/api/v1/media/${username}/${slug}/pixel.png`;
    expect(
      (await page.request.get(mediaUrl, { headers: api(token) })).ok()
    ).toBe(true);
    await expect
      .poll(() => databasesMentioning(page, slug))
      .not.toHaveLength(0);

    await page.goto('/delete-account');
    await page.getByTestId('delete-account-button').click();
    await confirmDeletion(page, username);
    await expectAccountGone(page, token);

    // Nothing of the project is left cached on this device.
    await expect.poll(() => databasesMentioning(page, slug)).toHaveLength(0);

    // Re-register the same username and re-create the same slug: nothing
    // must come back from storage, the Yjs store or the Durable Object.
    const register = await page.request.post(`${base}/api/v1/auth/register`, {
      data: { username, password: TEST_PASSWORDS.USER },
    });
    expect(register.ok()).toBe(true);
    const fresh = ((await register.json()) as { token: string }).token;
    const recreate = await page.request.post(`${base}/api/v1/projects`, {
      headers: api(fresh),
      data: { slug, title: 'Fresh start' },
    });
    expect(recreate.status()).toBe(201);
    expect(
      (await page.request.get(mediaUrl, { headers: api(fresh) })).status()
    ).toBe(404);
    expect(await serverDocuments(fresh)).toBe(0);
  });

  test("admin deletion also wipes the user's projects on the server", async ({
    authenticatedPage: page,
    adminPage,
  }) => {
    const { token, username, id } = await currentSession(page);
    const slug = `admin-doomed-${Date.now().toString(36)}`;
    const base = getApiBaseUrl();
    await createProject(page, 'Doomed By Admin', slug);
    await expect
      .poll(() => countServerDocuments(page, token, username, slug))
      .toBeGreaterThan(0);

    const adminToken = await adminPage.evaluate(() =>
      localStorage.getItem('srv:server-1:auth_token')
    );
    const removed = await adminPage.request.delete(
      `${base}/api/v1/admin/users/${id}`,
      // A body-less request counts as a form post to the CSRF check.
      { headers: { ...api(adminToken!), 'Content-Type': 'application/json' } }
    );
    expect(removed.status(), await removed.text()).toBe(200);

    // Same username, same slug: the old project must not come back (on
    // Workers this is the Durable Object named after username:slug).
    const register = await page.request.post(`${base}/api/v1/auth/register`, {
      data: { username, password: TEST_PASSWORDS.USER },
    });
    expect(register.ok()).toBe(true);
    const fresh = ((await register.json()) as { token: string }).token;
    const recreate = await page.request.post(`${base}/api/v1/projects`, {
      headers: api(fresh),
      data: { slug, title: 'Fresh start' },
    });
    expect(recreate.status()).toBe(201);
    expect(await countServerDocuments(page, fresh, username, slug)).toBe(0);
  });

  test('confirms the deletion once the flow lands back on the page', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/delete-account?deleted=1');

    await expect(page.getByTestId('delete-account-done')).toBeVisible();
  });

  test('asks signed-out visitors to sign in first', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/delete-account');

    await expect(page.getByTestId('delete-account-sign-in')).toBeVisible();
    await expect(page.getByTestId('delete-account-section')).toHaveCount(0);
  });
});
