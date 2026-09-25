import { type Browser, type Page } from '@playwright/test';

import {
  canStartIsolatedBackend,
  type IsolatedBackend,
  startIsolatedBackend,
} from '../common/isolated-backend';
import { expect, test } from './fixtures';

/**
 * E2E coverage for REQUIRE_POLICY_ACCEPTANCE: the registration checkbox, the
 * server-side check, and the blocking re-acceptance dialog after an edit.
 *
 * The flag is instance-wide and would break every parallel spec using the
 * shared backend, so this file starts a private backend and points its own
 * browser contexts at it.
 */

const PASSWORD = 'PolicyE2e-Passw0rd!';

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

async function setPolicyText(text: string): Promise<void> {
  const res = await api('/api/v1/admin/config/PRIVACY_POLICY_CONTENT', {
    method: 'PUT',
    body: { value: text },
    token: adminToken,
  });
  expect(res.ok, 'update policy text').toBe(true);
}

/** A fresh browser context whose app config points at the private backend. */
async function openApp(browser: Browser): Promise<Page> {
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
            displayName: 'Policy Test Server',
            serverUrl,
            addedAt: now,
            lastUsedAt: now,
          },
        ],
      })
    );
    localStorage.setItem('inkweld-tutorial-autostart', 'off');
  }, backend.url);
  return page;
}

test.describe('Policy acceptance (REQUIRE_POLICY_ACCEPTANCE)', () => {
  test.skip(
    !canStartIsolatedBackend(),
    'Needs a private Bun backend; only the online config can start one'
  );
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    backend = await startIsolatedBackend({
      PRIVACY_POLICY_CONTENT: '# Privacy v1\n\nThe first version.',
      TERMS_OF_SERVICE_CONTENT: '# Terms v1',
      REQUIRE_POLICY_ACCEPTANCE: 'true',
    });
    const login = await api('/api/v1/auth/login', {
      method: 'POST',
      body: backend.admin,
    });
    adminToken = ((await login.json()) as { token: string }).token;
  });

  test.afterAll(async () => {
    await backend?.stop();
  });

  test('the server rejects a registration that did not accept the policy', async () => {
    const res = await api('/api/v1/auth/register', {
      method: 'POST',
      body: { username: 'no-accept-user', password: PASSWORD },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain('accept');
  });

  test('a new user must tick the box, then is asked again after the policy changes', async ({
    browser,
  }) => {
    const page = await openApp(browser);
    const username = `policy-user-${Date.now().toString(36)}`;

    await test.step('register with the agreement checkbox', async () => {
      await page.goto('/');
      await page.getByTestId('welcome-register-button').click();
      const dialog = page.getByTestId('register-dialog');
      await expect(dialog.getByTestId('policy-acceptance')).toBeVisible();

      await dialog.getByTestId('username-input').fill(username);
      await dialog.getByTestId('password-input').fill(PASSWORD);
      await dialog.getByTestId('confirm-password-input').fill(PASSWORD);

      const submit = dialog.getByTestId('register-button');
      await expect(submit).toBeDisabled();
      await dialog
        .getByTestId('policy-accept-checkbox')
        .getByRole('checkbox')
        .check();
      await expect(submit).toBeEnabled();
      await submit.click();

      await expect(page.getByTestId('user-menu-button')).toBeVisible();
      await expect(page.getByTestId('policy-acceptance-dialog')).toHaveCount(0);
    });

    await test.step('after an edit, a reload blocks on the changed policy', async () => {
      await setPolicyText('# Privacy v2\n\nThe second version.');
      await page.reload();

      const prompt = page.getByTestId('policy-acceptance-dialog');
      await expect(prompt).toBeVisible();
      await expect(prompt).toContainText('Our policies have changed');

      // Escape must not dismiss it.
      await page.keyboard.press('Escape');
      await expect(prompt).toBeVisible();
    });

    await test.step('the user can read the new text without the prompt covering it', async () => {
      const [policyTab] = await Promise.all([
        page.context().waitForEvent('page'),
        page.getByTestId('policy-acceptance-privacy-link').click(),
      ]);
      await expect(
        policyTab.getByTestId('legal-content').locator('h1')
      ).toHaveText('Privacy v2');
      await expect(
        policyTab.getByTestId('policy-acceptance-dialog')
      ).toHaveCount(0);
      await policyTab.close();
    });

    await test.step('accepting records it on the server', async () => {
      await page.getByTestId('policy-acceptance-accept').click();
      await expect(page.getByTestId('policy-acceptance-dialog')).toHaveCount(0);

      await page.reload();
      await expect(page.getByTestId('user-menu-button')).toBeVisible();
      const token = await page.evaluate(() =>
        localStorage.getItem('srv:server-1:auth_token')
      );
      const status = (await (
        await api('/api/v1/users/me/policy-acceptance', {
          token: token ?? undefined,
        })
      ).json()) as { needsAcceptance: boolean };
      expect(status.needsAcceptance).toBe(false);
      await expect(page.getByTestId('policy-acceptance-dialog')).toHaveCount(0);
    });

    await test.step('declining a later change signs the user out', async () => {
      await setPolicyText('# Privacy v3');
      await page.reload();
      await expect(page.getByTestId('policy-acceptance-dialog')).toBeVisible();
      await page.getByTestId('policy-acceptance-decline').click();
      await expect(page.getByTestId('welcome-login-button')).toBeVisible();
    });

    await page.context().close();
  });

  test('an existing account that never accepted is asked on sign-in', async ({
    browser,
  }) => {
    // The bootstrapped admin was created without going through registration.
    const page = await openApp(browser);
    await page.goto('/');
    await page.getByTestId('welcome-login-button').click();
    const login = page.getByTestId('login-dialog');
    await login.getByTestId('username-input').fill(backend.admin.username);
    await login.getByTestId('password-input').fill(backend.admin.password);
    await login.getByTestId('login-button').click();

    const prompt = page.getByTestId('policy-acceptance-dialog');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('Please review our policies');
    await expect(
      prompt.getByTestId('policy-acceptance-terms-link')
    ).toBeVisible();
    await page.getByTestId('policy-acceptance-accept').click();
    await expect(prompt).toHaveCount(0);
    await expect(page.getByTestId('user-menu-button')).toBeVisible();

    await page.context().close();
  });
});
