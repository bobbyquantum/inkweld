/**
 * Tags Feature Screenshot Tests
 *
 * Captures comprehensive screenshots demonstrating the tags management feature:
 * - Tags tab with list of tags
 * - Create tag dialog with icon and color selection
 * - Edit tag dialog
 * - Tag chips on elements
 *
 * Screenshots are cropped to show only the relevant UI elements with padding
 * for cleaner documentation images.
 */

import { Locator, Page } from '@playwright/test';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { test } from './fixtures';

/**
 * Helper to capture a cropped screenshot around specific elements with padding
 */
async function captureElementScreenshot(
  page: Page,
  elements: Locator[],
  path: string,
  padding = 24
): Promise<void> {
  const boxes: { x: number; y: number; width: number; height: number }[] = [];

  for (const element of elements) {
    if (await element.isVisible().catch(() => false)) {
      const box = await element.boundingBox();
      if (box) {
        boxes.push(box);
      }
    }
  }

  if (boxes.length === 0) {
    await page.screenshot({ path, fullPage: false });
    return;
  }

  const minX = Math.max(0, Math.min(...boxes.map(b => b.x)) - padding);
  const minY = Math.max(0, Math.min(...boxes.map(b => b.y)) - padding);
  const maxX = Math.max(...boxes.map(b => b.x + b.width)) + padding;
  const maxY = Math.max(...boxes.map(b => b.y + b.height)) + padding;

  const viewport = page.viewportSize();
  const clipWidth = Math.min(maxX - minX, (viewport?.width || 1280) - minX);
  const clipHeight = Math.min(maxY - minY, (viewport?.height || 800) - minY);

  // Safeguard against invalid clip dimensions
  if (clipWidth <= 0 || clipHeight <= 0) {
    await page.screenshot({ path, fullPage: false });
    return;
  }

  await page.screenshot({
    path,
    clip: {
      x: minX,
      y: minY,
      width: clipWidth,
      height: clipHeight,
    },
  });
}

