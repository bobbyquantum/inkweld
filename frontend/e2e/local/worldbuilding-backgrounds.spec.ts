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

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

const MENU_COLOUR = '#4fd8eb';
const MENU_COLOUR_RGB = 'rgb(79, 216, 235)';
const CONTENT_GRADIENT =
  'linear-gradient(135deg, #97f0ff 0%, #cde7ec 50%, #ffffff 100%)';

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
      await expect(menuToggle).not.toHaveClass(/mat-mdc-slide-toggle-checked/);
      await expect(contentToggle).not.toHaveClass(
        /mat-mdc-slide-toggle-checked/
      );
      await expect(sidenav).not.toHaveClass(/has-custom-background/);
    });

    await test.step('solid colour applies to the sidenav', async () => {
      await menuToggle.click();
      await expect(menuToggle).toHaveClass(/mat-mdc-slide-toggle-checked/);
      await page.getByTestId('appearance-menu-value').fill(MENU_COLOUR);

      await expect(sidenav).toHaveClass(/has-custom-background/);
      await expect.poll(() => sidenavBgColor(page)).toBe(MENU_COLOUR_RGB);
    });

    await test.step('gradient applies to the content area', async () => {
      await contentToggle.click();
      await expect(contentToggle).toHaveClass(/mat-mdc-slide-toggle-checked/);

      const typeSelect = page
        .getByTestId('appearance-content')
        .getByRole('combobox')
        .first();
      await typeSelect.click();
      await page.getByRole('option', { name: 'Gradient' }).click();

      await page.getByTestId('appearance-content-value').fill(CONTENT_GRADIENT);

      await expect(content).toHaveClass(/has-custom-background/);
      await expect
        .poll(() => contentBgImage(page))
        .toContain('linear-gradient');
    });

    await test.step('backgrounds persist across reload', async () => {
      // Allow the debounced identity save to flush before reloading.
      await page.waitForTimeout(700);
      await page.reload();
      await openCharacter(page);

      await expect(sidenav).toHaveClass(/has-custom-background/);
      await expect.poll(() => sidenavBgColor(page)).toBe(MENU_COLOUR_RGB);
      await expect(content).toHaveClass(/has-custom-background/);
      await expect
        .poll(() => contentBgImage(page))
        .toContain('linear-gradient');
      await expect(menuToggle).toHaveClass(/mat-mdc-slide-toggle-checked/);
    });

    await test.step('disabling a region removes its background', async () => {
      await menuToggle.click();
      await expect(menuToggle).not.toHaveClass(/mat-mdc-slide-toggle-checked/);
      await expect(sidenav).not.toHaveClass(/has-custom-background/);
      // Content background remains untouched.
      await expect(content).toHaveClass(/has-custom-background/);
    });
  });
});
