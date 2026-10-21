import type { CDPSession, Page } from '@playwright/test';

import {
  canStartIsolatedBackend,
  type IsolatedBackend,
  startIsolatedBackend,
} from '../common/isolated-backend';
import { createOfflineProject, expect, test } from './fixtures';

/**
 * Moving Browser projects to a passkey-only server (PASSWORD_LOGIN_ENABLED
 * off, the secure default). The move flow must offer passkey registration
 * and sign-in, and a failed sign-in must leave the Browser profile active.
 *
 * The shared online backend enables password login, so this file starts a
 * private backend with it off and points the move flow at it.
 */

let backend: IsolatedBackend;

interface StoredConfig {
  activeConfigId: string;
  configurations: Array<{
    id: string;
    type: string;
    serverUrl?: string;
    userProfile?: { username: string };
  }>;
}

async function readAppConfig(page: Page): Promise<StoredConfig> {
  return page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem('inkweld-app-config') ?? '{}'
      ) as StoredConfig
  );
}

async function attachVirtualAuthenticator(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}

/** Open the profile manager and start moving to the private backend */
async function startMoveToServer(page: Page): Promise<void> {
  await page.getByTestId('user-menu-button').click();
  await page.getByTestId('switch-server-button').click();
  await page.getByTestId('manage-profiles-button').click();
  await expect(page.getByTestId('profile-manager-title')).toBeVisible();

  await page.getByTestId('add-server-button').click();
  await page.getByTestId('new-server-url-input').fill(backend.url);
  await page.getByTestId('connect-server-button').click();
  await expect(page.getByTestId('migration-auth-section')).toBeVisible();
  await expect(page.getByTestId('migration-loading-features')).toHaveCount(0);
}

/** Pick everything, move it, and wait for the sync to finish */
async function migrateSelectedProjects(page: Page): Promise<void> {
  await expect(page.getByTestId('select-all-projects')).toBeVisible();
  await page.getByTestId('migrate-projects-button').click();
  await expect(page.getByTestId('sync-success')).toBeVisible({
    timeout: 30_000,
  });
  // The dialog reloads into the server profile on its own; let it finish
  // before navigating anywhere else
  await expect(page.getByTestId('profile-manager-title')).toBeHidden({
    timeout: 15_000,
  });
  await page.waitForLoadState('domcontentloaded');
}

/** The project exists on the private backend, read with the stored token */
async function expectProjectOnServer(
  page: Page,
  username: string,
  slug: string
): Promise<void> {
  const config = await readAppConfig(page);
  const profile = config.configurations.find(
    c => c.type === 'server' && c.userProfile?.username === username
  );
  expect(profile, 'server profile for the new account').toBeTruthy();
  const token = await page.evaluate(
    id => localStorage.getItem(`srv:${id}:auth_token`),
    profile!.id
  );
  expect(token).toBeTruthy();
  await expect
    .poll(async () => {
      const res = await fetch(
        `${backend.url}/api/v1/projects/${username}/${slug}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.status;
    })
    .toBe(200);
}

test.describe('Move projects to a passkey-only server', () => {
  test.skip(
    !canStartIsolatedBackend(),
    'Needs a private Bun backend; only the online config can start one'
  );
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    backend = await startIsolatedBackend({ PASSWORD_LOGIN_ENABLED: 'false' });
  });

  test.afterAll(async () => {
    await backend?.stop();
  });

  test('registers with a passkey, moves a project, then signs in with it to move another', async ({
    offlinePage: page,
  }) => {
    test.setTimeout(120_000);
    const username = `pk-mover-${Date.now().toString(36)}`;
    const cdp = await attachVirtualAuthenticator(page);

    try {
      await createOfflineProject(page, 'Passkey Novel', 'passkey-novel');
      await page.goto('/');

      await test.step('a failed passkey sign-in stays on the Browser profile', async () => {
        await startMoveToServer(page);
        await page.getByTestId('toggle-auth-mode-button').click();

        // Passkey-only: no password fields to sign in with
        await expect(page.getByTestId('migration-password-input')).toHaveCount(
          0
        );
        // The authenticator holds no passkey for this server yet, so the
        // ceremony fails after the server hands out a challenge
        const challenge = page.waitForResponse(r =>
          r.url().endsWith('/api/v1/auth/passkeys/login/start')
        );
        await page.getByTestId('migrate-passkey-login-button').click();
        await challenge;
        await expect(
          page.getByTestId('migrate-passkey-login-button')
        ).toBeEnabled();

        const config = await readAppConfig(page);
        expect(config.activeConfigId).toBe('local');
        expect(config.configurations.map(c => c.type)).toEqual(['local']);

        await page.getByTestId('migration-cancel-button').click();
        await page.keyboard.press('Escape');
      });

      await test.step('registers a new account with a passkey and moves the project', async () => {
        await startMoveToServer(page);

        await expect(
          page.getByTestId('migration-passkey-register-hint')
        ).toBeVisible();
        await expect(page.getByTestId('migration-password-input')).toHaveCount(
          0
        );
        await page.getByTestId('migration-username-input').fill(username);
        const register = page.getByTestId('migrate-authenticate-button');
        await expect(register).toContainText('Register with a passkey');
        await expect(register).toBeEnabled();
        await register.click();

        await expect(
          page.getByTestId('select-project-passkey-novel')
        ).toBeVisible();
        await migrateSelectedProjects(page);
        await expectProjectOnServer(page, username, 'passkey-novel');
      });

      await test.step('signs in with the passkey to move a second project', async () => {
        // Back to the Browser profile, which keeps working after the move
        await page.evaluate(() => {
          const config = JSON.parse(
            localStorage.getItem('inkweld-app-config') ?? '{}'
          ) as { activeConfigId: string };
          config.activeConfigId = 'local';
          localStorage.setItem('inkweld-app-config', JSON.stringify(config));
        });
        await page.goto('/');
        await createOfflineProject(page, 'Second Draft', 'second-draft');
        await page.goto('/');

        await startMoveToServer(page);
        await page.getByTestId('toggle-auth-mode-button').click();
        await page.getByTestId('migrate-passkey-login-button').click();

        await expect(
          page.getByTestId('select-project-second-draft')
        ).toBeVisible();
        await migrateSelectedProjects(page);
        await expectProjectOnServer(page, username, 'second-draft');

        // Signed in to the author's existing profile, not a duplicate
        const config = await readAppConfig(page);
        const serverProfiles = config.configurations.filter(
          c => c.type === 'server'
        );
        expect(serverProfiles).toHaveLength(1);
      });
    } finally {
      await cdp.detach().catch(() => {});
    }
  });
});
