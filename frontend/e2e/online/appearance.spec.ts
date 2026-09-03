import { type Page, request as playwrightRequest } from '@playwright/test';

import { TEST_PASSWORDS } from '../common/test-credentials';
import { expect, getApiBaseUrl, test } from './fixtures';

/**
 * Appearance / customizable backgrounds.
 *
 * Covers the whole chain the feature is made of: an admin uploads a branding
 * image, an anonymous visitor sees it on the login surface, and a signed-in
 * user overrides it for their own post-auth pages — plus the admin switch that
 * takes that ability away again.
 *
 * These tests mutate server-wide config, so they run serially and restore every
 * setting they touch.
 */

/** A small solid-colour PNG, generated in-page so no fixture file is needed. */
async function makeBackgroundPng(page: Page, colour: string): Promise<Buffer> {
  const dataUrl = await page.evaluate(hex => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 640, 360);
    return canvas.toDataURL('image/png');
  }, colour);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Navigate to the admin Appearance page via the nav, and wait for it to load. */
async function gotoAppearance(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  await page.locator('[data-testid="admin-menu-link"]').click();
  await page.waitForURL('**/admin/**');
  await page.locator('[data-testid="admin-nav-appearance"]').click();
  await page.waitForURL('**/admin/appearance');
  await expect(page.getByTestId('appearance-container')).toBeVisible();
  await expect(page.getByTestId('appearance-loading')).toBeHidden();
}

/**
 * The `--app-bg-image` custom property the BackgroundService writes to the root
 * element. This is what every hero surface resolves its image from.
 */
async function backgroundVar(page: Page): Promise<string> {
  return await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--app-bg-image')
      .trim()
  );
}

/** The background actually painted on the home/login surface. */
async function paintedBackground(page: Page): Promise<string> {
  const container = page.getByTestId('home-content-container');
  await expect(container).toBeVisible();
  return await container.evaluate(
    element => getComputedStyle(element).backgroundImage
  );
}

/** Open the user settings dialog on the Account tab. */
async function openAccountSettings(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  await page.getByRole('menuitem', { name: /settings/i }).click();
  await expect(page.getByTestId('account-settings')).toBeVisible();
}

/**
 * Put the server-side appearance state back to its defaults through the API.
 *
 * The fixtures isolate browser contexts, not the shared backend, so a test that
 * fails halfway would otherwise leave an uploaded image or a flipped toggle
 * behind for every other online spec.
 */
async function resetAppearanceState(): Promise<void> {
  const api = await playwrightRequest.newContext({ baseURL: getApiBaseUrl() });
  try {
    const login = await api.post('/api/v1/auth/login', {
      data: { username: 'e2e-admin', password: TEST_PASSWORDS.ADMIN },
    });
    const { token } = (await login.json()) as { token: string };
    const headers = { Authorization: `Bearer ${token}` };

    for (const surface of ['login', 'home']) {
      await api.delete(`/api/v1/admin/appearance/background/${surface}`, {
        headers,
      });
    }
    const defaults: Record<string, string> = {
      LOGIN_BACKGROUND_URL: '',
      HOME_BACKGROUND_URL: '',
      BACKGROUND_OVERLAY_OPACITY: '',
      BACKGROUND_BLUR: '0',
      USER_BACKGROUND_ENABLED: 'true',
      USER_BACKGROUND_UPLOAD_ENABLED: 'false',
    };
    for (const [key, value] of Object.entries(defaults)) {
      await api.put(`/api/v1/admin/config/${key}`, {
        headers,
        data: { value },
      });
    }
  } finally {
    await api.dispose();
  }
}

