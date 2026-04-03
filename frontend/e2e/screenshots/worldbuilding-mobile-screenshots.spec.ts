/**
 * Worldbuilding Mobile Screenshot Tests
 *
 * Captures screenshots of worldbuilding screens at mobile viewport sizes
 * to verify the accordion layout works correctly on phones and small tablets.
 *
 * Mobile layout uses an accordion pattern:
 * - All sections rendered as collapsible mat-expansion-panels
 * - Identity & Details (expanded by default), schema tabs, Relationships
 *
 * Strategy: Set up the project and elements at desktop viewport (so sidebar
 * is visible), then resize to mobile viewport for screenshots.
 *
 * Viewports tested:
 * - iPhone SE (375x667)
 * - iPhone 14 Pro (393x852)
 * - Galaxy S21 (360x800)
 * - Small tablet (600x900)
 */

import { type Page } from '@playwright/test';
import { join } from 'path';

import {
  createProjectWithTwoSteps,
  DEMO_ASSETS,
  getDemoAssetPath,
} from '../common/test-helpers';
import { expect, test } from './fixtures';
import { ensureDirectory, getScreenshotsDir } from './screenshot-helpers';

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

const MOBILE_VIEWPORTS = {
  iPhoneSE: { width: 375, height: 667 },
  iPhone14Pro: { width: 393, height: 852 },
  galaxyS21: { width: 360, height: 800 },
  smallTablet: { width: 600, height: 900 },
} as const;

/**
 * Create a project and worldbuilding element at desktop viewport,
 * then open the element and resize to mobile for testing.
 * On mobile, the editor shows an accordion layout.
 */
