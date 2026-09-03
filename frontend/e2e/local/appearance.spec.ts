/**
 * Background personalisation — Local Mode
 *
 * Local mode has no server to hold an appearance config or an uploaded image,
 * so the background must resolve entirely client-side: the bundled default when
 * nothing is stored, and one of the built-in presets (pure CSS gradients) when
 * the user has chosen one. This is also the regression guard for the
 * CSS-variable refactor — the bundled image has to keep painting when nothing
 * has ever asked the API anything.
 *
 * The picker UI itself is driven in `e2e/online/appearance.spec.ts`; opening the
 * settings dialog here would trip this suite's no-API-requests guard on an
 * unrelated passkeys call the account tab makes.
 */
import { expect, test } from './fixtures';

type PlaywrightPage = import('@playwright/test').Page;

/** The custom property BackgroundService writes to the root element. */
async function backgroundVar(page: PlaywrightPage): Promise<string> {
  return await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue('--app-bg-image')
      .trim()
  );
}

/** The background actually painted on the home surface. */
async function paintedBackground(page: PlaywrightPage): Promise<string> {
  const container = page.getByTestId('home-content-container');
  await expect(container).toBeVisible();
  return await container.evaluate(
    element => getComputedStyle(element).backgroundImage
  );
}

/**
 * Store a background preference the way the app does, under the local storage
 * context's prefix. Standing in for the picker, which this suite cannot open.
 */
async function seedPreference(
  page: PlaywrightPage,
  preference: { kind: string; presetId?: string }
): Promise<void> {
  await page.evaluate(value => {
    localStorage.setItem('local:appearance.background-preference', value);
  }, JSON.stringify(preference));
}

test.describe('Background personalisation (local mode)', () => {
  test('paints the bundled default with no server involved', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    expect(await backgroundVar(page)).toContain('home_background.png');
    await expect
      .poll(() => paintedBackground(page))
      .toContain('home_background.png');
  });

  test('applies a stored preset without contacting a server', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    await test.step('a chosen preset survives a reload', async () => {
      await seedPreference(page, { kind: 'preset', presetId: 'forest' });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await expect
        .poll(() => paintedBackground(page))
        .toContain('linear-gradient');
    });

    await test.step('the plain preset drops the image entirely', async () => {
      await seedPreference(page, { kind: 'preset', presetId: 'none' });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await expect.poll(() => backgroundVar(page)).toBe('none');
    });

    await test.step('an unknown preset id falls back rather than breaking', async () => {
      await seedPreference(page, { kind: 'preset', presetId: 'not-a-preset' });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await expect
        .poll(() => backgroundVar(page))
        .toContain('home_background.png');
    });

    await test.step('a corrupt preference is ignored rather than fatal', async () => {
      await page.evaluate(() => {
        localStorage.setItem(
          'local:appearance.background-preference',
          'not json at all'
        );
      });
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await expect
        .poll(() => paintedBackground(page))
        .toContain('home_background.png');
    });
  });
});
