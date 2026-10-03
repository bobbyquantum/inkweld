import { type Browser, type Page } from '@playwright/test';

import {
  canStartIsolatedBackend,
  type IsolatedBackend,
  startIsolatedBackend,
} from '../common/isolated-backend';
import { expect, test } from './fixtures';

/**
 * E2E coverage for sync capacity (per-user storage quotas): the header meter,
 * the over-capacity states, and the refusals a full account sees.
 *
 * SYNC_QUOTA_ENABLED is instance-wide and would refuse uploads in every
 * parallel spec using the shared backend, so this file starts a private
 * backend and points its own browser contexts at it.
 */

const PASSWORD = 'QuotaE2e-Passw0rd!';

let backend: IsolatedBackend;
let adminToken: string;

async function api(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {}
): Promise<Response> {
  return fetch(`${backend.url}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function login(username: string, password: string): Promise<string> {
  const res = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  expect(res.ok, `login ${username}`).toBe(true);
  return ((await res.json()) as { token: string }).token;
}

/** Register a user and return their id and token. */
async function createUser(
  username: string
): Promise<{ id: string; token: string }> {
  const res = await api('/api/v1/auth/register', {
    method: 'POST',
    body: { username, password: PASSWORD },
  });
  expect(res.ok, `register ${username}`).toBe(true);
  const token = await login(username, PASSWORD);
  const me = (await (await api('/api/v1/users/me', { token })).json()) as {
    id: string;
  };
  return { id: me.id, token };
}

async function setUserQuota(userId: string, bytes: number | null) {
  const res = await api(`/api/v1/admin/users/${userId}/quota`, {
    method: 'PATCH',
    body: { syncQuotaBytes: bytes },
    token: adminToken,
  });
  expect(res.ok, 'set user quota').toBe(true);
}

/** A fresh browser context, signed in to the private backend. */
async function openSignedIn(browser: Browser, username: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript((serverUrl: string) => {
    const now = Date.now();
    localStorage.setItem(
      'inkweld-app-config',
      JSON.stringify({
        version: 2,
        activeConfigId: 'server-1',
        configurations: [
          {
            id: 'server-1',
            type: 'server',
            displayName: 'Quota Test Server',
            serverUrl,
            addedAt: now,
            lastUsedAt: now,
          },
        ],
      })
    );
    localStorage.setItem('inkweld-tutorial-autostart', 'off');
  }, backend.url);

  await page.goto('/');
  await page.getByTestId('welcome-login-button').click();
  const dialog = page.getByTestId('login-dialog');
  await dialog.getByTestId('username-input').fill(username);
  await dialog.getByTestId('password-input').fill(PASSWORD);
  await dialog.getByTestId('login-button').click();
  await expect(page.getByTestId('user-menu-button')).toBeVisible();
  return page;
}

test.describe('Sync capacity (SYNC_QUOTA_ENABLED)', () => {
  // Skipped outside the online config: the instance-wide flag needs a private
  // Bun backend, which only that config can start.
  test.skip(
    !canStartIsolatedBackend(),
    'Needs a private Bun backend; only the online config can start one'
  );
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    backend = await startIsolatedBackend({
      SYNC_QUOTA_ENABLED: 'true',
      USER_APPROVAL_REQUIRED: 'false',
    });
    adminToken = await login(backend.admin.username, backend.admin.password);
  });

  test.afterAll(async () => {
    await backend?.stop();
  });

  test('the server refuses an upload past the allowance with QUOTA_EXCEEDED', async () => {
    const user = await createUser(`quota-api-${Date.now().toString(36)}`);
    const slug = 'quota-api-project';
    const created = await api('/api/v1/projects', {
      method: 'POST',
      body: { title: 'Quota API', slug },
      token: user.token,
    });
    expect(created.status).toBe(201);
    await setUserQuota(user.id, 0);

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(64)], { type: 'image/png' }),
      'x.png'
    );
    const me = (await (
      await api('/api/v1/users/me', { token: user.token })
    ).json()) as { username: string };
    const upload = await fetch(
      `${backend.url}/api/v1/media/${me.username}/${slug}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: form,
      }
    );

    expect(upload.status).toBe(403);
    const body = (await upload.json()) as { code: string; reason: string };
    expect(body.code).toBe('QUOTA_EXCEEDED');
    expect(body.reason).toBe('media_upload');
  });

  test('a user sees their meter, the full state, and a clear refusal', async ({
    browser,
  }) => {
    const username = `quota-ui-${Date.now().toString(36)}`;
    const user = await createUser(username);
    const page = await openSignedIn(browser, username);

    await test.step('the header meter shows usage against the allowance', async () => {
      const meter = page.getByTestId('storage-meter');
      await expect(meter).toBeVisible();
      await expect(meter).toContainText('100 MB');
      await expect(meter).not.toHaveClass(/over/);
    });

    await test.step('at a zero allowance the meter turns to the full state', async () => {
      await setUserQuota(user.id, 0);
      await page.reload();
      await expect(page.getByTestId('storage-meter')).toHaveClass(/over/);
    });

    await test.step('creating a project explains that capacity is full', async () => {
      await page.goto('/create-project');
      await page.getByTestId('next-button').click();
      await page.getByTestId('project-title-input').fill('Blocked Project');
      await page.getByTestId('project-slug-input').fill('blocked-project');
      await page.getByTestId('create-project-button').click();

      await expect(page.locator('mat-snack-bar-container')).toContainText(
        'sync capacity is full'
      );
      await expect(page).toHaveURL(/create-project/);
    });

    await test.step('restoring the default lets them create it', async () => {
      await setUserQuota(user.id, null);
      await page.getByTestId('create-project-button').click();
      await expect(page).toHaveURL(/blocked-project/);
    });

    await page.context().close();
  });
});
