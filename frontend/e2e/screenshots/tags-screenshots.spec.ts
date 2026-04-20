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

import { join } from 'node:path';

import { type Page } from '@playwright/test';

import {
  createProjectWithTwoSteps,
  fillTagDialog,
  openTagDialog,
  openTagsTab,
} from '../common/test-helpers';
import { test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

async function setupProjectAndTagsTab(
  page: Page,
  projectSlug: string,
  projectTitle: string
) {
  await page.goto('/');

  await page.getByTestId('empty-state').waitFor({ state: 'visible' });

  await createProjectWithTwoSteps(page, projectTitle, projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  // Navigate to Settings > Tags via shared helper
  await openTagsTab(page, projectSlug);
  await page.waitForTimeout(500);
}

async function createTag(
  page: Page,
  name: string,
  iconIndex: number = 0,
  colorIndex: number = 0
) {
  await openTagDialog(page);
  await page.waitForTimeout(300);

  await fillTagDialog(page, name, iconIndex, colorIndex);

  await page.waitForTimeout(200);
}

test.describe('Tags Feature Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

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
      const tagsTab = page.getByTestId('tags-tab');
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
      const dialog = page.getByTestId('tag-dialog-content');
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

      // Click edit on the tag directly
      await page.click('[data-testid="edit-tag-button"]');

      await page.getByTestId('tag-dialog-content').waitFor({
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Capture the edit dialog
      const dialog = page.getByTestId('tag-dialog-content');
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
      const tagsTab = page.getByTestId('tags-tab');
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
      const dialog = page.getByTestId('tag-dialog-content');
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

      // Click edit on the tag directly
      await page.click('[data-testid="edit-tag-button"]');

      await page.getByTestId('tag-dialog-content').waitFor({
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Capture the edit dialog in dark mode
      const dialog = page.getByTestId('tag-dialog-content');
      await captureElementScreenshot(
        page,
        [dialog],
        join(screenshotsDir, 'tags-edit-dialog-dark.png'),
        16
      );
    });
  });
});
