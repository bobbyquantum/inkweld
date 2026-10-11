import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * APP_MODE is the admin's policy for which profiles people may add. It is
 * read from the server the app belongs to and must hold after first run:
 * on an ONLINE site, adding a profile from the user menu or the profile
 * manager never offers Browser or Cloud Sync, while profiles already on the
 * device keep working.
 *
 * APP_MODE is an environment variable, so instead of starting a backend per
 * mode these tests rewrite the `appMode` field of /config/features in the
 * browser. Everything else in the response comes from the real server.
 * The route is set on the context so it also catches requests the
 * production build's service worker makes on the page's behalf.
 */
async function serveAppMode(page: Page, appMode: string): Promise<void> {
  await page.context().route('**/api/v1/config/features', async route => {
    try {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({ response, json: { ...body, appMode } });
    } catch {
      // The build's apiUrl may point at a server that isn't running here;
      // answer for it so the policy is still known
      await route.fulfill({
        json: { appMode },
        headers: { 'access-control-allow-origin': '*' },
      });
    }
  });
}

async function openUserMenu(page: Page): Promise<void> {
  await page.getByTestId('user-menu-button').click();
}

test.describe('APP_MODE policy after first run', () => {
  test('an ONLINE site only lets a signed-in user add server profiles', async ({
    authenticatedPage: page,
  }) => {
    await serveAppMode(page, 'ONLINE');
    await page.reload();
    await expect(page.getByTestId('user-menu-button')).toBeVisible();

    // Profile manager: the restriction is explained, a server can be added
    await openUserMenu(page);
    await page.getByTestId('switch-server-button').click();
    await page.getByTestId('manage-profiles-button').click();
    await expect(page.getByTestId('profile-manager-title')).toBeVisible();
    await expect(page.getByTestId('app-mode-policy-note')).toContainText(
      'only allows server profiles'
    );
    await expect(page.getByTestId('add-server-button')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('profile-manager-title')).toBeHidden();

    // "Add profile" from the user menu goes straight to the server form
    await openUserMenu(page);
    await page.getByTestId('switch-server-button').click();
    await page.getByTestId('add-profile-button').click();
    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByTestId('server-url-input')).toBeVisible();
    await expect(page.getByTestId('local-mode-button')).toHaveCount(0);
    await expect(page.getByTestId('cloud-mode-button')).toHaveCount(0);
    await expect(page.getByTestId('app-mode-policy-note')).toContainText(
      'only allows server profiles'
    );

    // A deep link to the Browser step is ignored too
    await page.goto('/setup?mode=local');
    await expect(page.getByTestId('server-url-input')).toBeVisible();
    await expect(page.getByTestId('local-username-input')).toHaveCount(0);

    // Back returns to the app rather than to a mode picker
    await page.getByTestId('back-button').click();
    await expect(page).not.toHaveURL(/\/setup/);
    await expect(page.getByTestId('user-menu-button')).toBeVisible();
  });

  test('a Browser profile already on the device keeps working on an ONLINE site', async ({
    offlinePage: page,
  }) => {
    await serveAppMode(page, 'ONLINE');
    await page.reload();
    await expect(page.getByTestId('user-menu-button')).toBeVisible();

    // The profile is still usable. A Browser profile doesn't contact the
    // server by itself; the upgrade choices ask, and only a server is left.
    await openUserMenu(page);
    await page.getByTestId('upgrade-profile-menu-item').click();
    await expect(page.getByTestId('upgrade-view')).toBeVisible();
    await expect(page.getByTestId('upgrade-server-button')).toBeVisible();
    await expect(page.getByTestId('upgrade-cloud-button')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('upgrade-view')).toBeHidden();

    // From then on the menu words the upgrade for where it can go
    await openUserMenu(page);
    await expect(page.getByTestId('upgrade-profile-menu-item')).toContainText(
      'Move to a server'
    );

    // Adding another Browser profile is refused even by deep link
    await page.keyboard.press('Escape');
    await page.goto('/setup?mode=local');
    await expect(page.getByTestId('server-url-input')).toBeVisible();
    await expect(page.getByTestId('local-username-input')).toHaveCount(0);
  });
});
