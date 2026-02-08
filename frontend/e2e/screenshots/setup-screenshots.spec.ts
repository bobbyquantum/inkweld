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

test.describe('Setup Flow Screenshots', () => {
  test.beforeAll(async () => {
    if (!existsSync(SCREENSHOTS_DIR)) {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test('capture setup mode selection - mobile light mode', async ({
    unconfiguredPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ colorScheme: 'light' });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for setup card to be visible
    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    await page.waitForSelector('[data-testid="local-mode-button"]', {
      state: 'visible',
    });
    await page.waitForSelector('[data-testid="server-mode-button"]', {
      state: 'visible',
    });

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-mode-selection-mobile-light.png'),
      fullPage: true,
    });
  });

  test('capture setup mode selection - mobile dark mode', async ({
    unconfiguredPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    await page.waitForSelector('[data-testid="local-mode-button"]', {
      state: 'visible',
    });
    await page.waitForSelector('[data-testid="server-mode-button"]', {
      state: 'visible',
    });

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-mode-selection-mobile-dark.png'),
      fullPage: true,
    });
  });

  test('capture setup offline profile - mobile light mode', async ({
    unconfiguredPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ colorScheme: 'light' });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    // Click the offline mode button
    await page.click('[data-testid="local-mode-button"]');

    // Wait for offline setup form to appear
    await page.waitForSelector('[data-testid="local-username-input"]', {
      state: 'visible',
    });

    // Fill in sample data for the screenshot
    await page.fill('[data-testid="local-username-input"]', 'novelist');
    await page.fill(
      '[data-testid="local-displayname-input"]',
      'Emily Bronte'
    );

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-offline-mobile-light.png'),
      fullPage: true,
    });
  });

  test('capture setup offline profile - mobile dark mode', async ({
    unconfiguredPage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({ colorScheme: 'dark' });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    // Click the offline mode button
    await page.click('[data-testid="local-mode-button"]');

    // Wait for offline setup form to appear
    await page.waitForSelector('[data-testid="local-username-input"]', {
      state: 'visible',
    });

    // Fill in sample data for the screenshot
    await page.fill('[data-testid="local-username-input"]', 'novelist');
    await page.fill(
      '[data-testid="local-displayname-input"]',
      'Emily Bronte'
    );

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-offline-mobile-dark.png'),
      fullPage: true,
    });
  });
});
