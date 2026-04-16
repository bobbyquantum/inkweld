/**
 * Media Tab Screenshot Tests
 *
 * Captures screenshots of the media library tab for documentation:
 * - Media grid with images (light + dark)
 * - Empty state
 * - Search with results
 * - Filter panel open
 * - Status bar
 *
 * Uses the offlinePage fixture (local mode, no server needed).
 * Real demo images from assets/ are stored into IndexedDB.
 */

import { type Page } from '@playwright/test';
import { join } from 'path';

import {
  createProjectWithTwoSteps,
  DEMO_ASSETS,
  storeRealEpubInIndexedDB,
  storeRealMediaInIndexedDB,
} from '../common/test-helpers';
import { test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

const screenshotsDir = getScreenshotsDir();

/**
 * Helper: create a project, store demo media, navigate to the media tab.
 */
async function setupMediaTab(
  page: Page,
  projectSlug: string,
  projectTitle: string
): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('.empty-state', { state: 'visible' });

  await createProjectWithTwoSteps(page, projectTitle, projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  const projectKey = `demouser/${projectSlug}`;

  // Store a variety of demo media
  await storeRealMediaInIndexedDB(
    page,
    projectKey,
    'cover',
    DEMO_ASSETS.covers.demo1,
    'project-cover.png'
  );
  await storeRealMediaInIndexedDB(
    page,
    projectKey,
    'img-character',
    DEMO_ASSETS.images.demoCharacter,
    'hero-character.png'
  );
  await storeRealMediaInIndexedDB(
    page,
    projectKey,
    'img-cityscape',
    DEMO_ASSETS.images.cyberCityscape,
    'cyber-cityscape.png'
  );
  await storeRealMediaInIndexedDB(
    page,
    projectKey,
    'img-landscape',
    DEMO_ASSETS.images.landscapePencil,
    'landscape-pencil.png'
  );
  await storeRealEpubInIndexedDB(
    page,
    projectKey,
    'final',
    'my-novel-final.epub'
  );

  // Navigate to media tab
  await page.goto(`/demouser/${projectSlug}/media`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="media-grid"]', {
    state: 'visible',
  });
  await page.waitForTimeout(500);
}

test.describe('Media Tab Screenshots', () => {
  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test.describe('Light Mode', () => {
    test('media grid with items', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await setupMediaTab(page, 'media-light', 'Media Demo');

      await page.screenshot({
        path: join(screenshotsDir, 'media-tab-light.png'),
        fullPage: false,
      });
    });

    test('media grid - cropped gallery area', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await setupMediaTab(page, 'media-gallery-light', 'Media Gallery');

      const grid = page.getByTestId('media-grid');
      await captureElementScreenshot(
        page,
        [grid],
        join(screenshotsDir, 'media-gallery-light.png'),
        16
      );
    });

    test('empty state', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/');
      await page.waitForSelector('[data-testid="empty-state"]', {
        state: 'visible',
      });

      await createProjectWithTwoSteps(page, 'Empty Media', 'empty-media-light');
      await page.waitForURL(/\/demouser\/empty-media-light/);

      await page.goto('/demouser/empty-media-light/media');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('[data-testid="empty-card"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(screenshotsDir, 'media-empty-light.png'),
        fullPage: false,
      });
    });

    test('search with results', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await setupMediaTab(page, 'media-search-light', 'Media Search');

      // Type a search query
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('hero');
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(screenshotsDir, 'media-search-light.png'),
        fullPage: false,
      });
    });

    test('filter panel open', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await setupMediaTab(page, 'media-filter-light', 'Media Filters');

      // Open the filter panel
      await page.getByTestId('media-filter-button').click();
      await page.waitForSelector('[data-testid="filter-panel"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(screenshotsDir, 'media-filter-panel-light.png'),
        fullPage: false,
      });
    });
  });

  test.describe('Dark Mode', () => {
    test('media grid with items', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await setupMediaTab(page, 'media-dark', 'Media Demo Dark');

      await page.screenshot({
        path: join(screenshotsDir, 'media-tab-dark.png'),
        fullPage: false,
      });
    });

    test('media grid - cropped gallery area', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await setupMediaTab(page, 'media-gallery-dark', 'Media Gallery Dark');

      const grid = page.getByTestId('media-grid');
      await captureElementScreenshot(
        page,
        [grid],
        join(screenshotsDir, 'media-gallery-dark.png'),
        16
      );
    });

    test('filter panel open', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await setupMediaTab(page, 'media-filter-dark', 'Media Filters Dark');

      // Open the filter panel
      await page.getByTestId('media-filter-button').click();
      await page.waitForSelector('[data-testid="filter-panel"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(screenshotsDir, 'media-filter-panel-dark.png'),
        fullPage: false,
      });
    });

    test('empty state', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto('/');
      await page.waitForSelector('[data-testid="empty-state"]', {
        state: 'visible',
      });

      await createProjectWithTwoSteps(
        page,
        'Empty Media Dark',
        'empty-media-dark'
      );
      await page.waitForURL(/\/demouser\/empty-media-dark/);

      await page.goto('/demouser/empty-media-dark/media');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('[data-testid="empty-card"]', {
        state: 'visible',
      });
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(screenshotsDir, 'media-empty-dark.png'),
        fullPage: false,
      });
    });

    test('search with results', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await setupMediaTab(page, 'media-search-dark', 'Media Search Dark');

      // Type a search query
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('hero');
      await page.waitForTimeout(300);

      await page.screenshot({
        path: join(screenshotsDir, 'media-search-dark.png'),
        fullPage: false,
      });
    });
  });
});
