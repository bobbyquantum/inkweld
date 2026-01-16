/**
 * Quick Open Screenshot Tests
 *
 * Captures screenshots demonstrating the Quick Open feature:
 * - Quick Open dialog with recent files
 * - Quick Open with search query and filtered results
 * - Both light and dark mode variants
 *
 * Screenshots are stored in docs/site/static/img/features/
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

/**
 * Helper to create a project with some documents for Quick Open testing
 */
async function setupProjectWithDocuments(
  page: Page,
  projectSlug: string,
  projectTitle: string
): Promise<void> {
  await page.goto('/');

  // Wait for empty state (local/offline mode)
  await page.waitForSelector('.empty-state', {
    state: 'visible',
    timeout: 5000,
  });

  // Click create project button
  await page.click('button:has-text("Create Project")');

  // Step 1: Template selection - click Next to proceed
  const nextButton = page.getByRole('button', { name: /next/i });
  await nextButton.waitFor({ state: 'visible', timeout: 5000 });
  await nextButton.click();

  // Step 2: Fill in project details
  await page.waitForSelector('input[data-testid="project-title-input"]', {
    state: 'visible',
    timeout: 3000,
  });

  await page.fill('input[data-testid="project-title-input"]', projectTitle);
  await page.fill('input[data-testid="project-slug-input"]', projectSlug);

  await page.click('button[data-testid="create-project-button"]');

  // Wait for project to load
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`), {
    timeout: 5000,
  });

  await page.waitForSelector('[data-testid="project-tree"]', {
    state: 'visible',
    timeout: 5000,
  });

  // Create some documents to show in Quick Open
  const documentNames = [
    'Chapter One - The Beginning',
    'Chapter Two - The Journey',
    'Chapter Three - The Conflict',
    'Notes and Ideas',
  ];

  for (const name of documentNames) {
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await newDocButton.click();

    // Select "Document" from type chooser
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    // Fill in name
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible', timeout: 5000 });
    await dialogInput.fill(name);
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(300);
  }
}

test.describe('Quick Open Screenshots', () => {
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
    // Ensure screenshots directory exists
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true });
    }
  });

  test.describe('Light Mode', () => {
    test('Quick Open dialog with recent files', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      await setupProjectWithDocuments(page, 'quick-open-demo-1', 'My Novel');

      // Open Quick Open with keyboard shortcut
      const isMac = process.platform === 'darwin';
      await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');

      // Wait for dialog to appear
      await page.waitForSelector('[data-testid="quick-open-dialog"]', {
        state: 'visible',
        timeout: 3000,
      });

      // Wait for results to populate
      await page.waitForTimeout(300);

      // Capture screenshot of the dialog
      await captureElementScreenshot(
        page,
        [page.locator('[data-testid="quick-open-dialog"]')],
        join(screenshotsDir, 'quick-open-dialog-light.png'),
        16
      );

      // Close dialog
      await page.keyboard.press('Escape');
    });

    test('Quick Open with search query', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      await setupProjectWithDocuments(page, 'quick-open-demo-2', 'My Novel');

      // Open Quick Open
      const isMac = process.platform === 'darwin';
      await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');

      // Wait for dialog
      await page.waitForSelector('[data-testid="quick-open-dialog"]', {
        state: 'visible',
        timeout: 3000,
      });

      // Type search query
      await page.getByTestId('quick-open-search').fill('chapter');
      await page.waitForTimeout(300);

      // Capture screenshot with search results
      await captureElementScreenshot(
        page,
        [page.locator('[data-testid="quick-open-dialog"]')],
        join(screenshotsDir, 'quick-open-search-light.png'),
        16
      );

      // Close dialog
      await page.keyboard.press('Escape');
    });
  });

  test.describe('Dark Mode', () => {
    test('Quick Open dialog - dark mode', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectWithDocuments(page, 'quick-open-demo-3', 'My Novel');

      // Open Quick Open
      const isMac = process.platform === 'darwin';
      await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');

      // Wait for dialog
      await page.waitForSelector('[data-testid="quick-open-dialog"]', {
        state: 'visible',
        timeout: 3000,
      });
      await page.waitForTimeout(300);

      // Capture screenshot
      await captureElementScreenshot(
        page,
        [page.locator('[data-testid="quick-open-dialog"]')],
        join(screenshotsDir, 'quick-open-dialog-dark.png'),
        16
      );

      // Close dialog
      await page.keyboard.press('Escape');
    });

    test('Quick Open with search - dark mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectWithDocuments(page, 'quick-open-demo-4', 'My Novel');

      // Open Quick Open
      const isMac = process.platform === 'darwin';
      await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');

      // Wait for dialog
      await page.waitForSelector('[data-testid="quick-open-dialog"]', {
        state: 'visible',
        timeout: 3000,
      });

      // Type search
      await page.getByTestId('quick-open-search').fill('chapter');
      await page.waitForTimeout(300);

      // Capture screenshot
      await captureElementScreenshot(
        page,
        [page.locator('[data-testid="quick-open-dialog"]')],
        join(screenshotsDir, 'quick-open-search-dark.png'),
        16
      );

      // Close dialog
      await page.keyboard.press('Escape');
    });
  });
});
