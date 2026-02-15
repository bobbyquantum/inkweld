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

import { Page } from '@playwright/test';
import { join } from 'path';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

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
  });

  await createProjectWithTwoSteps(page, projectTitle, projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  await page.waitForSelector('[data-testid="project-tree"]', {
    state: 'visible',
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
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill(name);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });
  }
}

test.describe('Quick Open Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
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
