/**
 * Worldbuilding Mobile Screenshot Tests
 *
 * Captures screenshots of worldbuilding screens at mobile viewport sizes
 * to verify the drill-in navigation system works correctly on phones and
 * small tablets.
 *
 * Mobile layout uses a drill-in pattern:
 * - Overview: compact header + section cards (Identity, tabs, Relationships)
 * - Detail: back header + full section content
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

import { Page } from '@playwright/test';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { DEMO_ASSETS, getDemoAssetPath } from '../common/test-helpers';
import { expect, test } from './fixtures';

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
 * On mobile, the editor opens to the drill-in overview.
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

  // Create a project
  await page.click('button:has-text("Create Project")');

  // Step 1: Template selection - click Next
  const nextButton = page.getByRole('button', { name: /next/i });
  await nextButton.waitFor({ state: 'visible' });
  await nextButton.click();

  // Step 2: Fill in project details
  await page.waitForSelector('input[data-testid="project-title-input"]', {
    state: 'visible',
  });
  await page.fill(
    'input[data-testid="project-title-input"]',
    'Mobile Test Project'
  );
  await page.fill('input[data-testid="project-slug-input"]', projectSlug);
  await page.click('button[data-testid="create-project-button"]');
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`), {});

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

  // Upload a REAL image through the dialog (not CSS faking)
  await uploadRealImage(page);

  // Now resize to mobile viewport — this triggers drill-in overview mode
  await page.setViewportSize(mobileViewport);
  // Wait for layout to settle after resize
  await page.waitForTimeout(500);
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
  const screenshotsDir = join(
    process.cwd(),
    '..',
    'docs',
    'site',
    'static',
    'img',
    'features',
    'mobile'
  );

  test.beforeAll(async () => {
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true });
    }
  });

  for (const [viewportName, viewport] of Object.entries(MOBILE_VIEWPORTS)) {
    test.describe(`${viewportName} (${viewport.width}x${viewport.height})`, () => {
      test(`drill-in overview`, async ({ offlinePage: page }) => {
        await setupWorldbuildingAtMobile(
          page,
          `mobile-overview-${viewportName.toLowerCase()}`,
          'character-v1',
          'Test Character',
          viewport
        );

        // On mobile, the editor should show the drill-in overview
        const sectionList = page.getByTestId('mobile-section-list');
        await expect(sectionList).toBeVisible();

        // Verify section cards are present
        await expect(page.getByTestId('drill-identity')).toBeVisible();
        await expect(page.getByTestId('drill-relationships')).toBeVisible();

        // Verify identity panel and editor section are hidden
        await expect(page.locator('app-identity-panel')).toBeHidden();
        await expect(page.locator('.editor-section')).toBeHidden();

        // Screenshot: overview with section cards
        await page.screenshot({
          path: join(
            screenshotsDir,
            `worldbuilding-overview-${viewportName}.png`
          ),
          fullPage: false,
        });
      });

      test(`drill into identity`, async ({ offlinePage: page }) => {
        await setupWorldbuildingAtMobile(
          page,
          `mobile-identity-${viewportName.toLowerCase()}`,
          'character-v1',
          'Identity Test',
          viewport
        );

        // Drill into identity section
        await page.getByTestId('drill-identity').click();
        await page.waitForTimeout(300);

        // Verify detail header with back button
        await expect(page.getByTestId('mobile-detail-header')).toBeVisible();
        await expect(page.getByTestId('mobile-back-button')).toBeVisible();

        // Verify identity panel is visible in full layout
        await expect(page.locator('app-identity-panel')).toBeVisible();

        // Screenshot: identity panel drilled in
        await page.screenshot({
          path: join(
            screenshotsDir,
            `worldbuilding-identity-${viewportName}.png`
          ),
          fullPage: false,
        });

        // Verify back button returns to overview
        await page.getByTestId('mobile-back-button').click();
        await page.waitForTimeout(300);
        await expect(page.getByTestId('mobile-section-list')).toBeVisible();
      });

      test(`drill into tab fields`, async ({ offlinePage: page }) => {
        await setupWorldbuildingAtMobile(
          page,
          `mobile-tab-${viewportName.toLowerCase()}`,
          'character-v1',
          'Tab Fields Test',
          viewport
        );

        // Find and click the first tab section card (e.g., "Basic Info")
        const firstTabCard = page.locator(
          '.mobile-section-card:not([data-testid="drill-identity"]):not([data-testid="drill-relationships"])'
        );
        await firstTabCard.first().click();
        await page.waitForTimeout(300);

        // Verify detail header is visible
        await expect(page.getByTestId('mobile-detail-header')).toBeVisible();

        // Verify editor section is visible (with tab bar hidden)
        await expect(page.locator('.editor-section')).toBeVisible();

        // Verify form fields are visible
        const formFields = page.locator('.field-container');
        const fieldCount = await formFields.count();
        expect(fieldCount).toBeGreaterThan(0);

        // Screenshot: tab fields drilled in
        await page.screenshot({
          path: join(
            screenshotsDir,
            `worldbuilding-tab-fields-${viewportName}.png`
          ),
          fullPage: false,
        });
      });

      test(`no overflow in drilled tab`, async ({ offlinePage: page }) => {
        await setupWorldbuildingAtMobile(
          page,
          `mobile-ovf-${viewportName.toLowerCase()}`,
          'character-v1',
          'Overflow Check',
          viewport
        );

        // Drill into a tab to check field overflow
        const firstTabCard = page.locator(
          '.mobile-section-card:not([data-testid="drill-identity"]):not([data-testid="drill-relationships"])'
        );
        await firstTabCard.first().click();
        await page.waitForTimeout(300);

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
        const formFields = page.locator('.field-container');
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
    test('drill-in overview - dark mode', async ({ offlinePage: page }) => {
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

      // Verify overview is visible
      await expect(page.getByTestId('mobile-section-list')).toBeVisible();

      await page.screenshot({
        path: join(screenshotsDir, 'worldbuilding-overview-dark.png'),
        fullPage: false,
      });
    });

    test('drill into identity - dark mode', async ({ offlinePage: page }) => {
      await setupWorldbuildingAtMobile(
        page,
        'mobile-dark-identity',
        'character-v1',
        'Dark Identity',
        darkViewport
      );

      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(400);

      // Drill into identity
      await page.getByTestId('drill-identity').click();
      await page.waitForTimeout(300);

      await expect(page.getByTestId('mobile-detail-header')).toBeVisible();
      await expect(page.locator('app-identity-panel')).toBeVisible();

      await page.screenshot({
        path: join(screenshotsDir, 'worldbuilding-identity-dark.png'),
        fullPage: false,
      });
    });

    test('drill into tab fields - dark mode', async ({ offlinePage: page }) => {
      await setupWorldbuildingAtMobile(
        page,
        'mobile-dark-tab',
        'character-v1',
        'Dark Tab Fields',
        darkViewport
      );

      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(400);

      // Drill into the first tab
      const firstTabCard = page.locator(
        '.mobile-section-card:not([data-testid="drill-identity"]):not([data-testid="drill-relationships"])'
      );
      await firstTabCard.first().click();
      await page.waitForTimeout(300);

      await expect(page.getByTestId('mobile-detail-header')).toBeVisible();
      await expect(page.locator('.editor-section')).toBeVisible();

      await page.screenshot({
        path: join(screenshotsDir, 'worldbuilding-tab-fields-dark.png'),
        fullPage: false,
      });
    });
  });
});
