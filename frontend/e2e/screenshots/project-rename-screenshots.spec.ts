/**
 * Project Danger Zone Screenshot Tests
 *
 * Captures the Danger Zone of a Browser profile's project settings: an
 * overview and the delete card, one test per color scheme. Renaming moves a
 * project on the server, so the rename card only appears on an Inkweld Server
 * profile and is not captured here.
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

  await expect(page.getByTestId('empty-state')).toBeVisible();

  await createProjectWithTwoSteps(page, projectTitle, projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  // Navigate to Settings tab
  await page.goto(`/demouser/${projectSlug}/settings`);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();

  // Click on the Danger Zone section in sidenav
  await page.getByTestId('nav-danger').click();

  // Wait for danger zone content. A Browser profile cannot rename.
  await expect(page.getByTestId('delete-project-card')).toBeVisible();
  await expect(page.getByTestId('rename-project-card')).toHaveCount(0);
}

async function captureDangerZoneScreenshots(
  page: Page,
  screenshotsDir: string,
  suffix: 'light' | 'dark'
): Promise<void> {
  const dangerZone = page.getByTestId('danger-zone-section');
  const deleteCard = page.getByTestId('delete-project-card');

  await test.step('danger zone overview', async () => {
    await expect(dangerZone).toBeVisible();

    await captureElementScreenshot(
      page,
      [dangerZone],
      join(screenshotsDir, `danger-zone-overview-${suffix}.png`),
      16
    );
  });

  await test.step('delete card', async () => {
    await deleteCard.scrollIntoViewIfNeeded();
    await expect(deleteCard).toBeVisible();

    await captureElementScreenshot(
      page,
      [deleteCard],
      join(screenshotsDir, `project-delete-card-${suffix}.png`),
      16
    );
  });
}

test.describe('Project Danger Zone Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test('danger zone screenshots — light mode', async ({
    offlinePage: page,
  }) => {
    await setupProjectAndSettings(page, 'rename-light', 'Rename Demo');
    await captureDangerZoneScreenshots(page, screenshotsDir, 'light');
    await expect(page.getByTestId('delete-project-card')).toBeVisible();
  });

  test('danger zone screenshots — dark mode', async ({ offlinePage: page }) => {
    await setupProjectAndSettings(page, 'rename-dark', 'Rename Demo');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.fonts.ready);
    await captureDangerZoneScreenshots(page, screenshotsDir, 'dark');
    await expect(page.getByTestId('delete-project-card')).toBeVisible();
  });
});
