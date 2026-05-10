/**
 * Publish Style Editor Screenshot Tests
 *
 * Captures screenshots of the new Style editor inside the publish-plan
 * tab — preset picker, current preset label, and the per-section accordion
 * (page setup, body text, headings, chapter title, scene break,
 * worldbuilding). Outputs go to docs/site/static/img/features/.
 */
import { type Page } from '@playwright/test';
import { join } from 'path';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

async function setupProjectAndOpenStyleEditor(
  page: Page,
  projectSlug: string,
  projectTitle: string
): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.empty-state', { state: 'visible' });

  await createProjectWithTwoSteps(page, projectTitle, projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  // Open Publishing tab via sidebar.
  await page.getByTestId('sidebar-publishing-button').click();
  await page.waitForSelector('[data-testid="publish-plans-list-container"]', {
    state: 'visible',
  });

  // Create a publish plan.
  const createPlanButton = page.getByTestId('create-publish-plan-button');
  await createPlanButton.waitFor({ state: 'visible' });
  await createPlanButton.click();
  await page.waitForURL(/\/publish-plan\//);
  await page.waitForSelector('[data-testid="plan-name-input"]', {
    state: 'visible',
  });

  // Navigate to the Style section.
  await page.getByTestId('nav-formatting').click();
  await page.waitForSelector('[data-testid="publish-style-editor"]', {
    state: 'visible',
  });
  await page.waitForTimeout(400);
}

async function captureStyleScreenshots(
  page: Page,
  screenshotsDir: string,
  suffix: 'light' | 'dark'
): Promise<void> {
  await test.step('overview', async () => {
    await page.screenshot({
      path: join(screenshotsDir, `publish-style-overview-${suffix}.png`),
      fullPage: false,
    });
  });

  await test.step('preset picker', async () => {
    const preset = page
      .locator('[data-testid="publish-style-editor"] .preset-section')
      .first();
    await captureElementScreenshot(
      page,
      [preset],
      join(screenshotsDir, `publish-style-preset-picker-${suffix}.png`),
      16
    );
  });

  await test.step('preset dropdown open', async () => {
    await page.getByTestId('preset-select').click();
    await page.waitForSelector('mat-option', { state: 'visible' });
    await page.waitForTimeout(200);
    await page.screenshot({
      path: join(screenshotsDir, `publish-style-preset-list-${suffix}.png`),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  await test.step('body text section expanded', async () => {
    await page.getByTestId('section-base-text').click();
    await page.waitForTimeout(300);
    const section = page.getByTestId('section-base-text');
    await captureElementScreenshot(
      page,
      [section],
      join(screenshotsDir, `publish-style-body-text-${suffix}.png`),
      16
    );
  });

  await test.step('chapter title section with page break toggle', async () => {
    await page.getByTestId('section-chapter').click();
    await page.waitForTimeout(300);
    const section = page.getByTestId('section-chapter');
    await captureElementScreenshot(
      page,
      [section],
      join(screenshotsDir, `publish-style-chapter-${suffix}.png`),
      16
    );
  });

  await test.step('worldbuilding section', async () => {
    await page.getByTestId('section-worldbuilding').click();
    await page.waitForTimeout(300);
    const section = page.getByTestId('section-worldbuilding');
    await captureElementScreenshot(
      page,
      [section],
      join(screenshotsDir, `publish-style-worldbuilding-${suffix}.png`),
      16
    );
  });
}

test.describe('Publish Style Editor Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test('publish-style screenshots — light mode', async ({
    offlinePage: page,
  }) => {
    await setupProjectAndOpenStyleEditor(
      page,
      'pub-style-light',
      'Publish Style Demo'
    );
    await captureStyleScreenshots(page, screenshotsDir, 'light');
  });

  test('publish-style screenshots — dark mode', async ({
    offlinePage: page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectAndOpenStyleEditor(
      page,
      'pub-style-dark',
      'Publish Style Demo'
    );
    await captureStyleScreenshots(page, screenshotsDir, 'dark');
  });
});
