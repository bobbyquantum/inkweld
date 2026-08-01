/**
 * Templates Tab Screenshot Tests
 *
 * Captures screenshots of the template management feature (embedded in
 * Project Settings → Element Templates). Consolidated 10 → 2 tests (one
 * per color scheme); each captures overview, list, header/create button,
 * template editor page, template row actions, and card details via test.step.
 *
 * Uses the worldbuilding-demo project template which ships with pre-built
 * schemas (Character, Location) so the templates tab has content to display
 * in offline/local mode.
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

  await page.waitForSelector('[data-testid="empty-state"]', {
    state: 'visible',
  });

  await createProjectWithTwoSteps(
    page,
    projectTitle,
    projectSlug,
    undefined,
    'worldbuilding-demo'
  );
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  await page.goto(`/demouser/${projectSlug}/settings`);
  await page.waitForSelector('[data-testid="settings-tab-content"]', {
    state: 'visible',
  });

  await page.getByTestId('nav-templates').click();

  await page.getByTestId('templates-tab').waitFor({ state: 'visible' });
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
    await test.step('list section', async () => {
      const listSection = page
        .locator('[data-testid="templates-list"]')
        .first();
      await captureElementScreenshot(
        page,
        [listSection],
        join(screenshotsDir, 'templates-grid-light.png'),
        16
      );
    });

    await test.step('header / create button', async () => {
      const controls = page.getByTestId('templates-controls');
      await captureElementScreenshot(
        page,
        [controls],
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

  await test.step('template actions', async () => {
    const card = page.locator('[data-testid="template-card"]').first();
    const actions = card.getByTestId('template-actions');
    await expect(actions).toBeVisible();
    await captureElementScreenshot(
      page,
      [actions],
      join(screenshotsDir, `templates-clone-menu-${suffix}.png`),
      16
    );
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

test.describe('Templates Tab Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test('templates screenshots — light mode', async ({ offlinePage: page }) => {
    await setupProjectAndTemplatesTab(page, 'tpl-light', 'Templates Demo');
    await expect(page.getByTestId('templates-tab')).toBeVisible();
    await captureAllTemplateScreenshots(page, screenshotsDir, 'light');
  });

  test('templates screenshots — dark mode', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectAndTemplatesTab(page, 'tpl-dark', 'Templates Demo');
    await expect(page.getByTestId('templates-tab')).toBeVisible();
    await captureAllTemplateScreenshots(page, screenshotsDir, 'dark');
  });
});
