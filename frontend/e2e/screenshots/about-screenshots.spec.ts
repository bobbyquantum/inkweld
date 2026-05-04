import type { Page } from '@playwright/test';
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

const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;
const MOBILE_VIEWPORT = { width: 375, height: 667 } as const;

async function gotoAbout(page: Page): Promise<void> {
  await page.goto('/about');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="version-card"]', {
    state: 'visible',
  });
  // Brief settle for icon fonts / layout
  await page.waitForTimeout(300);
}

test.describe('About Page Screenshots', () => {
  test.beforeAll(async () => {
    if (!existsSync(SCREENSHOTS_DIR)) {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  // Single light-mode flow captures every light artifact in one project setup.
  test('about page screenshots — light mode', async ({ offlinePage: page }) => {
    await test.step('desktop full page', async () => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await gotoAbout(page);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'about-page-desktop-light.png'),
        fullPage: true,
      });
    });

    await test.step('libraries card focused', async () => {
      // Already on /about with desktop viewport from previous step.
      await page.waitForSelector('[data-testid="libraries-card"]', {
        state: 'visible',
      });
      const librariesCard = page.locator('[data-testid="libraries-card"]');
      await librariesCard.screenshot({
        path: join(SCREENSHOTS_DIR, 'about-libraries-card-light.png'),
      });
    });

    await test.step('mobile full page', async () => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await gotoAbout(page);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'about-page-mobile-light.png'),
        fullPage: true,
      });
    });
  });

  // Mirror of the light flow but with dark color scheme emulated.
  test('about page screenshots — dark mode', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });

    await test.step('desktop full page', async () => {
      await page.setViewportSize(DESKTOP_VIEWPORT);
      await gotoAbout(page);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'about-page-desktop-dark.png'),
        fullPage: true,
      });
    });

    await test.step('libraries card focused', async () => {
      await page.waitForSelector('[data-testid="libraries-card"]', {
        state: 'visible',
      });
      const librariesCard = page.locator('[data-testid="libraries-card"]');
      await librariesCard.screenshot({
        path: join(SCREENSHOTS_DIR, 'about-libraries-card-dark.png'),
      });
    });

    await test.step('mobile full page', async () => {
      await page.setViewportSize(MOBILE_VIEWPORT);
      await gotoAbout(page);
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'about-page-mobile-dark.png'),
        fullPage: true,
      });
    });
  });
});
