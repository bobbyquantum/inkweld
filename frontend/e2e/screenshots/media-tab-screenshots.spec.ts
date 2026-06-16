/**
 * Media Tab Screenshot Tests
 *
 * Captures screenshots of the media library tab. Consolidated 10 → 4 tests:
 * one populated test + one empty-state test per color scheme. The populated
 * test captures the full tab, cropped gallery, search results, and filter
 * panel via test.step against the same project + media seeding.
 */

import { type Page } from '@playwright/test';
import { join } from 'path';

import {
  createProjectWithTwoSteps,
  DEMO_ASSETS,
  storeRealEpubInIndexedDB,
  storeRealMediaInIndexedDB,
} from '../common/test-helpers';
import { expect, test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

const screenshotsDir = getScreenshotsDir();
const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;

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

async function setupEmptyMediaProject(
  page: Page,
  projectSlug: string,
  projectTitle: string
): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('[data-testid="empty-state"]', {
    state: 'visible',
  });

  await createProjectWithTwoSteps(page, projectTitle, projectSlug);
  await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

  await page.goto(`/demouser/${projectSlug}/media`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="empty-card"]', {
    state: 'visible',
  });
  await page.waitForTimeout(300);
}

async function capturePopulatedMediaScreenshots(
  page: Page,
  suffix: 'light' | 'dark'
): Promise<void> {
  await test.step('full media tab', async () => {
    await page.screenshot({
      path: join(screenshotsDir, `media-tab-${suffix}.png`),
      fullPage: false,
    });
  });

  await test.step('cropped gallery area', async () => {
    const grid = page.getByTestId('media-grid');
    await captureElementScreenshot(
      page,
      [grid],
      join(screenshotsDir, `media-gallery-${suffix}.png`),
      16
    );
  });

  await test.step('search with results', async () => {
    const searchInput = page.getByTestId('media-search-input');
    await searchInput.fill('hero');
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(screenshotsDir, `media-search-${suffix}.png`),
      fullPage: false,
    });

    // Reset search so the filter panel screenshot shows the full grid.
    await searchInput.fill('');
    await page.waitForTimeout(200);
  });

  await test.step('filter panel open', async () => {
    await page.getByTestId('media-filter-button').click();
    await page.waitForSelector('[data-testid="filter-panel"]', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(screenshotsDir, `media-filter-panel-${suffix}.png`),
      fullPage: false,
    });
  });
}

test.describe('Media Tab Screenshots', () => {
  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  test('media tab populated screenshots — light mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await setupMediaTab(page, 'media-light', 'Media Demo');
    await expect(page.getByTestId('media-grid')).toBeVisible();
    await capturePopulatedMediaScreenshots(page, 'light');
  });

  test('media tab empty state — light mode', async ({ offlinePage: page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await setupEmptyMediaProject(page, 'empty-media-light', 'Empty Media');
    await expect(page.getByTestId('empty-card')).toBeVisible();
    await page.screenshot({
      path: join(screenshotsDir, 'media-empty-light.png'),
      fullPage: false,
    });
  });

  test('media tab populated screenshots — dark mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupMediaTab(page, 'media-dark', 'Media Demo Dark');
    await expect(page.getByTestId('media-grid')).toBeVisible();
    await capturePopulatedMediaScreenshots(page, 'dark');
  });

  test('media tab empty state — dark mode', async ({ offlinePage: page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupEmptyMediaProject(page, 'empty-media-dark', 'Empty Media Dark');
    await expect(page.getByTestId('empty-card')).toBeVisible();
    await page.screenshot({
      path: join(screenshotsDir, 'media-empty-dark.png'),
      fullPage: false,
    });
  });
});
