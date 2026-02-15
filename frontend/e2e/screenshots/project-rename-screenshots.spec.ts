/**
 * Project Rename Feature Screenshot Tests
 *
 * Captures comprehensive screenshots demonstrating the project rename feature:
 * - Rename project card in danger zone
 * - Rename form with slug input
 * - Rename confirmation state
 *
 * Screenshots are cropped to show only the relevant UI elements with padding
 * for cleaner documentation images.
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

test.describe('Project Rename Feature Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  /**
   * Helper to create a project and navigate to settings danger zone
   */
  async function setupProjectAndSettings(
    page: Page,
    projectSlug: string,
    projectTitle: string
  ) {
    await page.goto('/');

    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    await createProjectWithTwoSteps(page, projectTitle, projectSlug);
    await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

    // Navigate to Settings tab
    await page.goto(`/demouser/${projectSlug}/settings`);
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    // Click on the "Danger Zone" inner tab
    await page.getByRole('tab', { name: 'Danger Zone' }).click();

    // Wait for danger zone content
    await page.waitForSelector('[data-testid="rename-project-card"]', {
      state: 'visible',
    });
    await page.waitForTimeout(500);
  }

  test.describe('Light Mode Screenshots', () => {
    test('rename project card - collapsed state', async ({
      offlinePage: page,
    }) => {
      await setupProjectAndSettings(
        page,
        'rename-demo-light',
        'Rename Demo Project'
      );

      // Capture the rename card in its initial collapsed state
      const renameCard = page.locator('[data-testid="rename-project-card"]');
      await captureElementScreenshot(
        page,
        [renameCard],
        join(screenshotsDir, 'project-rename-card-light.png'),
        16
      );
    });

    test('rename project form - expanded state', async ({
      offlinePage: page,
    }) => {
      await setupProjectAndSettings(
        page,
        'rename-form-light',
        'Rename Form Demo'
      );

      // Click the rename button to show the form
      await page.click('[data-testid="rename-project-button"]');
      await page.waitForSelector('[data-testid="new-slug-input"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Capture the expanded form
      const renameCard = page.locator('[data-testid="rename-project-card"]');
      await captureElementScreenshot(
        page,
        [renameCard],
        join(screenshotsDir, 'project-rename-form-light.png'),
        16
      );
    });

    test('rename project form - with new slug entered', async ({
      offlinePage: page,
    }) => {
      await setupProjectAndSettings(
        page,
        'rename-filled-light',
        'Rename Filled Demo'
      );

      // Click the rename button to show the form
      await page.click('[data-testid="rename-project-button"]');
      await page.waitForSelector('[data-testid="new-slug-input"]', {
        state: 'visible',
      });

      // Fill in a new slug
      await page.fill('[data-testid="new-slug-input"]', 'my-new-project-name');
      await page.waitForTimeout(300);

      // Capture the form with a valid slug entered
      const renameCard = page.locator('[data-testid="rename-project-card"]');
      await captureElementScreenshot(
        page,
        [renameCard],
        join(screenshotsDir, 'project-rename-filled-light.png'),
        16
      );
    });

    test('danger zone overview - with rename and delete cards', async ({
      offlinePage: page,
    }) => {
      await setupProjectAndSettings(
        page,
        'danger-zone-light',
        'Danger Zone Demo'
      );

      // Capture both danger cards together
      const renameCard = page.locator('[data-testid="rename-project-card"]');
      const deleteCard = page.locator('[data-testid="delete-project-card"]');

      // Scroll the delete card into view to ensure both cards are visible
      await deleteCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      await captureElementScreenshot(
        page,
        [renameCard, deleteCard],
        join(screenshotsDir, 'danger-zone-overview-light.png'),
        16
      );
    });

    test('delete project card', async ({ offlinePage: page }) => {
      await setupProjectAndSettings(
        page,
        'delete-card-light',
        'Delete Card Demo'
      );

      // Capture just the delete card
      const deleteCard = page.locator('[data-testid="delete-project-card"]');
      await deleteCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      await captureElementScreenshot(
        page,
        [deleteCard],
        join(screenshotsDir, 'project-delete-card-light.png'),
        16
      );
    });
  });

  test.describe('Dark Mode Screenshots', () => {
    test('rename project card - dark mode', async ({ offlinePage: page }) => {
      await setupProjectAndSettings(
        page,
        'rename-demo-dark',
        'Rename Demo Dark'
      );

      // Toggle dark mode
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(300);

      // Capture the rename card in dark mode
      const renameCard = page.locator('[data-testid="rename-project-card"]');
      await captureElementScreenshot(
        page,
        [renameCard],
        join(screenshotsDir, 'project-rename-card-dark.png'),
        16
      );
    });

    test('rename project form - dark mode', async ({ offlinePage: page }) => {
      await setupProjectAndSettings(
        page,
        'rename-form-dark',
        'Rename Form Dark'
      );

      // Toggle dark mode
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(300);

      // Click the rename button to show the form
      await page.click('[data-testid="rename-project-button"]');
      await page.waitForSelector('[data-testid="new-slug-input"]', {
        state: 'visible',
      });

      // Fill in a new slug
      await page.fill('[data-testid="new-slug-input"]', 'my-new-project-name');
      await page.waitForTimeout(300);

      // Capture the form in dark mode
      const renameCard = page.locator('[data-testid="rename-project-card"]');
      await captureElementScreenshot(
        page,
        [renameCard],
        join(screenshotsDir, 'project-rename-form-dark.png'),
        16
      );
    });

    test('danger zone overview - dark mode', async ({ offlinePage: page }) => {
      await setupProjectAndSettings(
        page,
        'danger-zone-dark',
        'Danger Zone Dark'
      );

      // Toggle dark mode
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(300);

      // Capture both danger cards together
      const renameCard = page.locator('[data-testid="rename-project-card"]');
      const deleteCard = page.locator('[data-testid="delete-project-card"]');

      // Scroll the delete card into view to ensure both cards are visible
      await deleteCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      await captureElementScreenshot(
        page,
        [renameCard, deleteCard],
        join(screenshotsDir, 'danger-zone-overview-dark.png'),
        16
      );
    });

    test('delete project card - dark mode', async ({ offlinePage: page }) => {
      await setupProjectAndSettings(
        page,
        'delete-card-dark',
        'Delete Card Dark'
      );

      // Toggle dark mode
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.waitForTimeout(300);

      // Capture just the delete card
      const deleteCard = page.locator('[data-testid="delete-project-card"]');
      await deleteCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);

      await captureElementScreenshot(
        page,
        [deleteCard],
        join(screenshotsDir, 'project-delete-card-dark.png'),
        16
      );
    });
  });
});
