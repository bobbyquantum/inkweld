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

import { type Locator, type Page } from '@playwright/test';
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

/** True when two bounding boxes sit at (nearly) the same position and size. */
type BoundingBox = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;

function boxesEqual(a: BoundingBox, b: BoundingBox): boolean {
  return (
    Math.abs(a.x - b.x) < 1 &&
    Math.abs(a.y - b.y) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

test.describe('Worldbuilding Editor Custom Background Screenshots', () => {
  const screenshotsDir = getScreenshotsDir('worldbuilding-backgrounds');

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  /**
   * Read a locator's bounding box once it has moved into a stable, measurable
   * position (e.g. after a programmatic scroll).
   */
  async function stableBoundingBox(
    locator: Locator,
    timeoutMs = 3000,
    intervalMs = 50
  ): Promise<BoundingBox | null> {
    const deadline = Date.now() + timeoutMs;
    let previous: BoundingBox | undefined;
    while (Date.now() < deadline) {
      const box = await locator.boundingBox();
      const stable =
        box !== null &&
        box.width > 0 &&
        box.height > 0 &&
        (previous === undefined || boxesEqual(box, previous));
      if (stable) {
        return box;
      }
      previous = box ?? undefined;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }

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
   * Enable a region via its slide toggle, starting from a fresh default
   * setting. The demo template ships every element with themed gradients, so
   * a region that is already on is switched off first; re-enabling resets it
   * to the default auto-adjusted solid colour the helpers below expect.
   * Material slide toggles are clicked rather than checked/unchecked.
   */
  async function enableRegion(
    page: Page,
    region: 'menu' | 'content'
  ): Promise<void> {
    const toggle = page.getByTestId(`appearance-${region}-toggle`);
    if ((await toggle.getAttribute('aria-checked')) === 'true') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'false');
    }
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  }

  /**
   * Select a background type (color/gradient/image) for a region via the radio
   * list inside the region's controls.
   */
  async function selectType(
    page: Page,
    region: 'menu' | 'content',
    type: string
  ): Promise<void> {
    await page
      .getByTestId(`appearance-${region}-option-${type.toLowerCase()}`)
      .locator('label')
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
    await setColour(page, page.getByTestId(`appearance-${region}`), colour);
    await waitForBackgroundRendered(page, region);
  }

  /** Set a colour through ngx-input-color's saturation board. */
  async function setColour(
    page: Page,
    container: ReturnType<Page['getByTestId']>,
    _colour: string
  ): Promise<void> {
    const sat = container.locator('saturation');
    await sat.waitFor({ state: 'visible' });
    await sat.scrollIntoViewIfNeeded();
    const box = await sat.boundingBox();
    if (!box) throw new Error('saturation board not visible');
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
    await waitForBackgroundRendered(page, 'menu');
  }

  /**
   * Configure a gradient background for a region via the Appearance panel.
   * Uses the ngx gradient picker's stop editor to set each stop's colour and
   * the rotation input for the angle. Extra stops beyond the first two are
   * added by clicking the range slider.
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
      .getByTestId('gradient-designer')
      .locator('ngx-input-gradient');
    const thumbs = designer.locator('range-slider .thumb');
    // The designer starts with two stops; add more if the target has more.
    if (targetStops.length > 2) {
      const slider = designer.locator('range-slider .slider').first();
      await slider.scrollIntoViewIfNeeded();
      // Wait until the slider has scrolled into a stable, measurable position
      // before reading its coordinates for the pointer clicks.
      const sliderBox = await stableBoundingBox(slider);
      if (!sliderBox) throw new Error('gradient slider not visible');
      for (let i = 2; i < targetStops.length; i++) {
        const frac = 0.2 + (0.6 * (i - 2)) / (targetStops.length - 2);
        await page.mouse.click(
          sliderBox.x + sliderBox.width * frac,
          sliderBox.y + sliderBox.height / 2
        );
        // toHaveCount auto-retries until the thumb has been added.
        await expect(thumbs).toHaveCount(i + 1);
      }
    }
    // Stop 0 is auto-selected. Select each later stop via its thumb and set
    // its colour through the stop editor's text input.
    const setStopColor = async (index: number, color: string) => {
      if (index > 0) await thumbs.nth(index).click();
      const colorInput = designer.locator('input[name="color"]');
      await colorInput.scrollIntoViewIfNeeded();
      await colorInput.fill(color);
      await colorInput.press('Enter');
    };
    for (let i = 0; i < targetStops.length; i++) {
      await setStopColor(i, targetStops[i].color);
    }
    const rotation = designer.locator('input[name="rotation"]');
    await rotation.scrollIntoViewIfNeeded();
    await rotation.fill(angle);
    await rotation.press('Enter');
    await waitForBackgroundRendered(page, region);
  }

  async function openAppearancePanel(page: Page): Promise<void> {
    await page.getByTestId('nav-styling').click();
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