test.describe('Appearance: customizable backgrounds', () => {
  test.describe.configure({ mode: 'serial' });

  // Each of these walks several admin round-trips, and every config save
  // re-resolves the live background — comfortably past the 30s default.
  test.beforeEach(() => {
    test.setTimeout(120000);
  });

  test.afterEach(async () => {
    await resetAppearanceState();
  });

  test('admin uploads a branding background and it reaches the login page', async ({
    adminPage,
    anonymousPage,
  }) => {
    await gotoAppearance(adminPage);

    await test.step('starts from a clean slate', async () => {
      // A retried run inherits whatever the previous attempt uploaded.
      for (const surface of ['home', 'login'] as const) {
        const remove = adminPage.getByTestId(`${surface}-background-remove`);
        if (await remove.isVisible()) {
          await remove.click();
          await expect(remove).toBeHidden();
        }
      }
      await expect
        .poll(() => backgroundVar(adminPage))
        .toContain('home_background.png');
      // With nothing set, the login surface says it is inheriting home.
      await expect(
        adminPage.getByTestId('login-inherits-notice')
      ).toBeVisible();
      await expect(
        adminPage.getByTestId('home-background-remove')
      ).toBeHidden();
    });

    await test.step('uploads a home background', async () => {
      await adminPage.getByTestId('home-background-input').setInputFiles({
        name: 'e2e-home-bg.png',
        mimeType: 'image/png',
        buffer: await makeBackgroundPng(adminPage, '#2b6f7a'),
      });

      // The remove button only exists once an image is stored.
      await expect(
        adminPage.getByTestId('home-background-remove')
      ).toBeVisible();
    });

    await test.step('applies it live, without a reload', async () => {
      await expect
        .poll(() => backgroundVar(adminPage))
        .toContain('/api/v1/appearance/background/home');
    });

    await test.step('serves the image publicly and cacheably', async () => {
      const url = (await backgroundVar(adminPage)).replace(/^url\("|"\)$/g, '');
      // A brand-new context: no session cookie, because the login page has to
      // be able to load this before anyone can sign in.
      const response = await anonymousPage.request.get(url);

      expect(response.status()).toBe(200);
      // WebP when the backend has sharp (bun/node dev); the original format is
      // kept where it does not (the compiled binary in Docker, and Workers).
      expect(response.headers()['content-type']).toMatch(/^image\/(webp|png)$/);
      expect(response.headers()['cache-control']).toContain('immutable');
    });

    await test.step('an anonymous visitor gets it on the welcome/login screen', async () => {
      await anonymousPage.goto('/');
      await expect(anonymousPage.getByTestId('welcome-heading')).toBeVisible();

      // The login surface inherits the home background when it has none of its
      // own, so a single upload brands both.
      await expect
        .poll(() => paintedBackground(anonymousPage))
        .toContain('/api/v1/appearance/background/home');
    });

    await test.step('survives a reload of the admin page', async () => {
      await adminPage.reload();
      await expect
        .poll(() => backgroundVar(adminPage))
        .toContain('/api/v1/appearance/background/home');
    });

    await test.step('removing it falls back to the bundled default', async () => {
      await gotoAppearance(adminPage);
      await adminPage.getByTestId('home-background-remove').click();

      await expect(
        adminPage.getByTestId('home-background-remove')
      ).toBeHidden();
      await expect
        .poll(() => backgroundVar(adminPage))
        .toContain('home_background.png');
    });
  });

  test('admin sets an external URL and the treatment knobs', async ({
    adminPage,
  }) => {
    await gotoAppearance(adminPage);

    await test.step('rejects a URL that is not absolute http(s)', async () => {
      await adminPage.getByTestId('home-background-url').fill('not-a-url');
      await adminPage.getByTestId('home-background-url').blur();

      // Rejected client-side, so the background is untouched.
      await expect
        .poll(() => backgroundVar(adminPage))
        .toContain('home_background.png');
    });

    await test.step('accepts an absolute https URL', async () => {
      await adminPage
        .getByTestId('home-background-url')
        .fill('https://cdn.example.com/e2e-background.jpg');
      await adminPage.getByTestId('home-background-url').blur();

      await expect
        .poll(() => backgroundVar(adminPage))
        .toContain('https://cdn.example.com/e2e-background.jpg');
    });

    await test.step('applies the scrim opacity to the root element', async () => {
      await adminPage.getByTestId('overlay-opacity-input').fill('0.85');
      await adminPage.getByTestId('overlay-opacity-input').blur();

      await expect
        .poll(() =>
          adminPage.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue('--app-bg-scrim-override')
              .trim()
          )
        )
        .toBe('0.85');
    });

    await test.step('clears both settings again', async () => {
      await adminPage.getByTestId('overlay-opacity-input').fill('');
      await adminPage.getByTestId('overlay-opacity-input').blur();
      // Let that save land before starting the next one.
      await expect
        .poll(() =>
          adminPage.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue('--app-bg-scrim-override')
              .trim()
          )
        )
        .toBe('');

      await adminPage.getByTestId('home-background-url').fill('');
      await adminPage.getByTestId('home-background-url').blur();

      await expect
        .poll(() => backgroundVar(adminPage))
        .toContain('home_background.png');
      await expect
        .poll(() =>
          adminPage.evaluate(() =>
            getComputedStyle(document.documentElement)
              .getPropertyValue('--app-bg-scrim-override')
              .trim()
          )
        )
        .toBe('');
    });
  });

  test('a user picks a preset for their own pages, and it persists', async ({
    authenticatedPage,
  }) => {
    await openAccountSettings(authenticatedPage);

    await test.step('the picker is offered, presets included', async () => {
      await expect(
        authenticatedPage.getByTestId('background-picker')
      ).toBeVisible();
      await expect(
        authenticatedPage.getByTestId('background-tile-default')
      ).toBeVisible();
      await expect(
        authenticatedPage.getByTestId('background-tile-midnight')
      ).toBeVisible();
    });

    await test.step('uploads are hidden until an admin allows them', async () => {
      await expect(
        authenticatedPage.getByTestId('background-upload-button')
      ).toBeHidden();
    });

    await test.step('choosing a preset changes the background', async () => {
      await authenticatedPage.getByTestId('background-tile-midnight').click();

      await expect
        .poll(() => backgroundVar(authenticatedPage))
        .toContain('linear-gradient');
    });

    await test.step('the choice survives a reload', async () => {
      await authenticatedPage.getByTestId('settings-close-button').click();
      await authenticatedPage.reload();

      await expect
        .poll(() => paintedBackground(authenticatedPage))
        .toContain('linear-gradient');
    });

    await test.step('the preset is remembered as the selected tile', async () => {
      await openAccountSettings(authenticatedPage);
      await expect(
        authenticatedPage.getByTestId('background-tile-midnight')
      ).toHaveClass(/selected/);
    });

    await test.step('going back to the site default restores it', async () => {
      await authenticatedPage.getByTestId('background-tile-default').click();

      await expect
        .poll(() => backgroundVar(authenticatedPage))
        .toContain('home_background.png');
    });
  });

  test('a user uploads their own background once an admin allows it', async ({
    adminPage,
    authenticatedPage,
  }) => {
    await test.step('admin enables user uploads', async () => {
      await gotoAppearance(adminPage);
      await adminPage
        .getByTestId('toggle-user-uploads')
        .locator('button')
        .click();

      await expect(
        adminPage.getByTestId('toggle-user-uploads').locator('button')
      ).toHaveAttribute('aria-checked', 'true');
    });

    await test.step('the user can now upload one', async () => {
      await authenticatedPage.reload();
      await openAccountSettings(authenticatedPage);

      const uploadButton = authenticatedPage.getByTestId(
        'background-upload-button'
      );
      await expect(uploadButton).toBeVisible();

      await authenticatedPage
        .getByTestId('background-upload-input')
        .setInputFiles({
          name: 'e2e-user-bg.png',
          mimeType: 'image/png',
          buffer: await makeBackgroundPng(authenticatedPage, '#7a4b2b'),
        });

      // Uploading selects the image, so the background becomes it.
      await expect
        .poll(() => backgroundVar(authenticatedPage))
        .toContain('/api/v1/appearance/user-background');
      await expect(
        authenticatedPage.getByTestId('background-tile-upload')
      ).toBeVisible();
    });

    await test.step('the image is not public, unlike the branding one', async () => {
      // There is deliberately no /:username/ form of this endpoint — it only
      // ever serves the caller's own image — so the property to check is that
      // it refuses a request carrying no session at all. The branding endpoint
      // in the first test is 200 for exactly the same kind of request.
      const url = (await backgroundVar(authenticatedPage)).replace(
        /^url\("|"\)$/g,
        ''
      );
      const response = await authenticatedPage.request.get(url);
      expect(response.status()).toBe(401);
    });

    await test.step('removing it falls back to the admin default', async () => {
      await authenticatedPage.getByTestId('background-remove-button').click();

      await expect(
        authenticatedPage.getByTestId('background-tile-upload')
      ).toBeHidden();
      await expect
        .poll(() => backgroundVar(authenticatedPage))
        .toContain('home_background.png');
    });

    await test.step('admin turns personalisation off entirely', async () => {
      await gotoAppearance(adminPage);
      await adminPage
        .getByTestId('toggle-user-backgrounds')
        .locator('button')
        .click();
      await expect(
        adminPage.getByTestId('toggle-user-backgrounds').locator('button')
      ).toHaveAttribute('aria-checked', 'false');
    });

    await test.step('the picker disappears for the user', async () => {
      await authenticatedPage.reload();
      await openAccountSettings(authenticatedPage);

      await expect(
        authenticatedPage.getByTestId('background-picker')
      ).toBeHidden();
    });

    await test.step('restores the server defaults for later tests', async () => {
      await gotoAppearance(adminPage);
      await adminPage
        .getByTestId('toggle-user-backgrounds')
        .locator('button')
        .click();
      await expect(
        adminPage.getByTestId('toggle-user-backgrounds').locator('button')
      ).toHaveAttribute('aria-checked', 'true');

      const uploadToggle = adminPage
        .getByTestId('toggle-user-uploads')
        .locator('button');
      if ((await uploadToggle.getAttribute('aria-checked')) === 'true') {
        await uploadToggle.click();
      }
      await expect(uploadToggle).toHaveAttribute('aria-checked', 'false');
    });
  });
});