test.describe('Tags Feature Screenshots', () => {
  const screenshotsDir = join(
    process.cwd(),
    '..',
    'docs',
    'site',
    'static',
    'img',
    'features'
  );

  test.beforeAll(async () => {
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true });
    }
  });

  /**
   * Helper to create a project and navigate to tags tab
   * (Tags is now a sub-tab within Project Settings)
   */
  async function setupProjectAndTagsTab(
    page: Page,
    projectSlug: string,
    projectTitle: string
  ) {
    await page.goto('/');

    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    await page.click('button:has-text("Create Project")');

    // Step 1: Template selection - click Next to proceed
    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.waitFor({ state: 'visible' });
    await nextButton.click();

    // Step 2: Fill in project details
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
    });

    await page.fill('input[data-testid="project-title-input"]', projectTitle);
    await page.fill('input[data-testid="project-slug-input"]', projectSlug);

    await page.click('button[data-testid="create-project-button"]');

    await page.waitForURL(new RegExp(`/demouser/${projectSlug}`), {});

    // Navigate to Settings tab first
    await page.goto(`/demouser/${projectSlug}/settings`);
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    // Click on the "Tags" inner tab
    await page.getByRole('tab', { name: 'Tags' }).click();

    // Wait for tags container
    await page.waitForSelector('.tags-tab', {
      state: 'visible',
    });
    await page.waitForTimeout(500);
  }

  /**
   * Helper to create a sample tag
   */
  async function createTag(
    page: Page,
    name: string,
    iconIndex: number = 0,
    colorIndex: number = 0
  ) {
    // Click new tag button
    await page.click('[data-testid="new-tag-button"]');

    // Wait for dialog
    await page.waitForSelector('mat-dialog-container', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    // Enter name
    await page.fill('input[placeholder="Enter tag name"]', name);

    // Select icon (click the nth icon button)
    const iconButtons = page.locator('.icon-button');
    if ((await iconButtons.count()) > iconIndex) {
      await iconButtons.nth(iconIndex).click();
    }

    // Select color (click the nth color button)
    const colorButtons = page.locator('.color-button');
    if ((await colorButtons.count()) > colorIndex) {
      await colorButtons.nth(colorIndex).click();
    }

    await page.waitForTimeout(200);
  }

  test.describe('Light Mode Screenshots', () => {
    test('tags tab empty state', async ({ offlinePage: page }) => {
      await setupProjectAndTagsTab(page, 'tags-empty-light', 'Tags Demo');

      // Capture empty state
      await page.screenshot({
        path: join(screenshotsDir, 'tags-empty-light.png'),
        fullPage: false,
      });
    });

    test('tags tab with tags', async ({ offlinePage: page }) => {
      await setupProjectAndTagsTab(page, 'tags-list-light', 'Tags Demo');

      // Create some sample tags
      await createTag(page, 'Protagonist', 0, 4); // Star icon, green
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(300);

      await createTag(page, 'Draft', 10, 7); // Pending icon, blue
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(300);

      await createTag(page, 'Important', 17, 0); // Priority high icon, red
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(300);

      await createTag(page, 'Complete', 9, 5); // Check circle icon, sea green
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(500);

      // Capture the tags list
      const tagsTab = page.locator('.tags-tab');
      await captureElementScreenshot(
        page,
        [tagsTab],
        join(screenshotsDir, 'tags-list-light.png'),
        32
      );
    });

    test('create tag dialog', async ({ offlinePage: page }) => {
      await setupProjectAndTagsTab(page, 'tags-dialog-light', 'Tags Demo');

      // Open create dialog
      await createTag(page, 'My Custom Tag', 3, 8);

      // Capture the dialog
      const dialog = page.locator('mat-dialog-container');
      await captureElementScreenshot(
        page,
        [dialog],
        join(screenshotsDir, 'tags-create-dialog-light.png'),
        16
      );

      // Close dialog
      await page.click('[data-testid="tag-dialog-cancel"]');
    });

    test('edit tag dialog', async ({ offlinePage: page }) => {
      await setupProjectAndTagsTab(page, 'tags-edit-light', 'Tags Demo');

      // Create a tag first
      await createTag(page, 'Original Tag', 0, 0);
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(500);

      // Click edit on the tag - first open the menu, then click edit
      await page.click('[data-testid="tag-menu-trigger"]');
      await page.waitForTimeout(200);
      await page.click('[data-testid="edit-tag-button"]');

      await page.waitForSelector('mat-dialog-container', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Capture the edit dialog
      const dialog = page.locator('mat-dialog-container');
      await captureElementScreenshot(
        page,
        [dialog],
        join(screenshotsDir, 'tags-edit-dialog-light.png'),
        16
      );
    });
  });

  test.describe('Dark Mode Screenshots', () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
    });

    test('tags tab empty state in dark mode', async ({ offlinePage: page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await setupProjectAndTagsTab(page, 'tags-empty-dark', 'Tags Demo');

      // Capture empty state in dark mode
      await page.screenshot({
        path: join(screenshotsDir, 'tags-empty-dark.png'),
        fullPage: false,
      });
    });

    test('tags tab with tags in dark mode', async ({ offlinePage: page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await setupProjectAndTagsTab(page, 'tags-list-dark', 'Tags Demo');

      // Create some sample tags
      await createTag(page, 'Protagonist', 0, 4);
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(300);

      await createTag(page, 'Draft', 10, 7);
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(300);

      await createTag(page, 'Important', 17, 0);
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(300);

      await createTag(page, 'Complete', 9, 5);
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(500);

      // Capture the tags list in dark mode
      const tagsTab = page.locator('.tags-tab');
      await captureElementScreenshot(
        page,
        [tagsTab],
        join(screenshotsDir, 'tags-list-dark.png'),
        32
      );
    });

    test('create tag dialog in dark mode', async ({ offlinePage: page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await setupProjectAndTagsTab(page, 'tags-dialog-dark', 'Tags Demo');

      // Open create dialog
      await createTag(page, 'Dark Mode Tag', 5, 10);

      // Capture the dialog
      const dialog = page.locator('mat-dialog-container');
      await captureElementScreenshot(
        page,
        [dialog],
        join(screenshotsDir, 'tags-create-dialog-dark.png'),
        16
      );

      // Close dialog
      await page.click('[data-testid="tag-dialog-cancel"]');
    });

    test('edit tag dialog in dark mode', async ({ offlinePage: page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await setupProjectAndTagsTab(page, 'tags-edit-dark', 'Tags Demo');

      // Create a tag first
      await createTag(page, 'Original Tag', 0, 0);
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(500);

      // Click edit on the tag - first open the menu, then click edit
      await page.click('[data-testid="tag-menu-trigger"]');
      await page.waitForTimeout(200);
      await page.click('[data-testid="edit-tag-button"]');

      await page.waitForSelector('mat-dialog-container', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Capture the edit dialog in dark mode
      const dialog = page.locator('mat-dialog-container');
      await captureElementScreenshot(
        page,
        [dialog],
        join(screenshotsDir, 'tags-edit-dialog-dark.png'),
        16
      );
    });
  });
});
