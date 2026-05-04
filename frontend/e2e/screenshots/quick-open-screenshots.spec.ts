/**
 * Quick Open Screenshot Tests
 *
 * Captures screenshots demonstrating the Quick Open feature in both light
 * and dark mode using a single shared project per mode (was 4 separate
 * project setups). Each artifact path is preserved.
 */

import { type Page } from '@playwright/test';
import { join } from 'path';

import {
  createProjectWithTwoSteps,
  pressShortcut,
} from '../common/test-helpers';
import { test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;

async function setupProjectWithDocuments(
  page: Page,
  projectSlug: string,
  projectTitle: string
): Promise<void> {
  await page.goto('/');

  await page.waitForSelector('.empty-state', { state: 'visible' });

  await createProjectWithTwoSteps(page, projectTitle, projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  await page.waitForSelector('[data-testid="project-tree"]', {
    state: 'visible',
  });

  const documentNames = [
    'Chapter One - The Beginning',
    'Chapter Two - The Journey',
    'Chapter Three - The Conflict',
    'Notes and Ideas',
  ];

  for (const name of documentNames) {
    const newDocButton = page.getByTestId('create-new-element');
    await newDocButton.click();

    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill(name);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });
  }
}

async function openQuickOpen(page: Page): Promise<void> {
  await pressShortcut(page, 'p');
  await page.waitForSelector('[data-testid="quick-open-dialog"]', {
    state: 'visible',
  });
  // Brief wait for results to populate
  await page.waitForTimeout(300);
}

test.describe('Quick Open Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test('Quick Open screenshots — light mode', async ({ offlinePage: page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await setupProjectWithDocuments(page, 'quick-open-demo-light', 'My Novel');

    await test.step('dialog with recent files', async () => {
      await openQuickOpen(page);
      await captureElementScreenshot(
        page,
        [page.locator('[data-testid="quick-open-dialog"]')],
        join(screenshotsDir, 'quick-open-dialog-light.png'),
        16
      );
    });

    await test.step('dialog filtered by search query', async () => {
      // Dialog is still open from previous step.
      await page.getByTestId('quick-open-search').fill('chapter');
      await page.waitForTimeout(300);
      await captureElementScreenshot(
        page,
        [page.locator('[data-testid="quick-open-dialog"]')],
        join(screenshotsDir, 'quick-open-search-light.png'),
        16
      );
      await page.keyboard.press('Escape');
    });
  });

  test('Quick Open screenshots — dark mode', async ({ offlinePage: page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectWithDocuments(page, 'quick-open-demo-dark', 'My Novel');

    await test.step('dialog with recent files', async () => {
      await openQuickOpen(page);
      await captureElementScreenshot(
        page,
        [page.locator('[data-testid="quick-open-dialog"]')],
        join(screenshotsDir, 'quick-open-dialog-dark.png'),
        16
      );
    });

    await test.step('dialog filtered by search query', async () => {
      await page.getByTestId('quick-open-search').fill('chapter');
      await page.waitForTimeout(300);
      await captureElementScreenshot(
        page,
        [page.locator('[data-testid="quick-open-dialog"]')],
        join(screenshotsDir, 'quick-open-search-dark.png'),
        16
      );
      await page.keyboard.press('Escape');
    });
  });
});
