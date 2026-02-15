/**
 * Templates Tab Screenshot Tests
 *
 * Captures comprehensive screenshots demonstrating the template management feature:
 * - Full list view with templates
 * - Create new template flow
 * - Clone template flow
 * - Template editor dialog
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

test.describe('Templates Tab Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  /**
   * Helper to create a project and navigate to templates tab
   */
  async function setupProjectAndTemplatesTab(
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

    // Navigate to Settings tab first
    await page.goto(`/demouser/${projectSlug}/settings`);
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    // Click on the "Element Templates" inner tab
    await page.getByRole('tab', { name: 'Element Templates' }).click();

    // Wait for templates container
    await page.waitForSelector('.templates-tab-container', {
      state: 'visible',
    });
    await page.waitForTimeout(500);
  }

  test.describe('Light Mode Screenshots', () => {
    test('templates tab overview', async ({ offlinePage: page }) => {
      await setupProjectAndTemplatesTab(
        page,
        'tpl-overview-light',
        'Templates Demo'
      );

      // Wait for templates to load
      await page.waitForSelector('[data-testid="template-card"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Capture full tab view
      await page.screenshot({
        path: join(screenshotsDir, 'templates-overview-light.png'),
        fullPage: false,
      });
    });

    test('templates grid section', async ({ offlinePage: page }) => {
      await setupProjectAndTemplatesTab(
        page,
        'tpl-grid-light',
        'Templates Demo'
      );

      await page.waitForSelector('[data-testid="template-card"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Capture the templates grid section
      const gridSection = page.locator('.templates-grid').first();

      await captureElementScreenshot(
        page,
        [gridSection],
        join(screenshotsDir, 'templates-grid-light.png'),
        16
      );
    });

    test('create template button', async ({ offlinePage: page }) => {
      await setupProjectAndTemplatesTab(
        page,
        'tpl-create-light',
        'Create Template Demo'
      );

      // Capture header with create button visible
      const header = page.locator('.templates-header').first();

      await captureElementScreenshot(
        page,
        [header],
        join(screenshotsDir, 'templates-create-button-light.png'),
        16
      );
    });

    test('create template dialog', async ({ offlinePage: page }) => {
      await setupProjectAndTemplatesTab(
        page,
        'tpl-create-dlg-light',
        'Create Template Dialog Demo'
      );

      // Click create template button
      await page.click('[data-testid="create-template-button"]');

      // Wait for template editor dialog
      await page.waitForSelector('app-template-editor-dialog', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Screenshot of the dialog
      await captureElementScreenshot(
        page,
        [page.locator('app-template-editor-dialog')],
        join(screenshotsDir, 'templates-create-dialog-light.png'),
        32
      );

      // Cancel the dialog
      await page.click('app-template-editor-dialog button:has-text("Cancel")');
    });

    test('clone template flow', async ({ offlinePage: page }) => {
      await setupProjectAndTemplatesTab(
        page,
        'tpl-clone-light',
        'Clone Template Demo'
      );

      // Wait for template cards
      await page.waitForSelector('[data-testid="template-card"]', {
        state: 'visible',
      });

      // Open menu on first template
      await page
        .locator('[data-testid="template-card"]')
        .first()
        .locator('button[aria-label="Template actions"]')
        .click();

      await page.waitForTimeout(200);

      // Screenshot the menu
      const menu = page.locator('mat-menu.mat-mdc-menu-panel');

      await captureElementScreenshot(
        page,
        [menu],
        join(screenshotsDir, 'templates-clone-menu-light.png'),
        16
      );
    });

    test('template card details', async ({ offlinePage: page }) => {
      await setupProjectAndTemplatesTab(
        page,
        'tpl-card-light',
        'Template Card Demo'
      );

      // Wait for template cards to load
      await page.waitForSelector('[data-testid="template-card"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Screenshot a single template card
      const card = page.locator('[data-testid="template-card"]').first();

      await captureElementScreenshot(
        page,
        [card],
        join(screenshotsDir, 'templates-card-menu-light.png'),
        16
      );
    });
  });

  test.describe('Dark Mode Screenshots', () => {
    /**
     * Helper to enable dark mode on a page
     */
    async function enableDarkMode(page: Page) {
      await page.emulateMedia({ colorScheme: 'dark' });
    }

    test('templates tab overview dark', async ({ offlinePage: page }) => {
      await enableDarkMode(page);
      await setupProjectAndTemplatesTab(
        page,
        'tpl-overview-dark',
        'Templates Demo'
      );

      await page.waitForSelector('[data-testid="template-card"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(screenshotsDir, 'templates-overview-dark.png'),
        fullPage: false,
      });
    });

    test('create template dialog dark', async ({ offlinePage: page }) => {
      await enableDarkMode(page);
      await setupProjectAndTemplatesTab(
        page,
        'tpl-create-dark',
        'Create Template Demo'
      );

      // Click create template button
      await page.click('[data-testid="create-template-button"]');

      // Wait for template editor dialog
      await page.waitForSelector('app-template-editor-dialog', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Screenshot of the dialog
      await captureElementScreenshot(
        page,
        [page.locator('app-template-editor-dialog')],
        join(screenshotsDir, 'templates-create-dialog-dark.png'),
        32
      );

      // Cancel the dialog
      await page.click('app-template-editor-dialog button:has-text("Cancel")');
    });

    test('template card dark', async ({ offlinePage: page }) => {
      await enableDarkMode(page);
      await setupProjectAndTemplatesTab(
        page,
        'tpl-card-dark',
        'Template Card Demo'
      );

      await page.waitForSelector('[data-testid="template-card"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      // Screenshot a single template card
      const card = page.locator('[data-testid="template-card"]').first();

      await captureElementScreenshot(
        page,
        [card],
        join(screenshotsDir, 'templates-card-menu-dark.png'),
        16
      );
    });

    test('clone template menu dark', async ({ offlinePage: page }) => {
      await enableDarkMode(page);
      await setupProjectAndTemplatesTab(
        page,
        'tpl-clone-dark',
        'Clone Template Demo'
      );

      // Wait for template cards
      await page.waitForSelector('[data-testid="template-card"]', {
        state: 'visible',
      });

      // Open menu on first template
      await page
        .locator('[data-testid="template-card"]')
        .first()
        .locator('button[aria-label="Template actions"]')
        .click();

      await page.waitForTimeout(200);

      // Screenshot the menu
      const menu = page.locator('mat-menu.mat-mdc-menu-panel');

      await captureElementScreenshot(
        page,
        [menu],
        join(screenshotsDir, 'templates-clone-menu-dark.png'),
        16
      );
    });
  });
});
