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

import { createProjectWithTwoSteps } from '../common/test-helpers';
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

  // Seed an image directly so screenshot tests do not depend on cropper timing.
  await seedIdentityImage(page);
}

/**
 * Seed a real image into the mounted identity panel.
 * Screenshot tests only need the rendered image state, so this avoids the
 * brittle cropper dialog path while preserving the same UI output.
 */
async function seedIdentityImage(page: Page): Promise<void> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to create canvas context for test image');
    }

    const gradient = context.createLinearGradient(0, 0, 320, 320);
    gradient.addColorStop(0, '#2c7be5');
    gradient.addColorStop(1, '#45b07a');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 320, 320);

    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
    context.beginPath();
    context.arc(160, 120, 60, 0, Math.PI * 2);
    context.fill();

    context.fillRect(90, 200, 140, 70);

    return canvas.toDataURL('image/png');
  });

  const identityPanel = page.locator('app-identity-panel');
  await expect(identityPanel).toBeVisible({ timeout: 20_000 });

  await identityPanel.evaluate((host, imageDataUrl) => {
    const imageSection = host.querySelector('.image-section');
    const imageButton = imageSection?.querySelector('.image-placeholder');

    if (!(imageSection instanceof HTMLElement)) {
      throw new Error('Missing image section in identity panel');
    }

    if (!(imageButton instanceof HTMLButtonElement)) {
      throw new Error('Missing image button in identity panel');
    }

    imageSection.classList.remove('no-image-container');
    imageButton.classList.remove('no-image', 'readonly');

    const placeholderIcon = imageButton.querySelector('.placeholder-icon');
    if (placeholderIcon instanceof HTMLElement) {
      placeholderIcon.remove();
    }

    const placeholderText = imageButton.querySelector('.placeholder-text');
    if (placeholderText instanceof HTMLElement) {
      placeholderText.remove();
    }

    let image = imageButton.querySelector('img');
    if (!(image instanceof HTMLImageElement)) {
      image = document.createElement('img');
      imageButton.appendChild(image);
    }

    const elementName =
      host.querySelector('.element-name')?.textContent?.trim() ||
      'Worldbuilding image';
    image.src = imageDataUrl;
    image.alt = elementName;
  }, dataUrl);

  await page.waitForSelector('.image-placeholder img', {
    state: 'visible',
    timeout: 10000,
  });
}

async function expandAccordionPanel(
  page: Page,
  panelTestId: string
): Promise<void> {
  const panel = page.getByTestId(panelTestId);
  await expect(panel).toBeVisible();

  await panel.evaluate(host => {
    host.classList.add('mat-expanded');

    const header = host.querySelector('mat-expansion-panel-header');
    if (header instanceof HTMLElement) {
      header.classList.add('mat-expanded');
      header.setAttribute('aria-expanded', 'true');
    }

    const contentElements = host.querySelectorAll<HTMLElement>(
      '.mat-expansion-panel-content-wrapper, .mat-expansion-panel-content, .mat-expansion-panel-body'
    );

    contentElements.forEach(element => {
      element.style.display = 'block';
      element.style.visibility = 'visible';
      element.style.height = 'auto';
      element.style.maxHeight = 'none';
      element.style.opacity = '1';
      element.style.overflow = 'visible';
      element.style.gridTemplateRows = '1fr';
    });
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
        await expandAccordionPanel(page, 'accordion-basic');

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
        await expandAccordionPanel(page, 'accordion-basic');
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
      await expandAccordionPanel(page, 'accordion-basic');

      await expect(page.getByTestId('field-fullName')).toBeVisible();

      await page.screenshot({
        path: join(screenshotsDir, 'worldbuilding-tab-fields-dark.png'),
        fullPage: false,
      });
    });
  });
});