async function setupWorldbuildingAtMobile(
  page: Page,
  projectSlug: string,
  elementType: string,
  elementName: string,
  mobileViewport: { width: number; height: number }
): Promise<void> {
  // Use desktop viewport for setup (sidebar is visible at desktop size)
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto('/');

  // Wait for empty state or project list
  await page.waitForSelector('.empty-state, [data-testid="project-card"]', {
    state: 'visible',
  });

  await createProjectWithTwoSteps(page, 'Mobile Test Project', projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  // Create a worldbuilding element (sidebar is visible at desktop viewport)
  await page.getByTestId('create-new-element').click();
  await page.waitForSelector(`[data-testid="element-type-${elementType}"]`);
  await page.getByTestId(`element-type-${elementType}`).click();
  await page.getByTestId('element-name-input').fill(elementName);
  await page.getByTestId('create-element-button').click();

  // Wait for dialog to close and element to appear
  await expect(page.locator('mat-dialog-container')).toBeHidden();
  await expect(page.getByTestId(`element-${elementName}`)).toBeVisible();

  // Open the worldbuilding element at desktop size
  await page.getByTestId(`element-${elementName}`).click();
  await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

  // Resize to mobile viewport first — accordion mode shows the image placeholder
  await page.setViewportSize(mobileViewport);

  // Wait for accordion layout to appear
  await expect(page.getByTestId('accordion-identity')).toBeVisible();

  // Upload a REAL image through the dialog (image placeholder is visible in accordion mode)
  await uploadRealImage(page);
}

/**
 * Upload a real image to the worldbuilding element through the image dialog.
 * This sets the image in Angular state via the normal upload flow, so the
 * <img> tag renders with a real image and no placeholder text leaks through.
 */
async function uploadRealImage(page: Page): Promise<void> {
  const imagePath = getDemoAssetPath(DEMO_ASSETS.images.demoCharacter);

  // Click the image placeholder to open the worldbuilding image dialog
  await page.click('button.image-placeholder');

  // Wait for the dialog to open (may take ~1s due to worldbuilding data loading)
  await page.waitForSelector('mat-dialog-container', {
    state: 'visible',
    timeout: 10000,
  });

  // Set the demo image file on the hidden file input inside the dialog
  const fileInput = page.locator('mat-dialog-container input[type="file"]');
  await fileInput.setInputFiles(imagePath);

  // Wait for the cropper to appear and process the image
  await page.waitForSelector('image-cropper', {
    state: 'visible',
    timeout: 10000,
  });

  // Wait for the Apply button to become enabled (croppedBlob is ready)
  const applyButton = page.locator(
    'mat-dialog-container button:has-text("Apply")'
  );
  await applyButton.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(
    () => {
      const buttons = document.querySelectorAll('mat-dialog-container button');
      for (const btn of buttons) {
        if (
          btn.textContent?.trim().includes('Apply') &&
          !btn.hasAttribute('disabled')
        ) {
          return true;
        }
      }
      return false;
    },
    { timeout: 15000 }
  );

  // Click Apply to save the cropped image
  await applyButton.click();

  // Wait for the dialog to close
  await page.waitForSelector('mat-dialog-container', {
    state: 'hidden',
    timeout: 5000,
  });

  // Wait for the real image to render in the identity panel
  await page.waitForSelector('.image-placeholder img', {
    state: 'visible',
    timeout: 5000,
  });
}

test.describe('Worldbuilding Mobile Screenshots', () => {
  const screenshotsDir = getScreenshotsDir('mobile');

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  for (const [viewportName, viewport] of Object.entries(MOBILE_VIEWPORTS)) {
    test.describe(`${viewportName} (${viewport.width}x${viewport.height})`, () => {
      test(`accordion overview`, async ({ offlinePage: page }) => {
        await setupWorldbuildingAtMobile(
          page,
          `mobile-overview-${viewportName.toLowerCase()}`,
          'character-v1',
          'Test Character',
          viewport
        );

        // On mobile, the editor should show accordion panels
        await expect(page.getByTestId('accordion-identity')).toBeVisible();
        await expect(page.getByTestId('accordion-relationships')).toBeVisible();

        // Verify the identity panel content is visible (expanded by default)
        await expect(page.locator('app-identity-panel')).toBeVisible();

        // Screenshot: accordion overview
        await page.screenshot({
          path: join(
            screenshotsDir,
            `worldbuilding-accordion-${viewportName}.png`
          ),
          fullPage: false,
        });
      });

      test(`expand tab panel`, async ({ offlinePage: page }) => {
        await setupWorldbuildingAtMobile(
          page,
          `mobile-tab-${viewportName.toLowerCase()}`,
          'character-v1',
          'Tab Fields Test',
          viewport
        );

        // Expand the Basic Info panel using its stable test ID
        const basicTabPanel = page.getByTestId('accordion-basic');
        await basicTabPanel.click();

        // Wait for panel to expand and form fields to appear
        await expect(page.getByTestId('field-fullName')).toBeVisible();

        // Verify form fields are visible
        const formFields = basicTabPanel.locator('[data-testid^="field-"]');
        const fieldCount = await formFields.count();
        expect(fieldCount).toBeGreaterThan(0);

        // Screenshot: expanded tab panel
        await page.screenshot({
          path: join(
            screenshotsDir,
            `worldbuilding-tab-fields-${viewportName}.png`
          ),
          fullPage: false,
        });
      });

      test(`no overflow in expanded panel`, async ({ offlinePage: page }) => {
        await setupWorldbuildingAtMobile(
          page,
          `mobile-ovf-${viewportName.toLowerCase()}`,
          'character-v1',
          'Overflow Check',
          viewport
        );

        // Expand the Basic Info panel to check field overflow
        const basicTabPanel = page.getByTestId('accordion-basic');
        await basicTabPanel.click();
        await expect(page.getByTestId('field-fullName')).toBeVisible();

        // Verify no horizontal overflow
        const hasHorizontalOverflow = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });

        expect(hasHorizontalOverflow).toBe(false);

        // Verify the worldbuilding editor container fits within viewport
        const editorBox = await page
          .getByTestId('worldbuilding-editor')
          .boundingBox();
        if (editorBox) {
          expect(editorBox.width).toBeLessThanOrEqual(viewport.width + 1);
        }

        // Verify all visible form fields are within viewport bounds
        const formFields = basicTabPanel.locator('[data-testid^="field-"]');
        const fieldCount = await formFields.count();
        for (let i = 0; i < Math.min(fieldCount, 5); i++) {
          const fieldBox = await formFields.nth(i).boundingBox();
          if (fieldBox) {
            expect(fieldBox.x).toBeGreaterThanOrEqual(-1);
            expect(fieldBox.x + fieldBox.width).toBeLessThanOrEqual(
              viewport.width + 1
            );
          }
        }
      });
    });
  }

  // --- Dark Mode Screenshots ---
  // Use a single representative viewport for dark mode to keep test count reasonable
  const darkViewport = MOBILE_VIEWPORTS.iPhone14Pro;

  test.describe('Dark Mode', () => {
    test('accordion overview - dark mode', async ({ offlinePage: page }) => {
      await setupWorldbuildingAtMobile(
        page,
        'mobile-dark-overview',
        'character-v1',
        'Dark Mode Char',
        darkViewport
      );

      // Switch to dark mode
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(400);

      // Verify accordion panels are visible
      await expect(page.getByTestId('accordion-identity')).toBeVisible();
      await expect(page.locator('app-identity-panel')).toBeVisible();

      await page.screenshot({
        path: join(screenshotsDir, 'worldbuilding-accordion-dark.png'),
        fullPage: false,
      });
    });

    test('expand tab panel - dark mode', async ({ offlinePage: page }) => {
      await setupWorldbuildingAtMobile(
        page,
        'mobile-dark-tab',
        'character-v1',
        'Dark Tab Fields',
        darkViewport
      );

      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(400);

      // Expand the Basic Info panel using its stable test ID
      const basicTabPanel = page.getByTestId('accordion-basic');
      await basicTabPanel.click();

      await expect(page.getByTestId('field-fullName')).toBeVisible();

      await page.screenshot({
        path: join(screenshotsDir, 'worldbuilding-tab-fields-dark.png'),
        fullPage: false,
      });
    });
  });
});
