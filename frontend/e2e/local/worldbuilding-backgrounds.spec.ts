/**
 * Worldbuilding Custom Background Tests - Local Mode
 *
 * Exercises the per-element background theming (Appearance panel) end to end:
 * - toggles start unchecked when no region is configured
 * - enabling a region with a solid colour applies it to the sidenav
 * - enabling a region with a gradient applies it to the content area
 * - backgrounds persist across a reload
 * - disabling a region removes its background
 *
 * Any API request will fail the test (local mode only).
 */
import { type Page } from '@playwright/test';

import {
  countIndexedDBUpdates,
  createProjectWithTwoSteps,
  waitForIndexedDBFlush,
  waitForIndexedDBPersisted,
  waitForIndexedDBStable,
} from '../common/test-helpers';
import { expect, test } from './fixtures';

const MENU_COLOUR = '#4fd8eb';
const MENU_COLOUR_RGB = 'rgb(79, 216, 235)';
const CONTENT_GRADIENT =
  'linear-gradient(135deg, #97f0ff 0%, #cde7ec 50%, #ffffff 100%)';
const ELEMENT_ID = 'char-elara';
const USERNAME = 'testuser';
const SLUG = 'wb-bg-demo';
const APPEARANCE_DB = `worldbuilding:${USERNAME}:${SLUG}:${ELEMENT_ID}`;

function appearanceRegionTestId(region: 'menu' | 'content'): string {
  return `appearance-${region}`;
}

async function openCharacter(page: Page): Promise<void> {
  await page.getByTestId('project-tree').waitFor({ state: 'visible' });
  await page.getByTestId('element-Characters').click();
  await page.getByTestId('element-Elara Nightwhisper').waitFor({
    state: 'visible',
  });
  await page.getByTestId('element-Elara Nightwhisper').click();
  await page.waitForURL(/\/worldbuilding\//);
  await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
  await expect(page.getByTestId('wb-sidenav')).toBeVisible();
  await page.getByTestId('nav-identity').click();
  await expect(page.getByTestId('appearance-panel')).toBeVisible();
}

function sidenavBgColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="wb-sidenav"]');
    return el ? getComputedStyle(el).backgroundColor : '';
  });
}

function contentBgImage(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="wb-content"]');
    return el ? getComputedStyle(el).backgroundImage : '';
  });
}

test.describe('Worldbuilding Custom Backgrounds', () => {
  test('apply, persist, and clear custom backgrounds', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.getByTestId('empty-state').waitFor({ state: 'visible' });
    await createProjectWithTwoSteps(
      page,
      'BG Demo',
      'wb-bg-demo',
      undefined,
      'worldbuilding-demo'
    );
    await openCharacter(page);

    const menuToggle = page.getByTestId('appearance-menu-toggle');
    const contentToggle = page.getByTestId('appearance-content-toggle');
    const sidenav = page.getByTestId('wb-sidenav');
    const content = page.getByTestId('wb-content');

    await test.step('toggles start unchecked when unconfigured', async () => {
      await expect(menuToggle).toHaveAttribute('aria-checked', 'false');
      await expect(contentToggle).toHaveAttribute('aria-checked', 'false');
      await expect(sidenav).not.toHaveClass(/has-custom-background/);
    });

    await test.step('solid colour applies to the sidenav', async () => {
      await menuToggle.click();
      await expect(menuToggle).toHaveAttribute('aria-checked', 'true');
      await page.getByTestId('appearance-menu-value').fill(MENU_COLOUR);

      await expect(sidenav).toHaveClass(/has-custom-background/);
      await expect.poll(() => sidenavBgColor(page)).toBe(MENU_COLOUR_RGB);
    });

    await test.step('gradient applies to the content area', async () => {
      await contentToggle.click();
      await expect(contentToggle).toHaveAttribute('aria-checked', 'true');

      const typeSelect = page
        .getByTestId(appearanceRegionTestId('content'))
        .getByRole('combobox')
        .first();
      await typeSelect.click();
      await page.getByTestId('appearance-content-option-gradient').click();

      await page.getByTestId('appearance-content-value').fill(CONTENT_GRADIENT);

      await expect(content).toHaveClass(/has-custom-background/);
      await expect
        .poll(() => contentBgImage(page))
        .toContain('linear-gradient');
    });

    await test.step('backgrounds persist across reload', async () => {
      // Wait for the debounced save to flush to IndexedDB before reloading.
      await waitForIndexedDBPersisted(page, APPEARANCE_DB, [
        MENU_COLOUR,
        'linear-gradient',
      ]);
      await page.reload();
      await openCharacter(page);

      await expect(sidenav).toHaveClass(/has-custom-background/);
      await expect.poll(() => sidenavBgColor(page)).toBe(MENU_COLOUR_RGB);
      await expect(content).toHaveClass(/has-custom-background/);
      await expect
        .poll(() => contentBgImage(page))
        .toContain('linear-gradient');
      await expect(menuToggle).toHaveAttribute('aria-checked', 'true');
    });

    await test.step('disabling a region removes its background', async () => {
      // Let any trailing save from the reload settle, then capture the
      // persisted update baseline before disabling the menu region.
      await waitForIndexedDBStable(page, APPEARANCE_DB);
      const updatesBaseline = await countIndexedDBUpdates(page, APPEARANCE_DB);
      await menuToggle.click();
      await expect(menuToggle).toHaveAttribute('aria-checked', 'false');
      // Wait for the debounced deletion to flush to IndexedDB, then reload to
      // prove the menu background stays removed after persistence.
      await waitForIndexedDBFlush(page, APPEARANCE_DB, updatesBaseline);
      await page.reload();
      await openCharacter(page);

      await expect(menuToggle).toHaveAttribute('aria-checked', 'false');
      await expect(sidenav).not.toHaveClass(/has-custom-background/);
      // Content background remains untouched.
      await expect(content).toHaveClass(/has-custom-background/);
    });
  });
});
