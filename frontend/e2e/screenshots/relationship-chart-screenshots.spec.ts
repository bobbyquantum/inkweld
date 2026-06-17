/**
 * Relationship Chart Screenshot Tests
 *
 * Captures the relationship chart overview + sidebar in both light and
 * dark mode. Consolidated 4 → 2 tests; project setup runs once per
 * color scheme.
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

test.describe('Relationship Chart Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  /**
   * Helper to create a project from worldbuilding-demo and navigate to the
   * "Character Web" chart element.
   */
  async function setupProjectAndChart(
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

    await page.locator('[data-testid="element-Character Web"]').click();

    await page.waitForSelector('[data-testid="chart-container"]', {
      state: 'visible',
    });

    // Wait for the Cytoscape canvas to initialize.
    await page.waitForSelector('[data-testid="chart-area"] canvas', {
      state: 'visible',
    });

    // Give Cytoscape time to finish the layout animation.
    await page.waitForTimeout(2000);
  }

  test('relationship chart screenshots — light mode', async ({
    offlinePage: page,
  }) => {
    await setupProjectAndChart(page, 'chart-light', 'Chart Demo');
    await expect(page.locator('[data-testid="chart-container"]')).toBeVisible();

    await test.step('overview', async () => {
      const chartContainer = page.locator('[data-testid="chart-container"]');
      await captureElementScreenshot(
        page,
        [chartContainer],
        join(screenshotsDir, 'relationship-chart-overview-light.png'),
        8
      );
    });

    await test.step('sidebar', async () => {
      const sidebar = page.locator('[data-testid="chart-sidebar"]');
      await captureElementScreenshot(
        page,
        [sidebar],
        join(screenshotsDir, 'relationship-chart-sidebar-light.png'),
        8
      );
    });
  });

  test('relationship chart screenshots — dark mode', async ({
    offlinePage: page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectAndChart(page, 'chart-dark', 'Chart Demo');
    await expect(page.locator('[data-testid="chart-container"]')).toBeVisible();

    await test.step('overview', async () => {
      const chartContainer = page.locator('[data-testid="chart-container"]');
      await captureElementScreenshot(
        page,
        [chartContainer],
        join(screenshotsDir, 'relationship-chart-overview-dark.png'),
        8
      );
    });

    await test.step('sidebar', async () => {
      const sidebar = page.locator('[data-testid="chart-sidebar"]');
      await captureElementScreenshot(
        page,
        [sidebar],
        join(screenshotsDir, 'relationship-chart-sidebar-dark.png'),
        8
      );
    });
  });
});
