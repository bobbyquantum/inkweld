/**
 * Worldbuilding Editor Custom Background Screenshot Tests
 *
 * Captures screenshots of the worldbuilding editor with per-element custom
 * backgrounds configured from the identity tab's Appearance panel. The menu
 * (sidenav) and content regions can each get a solid colour or a gradient.
 *
 * Uses the worldbuilding-demo project template which ships with pre-built
 * schemas and seeded elements.
 *
 * Screenshots captured (per color scheme):
 * - Editor with a solid colour menu background
 * - Editor with a gradient content background
 */

import { type Page } from '@playwright/test';
import { join } from 'path';

import {
  createProjectWithTwoSteps,
  dismissToastIfPresent,
} from '../common/test-helpers';
import { expect, test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

test.describe('Worldbuilding Editor Custom Background Screenshots', () => {
  const screenshotsDir = getScreenshotsDir('worldbuilding-backgrounds');

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  async function setupProjectAndOpenCharacter(
    page: Page,
    projectSlug: string,
    projectTitle: string
  ): Promise<void> {
    await page.goto('/');
    await page.getByTestId('empty-state').waitFor({ state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      projectTitle,
      projectSlug,
      undefined,
      'worldbuilding-demo'
    );

    await page.getByTestId('project-tree').waitFor({ state: 'visible' });
    await dismissToastIfPresent(page);

    await page.getByTestId('element-Characters').click();

    await page.getByTestId('element-Elara Nightwhisper').waitFor({
      state: 'visible',
    });
    await page.getByTestId('element-Elara Nightwhisper').click();

    await page.waitForURL(/\/worldbuilding\//);
    await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
    await expect(page.getByTestId('wb-sidenav')).toBeVisible();
  }

  /**
   * Enable a region via its slide toggle. Material slide toggles are clicked
   * rather than checked/unchecked.
   */
  async function enableRegion(
    page: Page,
    region: 'menu' | 'content'
  ): Promise<void> {
    await page.getByTestId(`appearance-${region}-toggle`).click();
  }

  /**
   * Select a background type (color/gradient/image) for a region. The type
   * select is the first combobox inside the region's controls.
   */
  async function selectType(
    page: Page,
    region: 'menu' | 'content',
    type: string
  ): Promise<void> {
    const typeSelect = page
      .getByTestId(`appearance-${region}`)
      .getByRole('combobox')
      .first();
    await typeSelect.click();
    await page
      .getByTestId(`appearance-${region}-option-${type.toLowerCase()}`)
      .click();
    await expect(
      page
        .getByTestId(`appearance-${region}`)
        .getByTestId(type === 'Gradient' ? 'gradient-designer' : 'color-picker')
    ).toBeVisible();
  }

  /**
   * Wait until the target region's computed background reflects a non-empty
   * value (solid colour or gradient) so the editor is in a stable state.
   */
  async function waitForBackgroundRendered(
    page: Page,
    region: 'menu' | 'content'
  ): Promise<void> {
    const regionEl =
      region === 'menu'
        ? page.getByTestId('wb-sidenav')
        : page.getByTestId('wb-content');
    await expect(regionEl).toHaveClass(/has-custom-background/);
    // Wait for the applied CSS custom property to render a real value.
    await expect
      .poll(() =>
        regionEl.evaluate(el =>
          getComputedStyle(el).getPropertyValue('--wb-bg').trim()
        )
      )
      .not.toBe('');
  }

  /**
   * Configure a solid colour background for a region via the Appearance panel.
   */
  async function setSolidColour(
    page: Page,
    region: 'menu' | 'content',
    colour: string
  ): Promise<void> {
    await enableRegion(page, region);
    await page
      .getByTestId(`appearance-${region}`)
      .getByTestId('color-picker-trigger')
      .click();
    const hexInput = page
      .locator('.color-picker:not([data-testid]) .hex-text input')
      .last();
    await hexInput.fill(colour);
    await hexInput.press('Enter');
    // Ensure the colour dialog closes so it can't intercept later clicks.
    await expect(
      page.locator('.color-picker:not([data-testid])')
    ).not.toBeVisible();
    await waitForBackgroundRendered(page, region);
  }

  /**
   * Configure a gradient background for a region via the Appearance panel.
   * Parses the CSS gradient string and drives the visual designer.
   */
  async function setGradient(
    page: Page,
    region: 'menu' | 'content',
    gradient: string
  ): Promise<void> {
    await enableRegion(page, region);
    await selectType(page, region, 'Gradient');

    const angleMatch = /linear-gradient\(\s*(\d+)deg/i.exec(gradient);
    const angle = angleMatch ? angleMatch[1] : '180';
    const targetStops = [
      ...gradient.matchAll(/(#[0-9a-f]{3,8})\s*(\d+)?%/gi),
    ].map(m => ({ color: m[1], position: m[2] ?? '' }));

    const designer = page
      .getByTestId(`appearance-${region}`)
      .getByTestId('gradient-designer');
    const stopLocators = designer.getByTestId('gradient-stop');
    // The designer starts with two stops; add more if the target has more.
    for (let i = 2; i < targetStops.length; i++) {
      await designer.getByTestId('gradient-add-stop').click();
    }
    // Stop 0 is auto-selected. Select each later stop and set its colour via
    // the colour chooser in the stop editor.
    const setStopColor = async (index: number, color: string) => {
      await stopLocators.nth(index).click();
      await designer.getByTestId('color-picker-trigger').first().click();
      const hexInput = page
        .locator('.color-picker:not([data-testid]) .hex-text input')
        .last();
      await hexInput.fill(color);
      await hexInput.press('Enter');
      await page.keyboard.press('Escape');
    };
    for (let i = 0; i < targetStops.length; i++) {
      await setStopColor(i, targetStops[i].color);
    }
    await designer.getByTestId('gradient-angle').fill(angle);
    await waitForBackgroundRendered(page, region);
  }

  async function openAppearancePanel(page: Page): Promise<void> {
    await page.getByTestId('nav-identity').click();
    await expect(page.getByTestId('identity-panel')).toBeVisible();
    await expect(page.getByTestId('appearance-panel')).toBeVisible();
  }

  test('custom backgrounds — solid colour menu (light)', async ({
    offlinePage: page,
  }) => {
    await setupProjectAndOpenCharacter(page, 'wb-bg-menu', 'Background Demo');
    await openAppearancePanel(page);
    await setSolidColour(page, 'menu', '#4fd8eb');

    const container = page.getByTestId('worldbuilding-editor');
    await captureElementScreenshot(
      page,
      [container],
      join(screenshotsDir, 'worldbuilding-background-menu-solid.png'),
      0
    );
  });

  test('custom backgrounds — gradient content (light)', async ({
    offlinePage: page,
  }) => {
    await setupProjectAndOpenCharacter(
      page,
      'wb-bg-content',
      'Background Demo'
    );
    await openAppearancePanel(page);
    await setGradient(
      page,
      'content',
      'linear-gradient(135deg, #97f0ff 0%, #cde7ec 50%, #ffffff 100%)'
    );

    const container = page.getByTestId('worldbuilding-editor');
    await captureElementScreenshot(
      page,
      [container],
      join(screenshotsDir, 'worldbuilding-background-content-gradient.png'),
      0
    );
  });

  test('custom backgrounds — menu and content both custom (dark)', async ({
    offlinePage: page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectAndOpenCharacter(page, 'wb-bg-both', 'Background Demo');
    await openAppearancePanel(page);
    await setSolidColour(page, 'menu', '#1c3438');
    await setGradient(
      page,
      'content',
      'linear-gradient(180deg, #00363d 0%, #1c3438 100%)'
    );

    const container = page.getByTestId('worldbuilding-editor');
    await captureElementScreenshot(
      page,
      [container],
      join(screenshotsDir, 'worldbuilding-background-both-dark.png'),
      0
    );
  });
});
