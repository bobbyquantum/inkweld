/**
 * Tags Feature Screenshot Tests
 *
 * Captures screenshots demonstrating the tags management feature.
 * Consolidated 8 → 2 tests (one per color scheme); each captures the
 * empty state, create dialog, populated list, and edit dialog via
 * test.step in a single project.
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

async function openCreateTagDialog(
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

async function captureAllTagsScreenshots(
  page: Page,
  screenshotsDir: string,
  suffix: 'light' | 'dark'
): Promise<void> {
  await test.step('empty state', async () => {
    await page.screenshot({
      path: join(screenshotsDir, `tags-empty-${suffix}.png`),
      fullPage: false,
    });
  });

  await test.step('create tag dialog', async () => {
    await openCreateTagDialog(page, 'My Custom Tag', 3, 8);
    const dialog = page.getByTestId('tag-dialog-content');
    await captureElementScreenshot(
      page,
      [dialog],
      join(screenshotsDir, `tags-create-dialog-${suffix}.png`),
      16
    );
    await page.click('[data-testid="tag-dialog-cancel"]');
    await page.waitForTimeout(200);
  });

  await test.step('tags list with multiple tags', async () => {
    const tags: { name: string; icon: number; color: number }[] = [
      { name: 'Protagonist', icon: 0, color: 4 },
      { name: 'Draft', icon: 10, color: 7 },
      { name: 'Important', icon: 17, color: 0 },
      { name: 'Complete', icon: 9, color: 5 },
    ];

    for (const t of tags) {
      await openCreateTagDialog(page, t.name, t.icon, t.color);
      await page.click('[data-testid="tag-dialog-save"]');
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(200);

    const tagsTab = page.getByTestId('tags-tab');
    await captureElementScreenshot(
      page,
      [tagsTab],
      join(screenshotsDir, `tags-list-${suffix}.png`),
      32
    );
  });

  await test.step('edit tag dialog', async () => {
    // Edit the first tag in the list
    await page.locator('[data-testid="edit-tag-button"]').first().click();
    await page.getByTestId('tag-dialog-content').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    const dialog = page.getByTestId('tag-dialog-content');
    await captureElementScreenshot(
      page,
      [dialog],
      join(screenshotsDir, `tags-edit-dialog-${suffix}.png`),
      16
    );
    await page.click('[data-testid="tag-dialog-cancel"]');
  });
}

test.describe('Tags Feature Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test('tags screenshots — light mode', async ({ offlinePage: page }) => {
    await setupProjectAndTagsTab(page, 'tags-light', 'Tags Demo');
    await captureAllTagsScreenshots(page, screenshotsDir, 'light');
  });

  test('tags screenshots — dark mode', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectAndTagsTab(page, 'tags-dark', 'Tags Demo');
    await captureAllTagsScreenshots(page, screenshotsDir, 'dark');
  });
});
