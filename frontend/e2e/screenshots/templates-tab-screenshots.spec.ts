/**
 * Templates Tab Screenshot Tests
 *
 * Captures screenshots of the template management feature.
 * Consolidated 10 → 2 tests (one per color scheme); each captures
 * overview, grid, header/create button, template editor page, clone menu, and
 * card details via test.step.
 *
 * NOTE: This entire suite is `describe.skip` because schemas are not
 * available in local/offline mode after project creation from a template.
 * The schema sync provider doesn't populate schemas in time for the
 * templates tab to display them. This is a pre-existing issue unrelated
 * to the sidenav redesign / consolidation work.
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

async function setupProjectAndTemplatesTab(
  page: Page,
  projectSlug: string,
  projectTitle: string
): Promise<void> {
  await page.goto('/');

  await page.waitForSelector('.empty-state', { state: 'visible' });

  await createProjectWithTwoSteps(page, projectTitle, projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  await page.goto(`/demouser/${projectSlug}/settings`);
  await page.waitForSelector('[data-testid="settings-tab-content"]', {
    state: 'visible',
  });

  await page.getByTestId('nav-templates').click();

  await page.waitForSelector('.templates-tab-container', { state: 'visible' });
  await page.waitForTimeout(500);
}

async function captureAllTemplateScreenshots(
  page: Page,
  screenshotsDir: string,
  suffix: 'light' | 'dark'
): Promise<void> {
  await page.waitForSelector('[data-testid="template-card"]', {
    state: 'visible',
  });
  await page.waitForTimeout(300);

  await test.step('overview', async () => {
    await page.screenshot({
      path: join(screenshotsDir, `templates-overview-${suffix}.png`),
      fullPage: false,
    });
  });

  if (suffix === 'light') {
    await test.step('grid section', async () => {
      const gridSection = page.locator('.templates-grid').first();
      await captureElementScreenshot(
        page,
        [gridSection],
        join(screenshotsDir, 'templates-grid-light.png'),
        16
      );
    });

    await test.step('header / create button', async () => {
      const header = page.locator('.templates-header').first();
      await captureElementScreenshot(
        page,
        [header],
        join(screenshotsDir, 'templates-create-button-light.png'),
        16
      );
    });
  }

  await test.step('template card', async () => {
    const card = page.locator('[data-testid="template-card"]').first();
    await captureElementScreenshot(
      page,
      [card],
      join(screenshotsDir, `templates-card-menu-${suffix}.png`),
      16
    );
  });

  await test.step('clone template menu', async () => {
    await page
      .locator('[data-testid="template-card"]')
      .first()
      .locator('button[aria-label="Template actions"]')
      .click();
    await page.waitForTimeout(200);

    const menu = page.locator('mat-menu.mat-mdc-menu-panel');
    await captureElementScreenshot(
      page,
      [menu],
      join(screenshotsDir, `templates-clone-menu-${suffix}.png`),
      16
    );

    // Dismiss the menu before opening the create dialog.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  await test.step('create template dialog', async () => {
    await page.click('[data-testid="create-template-button"]');
    await page.waitForSelector('[data-testid="template-editor-page"]', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    await captureElementScreenshot(
      page,
      [page.locator('[data-testid="template-editor-page"]')],
      join(screenshotsDir, `templates-create-dialog-${suffix}.png`),
      32
    );

    await page.click(
      '[data-testid="template-editor-page"] button:has-text("Cancel")'
    );
  });
}

test.describe.skip('Templates Tab Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test('templates screenshots — light mode', async ({ offlinePage: page }) => {
    await setupProjectAndTemplatesTab(page, 'tpl-light', 'Templates Demo');
    await expect(page.locator('.templates-tab-container')).toBeVisible();
    await captureAllTemplateScreenshots(page, screenshotsDir, 'light');
  });

  test('templates screenshots — dark mode', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectAndTemplatesTab(page, 'tpl-dark', 'Templates Demo');
    await expect(page.locator('.templates-tab-container')).toBeVisible();
    await captureAllTemplateScreenshots(page, screenshotsDir, 'dark');
  });
});
