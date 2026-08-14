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

const ELEMENT_ID = 'char-elara';
const USERNAME = 'testuser';
const SLUG = 'wb-bg-demo';
const APPEARANCE_DB = `worldbuilding:${USERNAME}:${SLUG}:${ELEMENT_ID}`;

/** The colour actually chosen via the picker in the first test step. */
let menuChosenColour = '#4fd8eb';

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
  await page.getByTestId('nav-styling').click();
  await expect(page.getByTestId('appearance-panel')).toBeVisible();
}

async function setColour(
  page: Page,
  container: ReturnType<Page['getByTestId']>
): Promise<string> {
  // Drive ngx-input-color's saturation board: clicking it selects a colour.
  const sat = container.locator('saturation');
  await sat.waitFor({ state: 'visible' });
  await sat.scrollIntoViewIfNeeded();
  const box = await sat.boundingBox();
  if (!box) throw new Error('saturation board not visible');
  // Capture the initial preview so we can wait for it to change after the click.
  const initial = (
    await container.locator('.ngx-color-preview .rgbacode').textContent()
  )?.trim();
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
  // Wait for the picker's live preview to change from its initial value.
  await expect
    .poll(async () =>
      (
        await container.locator('.ngx-color-preview .rgbacode').textContent()
      )?.trim()
    )
    .not.toBe(initial);
  const preview = (
    await container.locator('.ngx-color-preview .rgbacode').textContent()
  )?.trim();
  if (!preview) throw new Error('no colour preview');
  // The picker shows uppercase; the app normalises to lowercase.
  return preview.toLowerCase();
}

async function setGradientStopColor(
  page: Page,
  gradient: ReturnType<Page['getByTestId']>,
  color: string
): Promise<void> {
  // ngx-input-gradient's stop editor has a plain text colour input.
  const input = gradient.locator('input[name="color"]');
  await input.waitFor({ state: 'visible' });
  await input.scrollIntoViewIfNeeded();
  await input.fill(color);
  await input.press('Enter');
  // Wait for the colour to propagate through the debounced store and render as
  // part of the content background gradient.
  await expect
    .poll(async () => await contentBgImage(page))
    .toContain(hexToRgb(color));
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The colour the app actually applies in auto mode (default intensity 25) for
 * the light theme: the chosen colour lightened by (0.25^2 = 0.0625) toward white.
 */
function autoAppliedColour(hex: string): string {
  const c = (i: number) =>
    Number.parseInt(hex.replace('#', '').slice(i, i + 2), 16);
  const mix = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + (255 - v) * 0.0625)));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(c(0)))}${toHex(mix(c(2)))}${toHex(mix(c(4)))}`;
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

      const menuColour = page.getByTestId('appearance-menu');
      const chosen = await setColour(page, menuColour);
      menuChosenColour = chosen;
      // Auto mode lightens the chosen colour (default intensity 25) in light theme.
      const applied = autoAppliedColour(chosen);

      await expect(sidenav).toHaveClass(/has-custom-background/);
      await expect.poll(() => sidenavBgColor(page)).toBe(hexToRgb(applied));
    });

    await test.step('gradient applies to the content area', async () => {
      await contentToggle.click();
      await expect(contentToggle).toHaveAttribute('aria-checked', 'true');

      await page
        .getByTestId('appearance-content-option-gradient')
        .locator('label')
        .click();
      const gradient = page
        .getByTestId('appearance-content')
        .getByTestId('gradient-designer')
        .locator('ngx-input-gradient');
      // Stop 0 is auto-selected by default; set its colour.
      await setGradientStopColor(page, gradient, '#97f0ff');
      // Click the range slider at ~40% to add a third stop, then colour it.
      const slider = gradient.locator('range-slider .slider').first();
      await slider.scrollIntoViewIfNeeded();
      const sliderBox = await slider.boundingBox();
      if (!sliderBox) throw new Error('gradient slider not visible');
      await page.mouse.click(
        sliderBox.x + sliderBox.width * 0.4,
        sliderBox.y + sliderBox.height / 2
      );
      await expect(gradient.locator('range-slider .thumb')).toHaveCount(3);
      await setGradientStopColor(page, gradient, '#ffd166');
      // Set the rotation angle.
      const rotation = gradient.locator('input[name="rotation"]');
      await rotation.scrollIntoViewIfNeeded();
      await rotation.fill('135');
      await rotation.press('Enter');

      await expect(content).toHaveClass(/has-custom-background/);
      await expect
        .poll(() => contentBgImage(page))
        .toContain('linear-gradient');
    });

    await test.step('backgrounds persist across reload', async () => {
      // Wait for the debounced save to flush to IndexedDB before reloading.
      await waitForIndexedDBPersisted(page, APPEARANCE_DB, [
        menuChosenColour,
        'linear-gradient',
      ]);
      await page.reload();
      await openCharacter(page);

      await expect(sidenav).toHaveClass(/has-custom-background/);
      await expect
        .poll(() => sidenavBgColor(page))
        .toBe(hexToRgb(autoAppliedColour(menuChosenColour)));
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
