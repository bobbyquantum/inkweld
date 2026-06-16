/**
 * Project Rename Feature Screenshot Tests
 *
 * Captures screenshots demonstrating the project rename feature.
 * Consolidated 9 → 2 tests (one per color scheme); each captures the
 * collapsed rename card, expanded form, filled form, danger zone
 * overview, and delete card via test.step.
 */

import { type Page } from '@playwright/test';
import { join } from 'path';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

async function setupProjectAndSettings(
  page: Page,
  projectSlug: string,
  projectTitle: string
) {
  await page.goto('/');

  await expect(page.locator('.empty-state')).toBeVisible();

  await createProjectWithTwoSteps(page, projectTitle, projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  // Navigate to Settings tab
  await page.goto(`/demouser/${projectSlug}/settings`);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();

  // Click on the Danger Zone section in sidenav
  await page.getByTestId('nav-danger').click();

  // Wait for danger zone content
  await expect(page.getByTestId('rename-project-card')).toBeVisible();
  await page.waitForTimeout(500);
}

async function captureAllRenameScreenshots(
  page: Page,
  screenshotsDir: string,
  suffix: 'light' | 'dark'
): Promise<void> {
  const renameCard = page.locator('[data-testid="rename-project-card"]');
  const deleteCard = page.locator('[data-testid="delete-project-card"]');

  await test.step('rename card collapsed', async () => {
    await captureElementScreenshot(
      page,
      [renameCard],
      join(screenshotsDir, `project-rename-card-${suffix}.png`),
      16
    );
  });

  await test.step('rename form expanded (empty)', async () => {
    await page.click('[data-testid="rename-project-button"]');
    await expect(page.getByTestId('new-slug-input')).toBeVisible();
    await page.waitForTimeout(300);

    await captureElementScreenshot(
      page,
      [renameCard],
      join(screenshotsDir, `project-rename-form-${suffix}.png`),
      16
    );
  });

  // Light mode also captured a "filled" variant.
  if (suffix === 'light') {
    await test.step('rename form with new slug entered', async () => {
      await page.fill('[data-testid="new-slug-input"]', 'my-new-project-name');
      await page.waitForTimeout(300);

      await captureElementScreenshot(
        page,
        [renameCard],
        join(screenshotsDir, `project-rename-filled-${suffix}.png`),
        16
      );
    });
  }

  await test.step('danger zone overview', async () => {
    await deleteCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    await captureElementScreenshot(
      page,
      [renameCard, deleteCard],
      join(screenshotsDir, `danger-zone-overview-${suffix}.png`),
      16
    );
  });

  await test.step('delete card', async () => {
    await deleteCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    await captureElementScreenshot(
      page,
      [deleteCard],
      join(screenshotsDir, `project-delete-card-${suffix}.png`),
      16
    );
  });
}

test.describe('Project Rename Feature Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test('project rename screenshots — light mode', async ({
    offlinePage: page,
  }) => {
    await setupProjectAndSettings(page, 'rename-light', 'Rename Demo');
    await captureAllRenameScreenshots(page, screenshotsDir, 'light');
    await expect(page.getByTestId('delete-project-card')).toBeVisible();
  });

  test('project rename screenshots — dark mode', async ({
    offlinePage: page,
  }) => {
    await setupProjectAndSettings(page, 'rename-dark', 'Rename Demo');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(300);
    await captureAllRenameScreenshots(page, screenshotsDir, 'dark');
    await expect(page.getByTestId('delete-project-card')).toBeVisible();
  });
});
