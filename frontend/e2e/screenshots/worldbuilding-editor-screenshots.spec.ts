/**
 * Worldbuilding Editor Desktop Screenshot Tests
 *
 * Captures screenshots of the worldbuilding editor in desktop sidenav mode
 * (the primary editing experience at viewports >= 760px).
 *
 * Uses the worldbuilding-demo project template which ships with pre-built
 * schemas (Character, Location) and seeded elements with data.
 *
 * Screenshots captured (per color scheme):
 * - Full editor overview (sidenav + identity content)
 * - Schema tab with fields (Basic Info)
 * - Relationships section
 * - Media section
 * - Status bar (tags, snapshots, sync)
 */

import { type Page } from '@playwright/test';
import { join } from 'path';

import {
  createProjectWithTwoSteps,
  dismissToastIfPresent,
} from '../common/test-helpers';
import { expect, test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

test.describe('Worldbuilding Editor Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  async function setupProjectAndOpenCharacter(
    page: Page,
    projectSlug: string,
    projectTitle: string
  ): Promise<void> {
    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      projectTitle,
      projectSlug,
      undefined,
      'worldbuilding-demo'
    );

    await page.waitForSelector('app-project-tree', { state: 'visible' });
    await dismissToastIfPresent(page);

    const charactersFolder = page.locator(
      '[data-testid="expand-folder-button"]'
    );
    const folderCount = await charactersFolder.count();
    for (let i = 0; i < folderCount; i++) {
      const btn = charactersFolder.nth(i);
      const parent = btn.locator('..');
      const text = await parent.textContent();
      if (text?.includes('Characters')) {
        await btn.click();
        break;
      }
    }

    await page
      .locator('[data-testid="element-Elara Nightwhisper"]')
      .waitFor({ state: 'visible' });
    await page.locator('[data-testid="element-Elara Nightwhisper"]').click();

    await page.waitForURL(/\/worldbuilding\//);
    await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
    await expect(page.getByTestId('wb-sidenav')).toBeVisible();
  }

  async function captureEditorScreenshots(
    page: Page,
    suffix: 'light' | 'dark'
  ): Promise<void> {
    await test.step('editor overview (sidenav + identity)', async () => {
      await page.getByTestId('nav-identity').click();
      await page.waitForTimeout(300);

      const container = page.locator('.worldbuilding-editor-container');
      await captureElementScreenshot(
        page,
        [container],
        join(screenshotsDir, `worldbuilding-editor-overview-${suffix}.png`),
        0
      );
    });

    await test.step('schema tab fields (Basic Info)', async () => {
      await page.getByTestId('nav-basic').click();
      await page.waitForTimeout(300);

      await expect(page.getByTestId('field-fullName')).toBeVisible();

      const container = page.locator('.worldbuilding-editor-container');
      await captureElementScreenshot(
        page,
        [container],
        join(screenshotsDir, `worldbuilding-editor-fields-${suffix}.png`),
        0
      );
    });

    await test.step('relationships section', async () => {
      await page.getByTestId('nav-relationships').click();
      await page.waitForTimeout(300);

      const container = page.locator('.worldbuilding-editor-container');
      await captureElementScreenshot(
        page,
        [container],
        join(
          screenshotsDir,
          `worldbuilding-editor-relationships-${suffix}.png`
        ),
        0
      );
    });

    await test.step('media section', async () => {
      await page.getByTestId('nav-media').click();
      await page.waitForTimeout(300);

      const container = page.locator('.worldbuilding-editor-container');
      await captureElementScreenshot(
        page,
        [container],
        join(screenshotsDir, `worldbuilding-editor-media-${suffix}.png`),
        0
      );
    });

    await test.step('status bar', async () => {
      const statusBar = page.getByTestId('editor-status-bar');
      await captureElementScreenshot(
        page,
        [statusBar],
        join(screenshotsDir, `worldbuilding-editor-statusbar-${suffix}.png`),
        8
      );
    });

    await test.step('sidenav', async () => {
      const sidenav = page.getByTestId('wb-sidenav');
      await captureElementScreenshot(
        page,
        [sidenav],
        join(screenshotsDir, `worldbuilding-editor-sidenav-${suffix}.png`),
        8
      );
    });
  }

  test('worldbuilding editor — light mode', async ({ offlinePage: page }) => {
    await setupProjectAndOpenCharacter(page, 'wb-editor-light', 'Editor Demo');
    await captureEditorScreenshots(page, 'light');
  });

  test('worldbuilding editor — dark mode', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectAndOpenCharacter(page, 'wb-editor-dark', 'Editor Demo');
    await captureEditorScreenshots(page, 'dark');
  });
});
