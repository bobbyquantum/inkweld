/**
 * Relationship Chart Screenshot Tests
 *
 * Captures screenshots demonstrating the relationship chart feature:
 * - Full chart with sidebar (overview)
 * - Sidebar detail (layout, mode, elements, relationship types)
 * - Both light and dark mode variants
 *
 * Uses the worldbuilding-demo template which includes a pre-built
 * "Character Web" chart with curated elements and relationships.
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

    // Wait for project tree to be visible
    await page.waitForSelector('app-project-tree', { state: 'visible' });

    // Click on "Character Web" in the project tree (root-level element)
    await page
      .locator('[data-testid="element-Character Web"]')
      .click({ timeout: 10_000 });

    // Wait for the chart container to render
    await page.waitForSelector('[data-testid="chart-container"]', {
      state: 'visible',
      timeout: 10_000,
    });

    // Wait for the Cytoscape canvas to initialize (chart-area contains the canvas)
    await page.waitForSelector('[data-testid="chart-area"] canvas', {
      state: 'visible',
      timeout: 15_000,
    });

    // Give Cytoscape time to finish the layout animation
    await page.waitForTimeout(2000);
  }

  test.describe('Light Mode Screenshots', () => {
    test('relationship chart overview', async ({ offlinePage: page }) => {
      await setupProjectAndChart(
        page,
        'chart-overview-light',
        'Chart Overview Demo'
      );

      // Capture the full chart view: sidebar + chart area
      const chartContainer = page.locator('[data-testid="chart-container"]');

      await captureElementScreenshot(
        page,
        [chartContainer],
        join(screenshotsDir, 'relationship-chart-overview-light.png'),
        8
      );
    });

    test('relationship chart sidebar', async ({ offlinePage: page }) => {
      await setupProjectAndChart(
        page,
        'chart-sidebar-light',
        'Chart Sidebar Demo'
      );

      // Capture just the sidebar showing controls
      const sidebar = page.locator('[data-testid="chart-sidebar"]');

      await captureElementScreenshot(
        page,
        [sidebar],
        join(screenshotsDir, 'relationship-chart-sidebar-light.png'),
        8
      );
    });
  });

  test.describe('Dark Mode Screenshots', () => {
    test('relationship chart overview dark', async ({ offlinePage: page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectAndChart(
        page,
        'chart-overview-dark',
        'Chart Overview Demo'
      );

      const chartContainer = page.locator('[data-testid="chart-container"]');

      await captureElementScreenshot(
        page,
        [chartContainer],
        join(screenshotsDir, 'relationship-chart-overview-dark.png'),
        8
      );
    });

    test('relationship chart sidebar dark', async ({ offlinePage: page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectAndChart(
        page,
        'chart-sidebar-dark',
        'Chart Sidebar Demo'
      );

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
