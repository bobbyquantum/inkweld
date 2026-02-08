import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { test } from './fixtures';

/**
 * Base directory for generated screenshots.
 * Screenshots are stored in docs/site/static/img/generated/ and gitignored.
 */
const SCREENSHOTS_DIR = join(
  process.cwd(),
  '..',
  'docs',
  'site',
  'static',
  'img',
  'generated'
);

test.describe('About Page Screenshots', () => {
  test.beforeAll(async () => {
    // Ensure screenshots directory exists
    if (!existsSync(SCREENSHOTS_DIR)) {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test('capture about page - desktop light mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Wait for content cards to render
    await page.waitForSelector('[data-testid="version-card"]', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'about-page-desktop-light.png'),
      fullPage: true,
    });
  });

  test('capture about page - desktop dark mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Wait for content cards to render
    await page.waitForSelector('[data-testid="version-card"]', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'about-page-desktop-dark.png'),
      fullPage: true,
    });
  });

  test('capture about page - mobile light mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Wait for content cards to render
    await page.waitForSelector('[data-testid="version-card"]', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'about-page-mobile-light.png'),
      fullPage: true,
    });
  });

  test('capture about page - mobile dark mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Wait for content cards to render
    await page.waitForSelector('[data-testid="version-card"]', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'about-page-mobile-dark.png'),
      fullPage: true,
    });
  });

  test('capture libraries card focused - light mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Wait for libraries card to render
    await page.waitForSelector('[data-testid="libraries-card"]', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    // Screenshot just the libraries card
    const librariesCard = page.locator('[data-testid="libraries-card"]');
    await librariesCard.screenshot({
      path: join(SCREENSHOTS_DIR, 'about-libraries-card-light.png'),
    });
  });

  test('capture libraries card focused - dark mode', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Wait for libraries card to render
    await page.waitForSelector('[data-testid="libraries-card"]', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    // Screenshot just the libraries card
    const librariesCard = page.locator('[data-testid="libraries-card"]');
    await librariesCard.screenshot({
      path: join(SCREENSHOTS_DIR, 'about-libraries-card-dark.png'),
    });
  });
});
