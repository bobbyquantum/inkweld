import type { Page } from '@playwright/test';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { test } from './fixtures';

const SCREENSHOTS_DIR = join(
  process.cwd(),
  '..',
  'docs',
  'site',
  'static',
  'img',
  'generated'
);

const MOBILE_VIEWPORT = { width: 375, height: 667 } as const;

async function gotoSetup(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="setup-card"]', {
    state: 'visible',
  });
}

async function captureModeSelection(page: Page, path: string): Promise<void> {
  await gotoSetup(page);
  await page.waitForSelector('[data-testid="local-mode-button"]', {
    state: 'visible',
  });
  await page.waitForSelector('[data-testid="server-mode-button"]', {
    state: 'visible',
  });
  await page.screenshot({ path, fullPage: true });
}

async function captureOfflineProfile(page: Page, path: string): Promise<void> {
  await gotoSetup(page);
  await page.click('[data-testid="local-mode-button"]');
  await page.waitForSelector('[data-testid="local-username-input"]', {
    state: 'visible',
  });
  await page.fill('[data-testid="local-username-input"]', 'novelist');
  await page.fill('[data-testid="local-displayname-input"]', 'Emily Bronte');
  await page.screenshot({ path, fullPage: true });
}

test.describe('Setup Flow Screenshots', () => {
  test.beforeAll(async () => {
    if (!existsSync(SCREENSHOTS_DIR)) {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test('setup flow screenshots — mobile light mode', async ({
    unconfiguredPage: page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.emulateMedia({ colorScheme: 'light' });

    await test.step('mode selection', async () => {
      await captureModeSelection(
        page,
        join(SCREENSHOTS_DIR, 'setup-mode-selection-mobile-light.png')
      );
    });

    await test.step('offline profile form', async () => {
      await captureOfflineProfile(
        page,
        join(SCREENSHOTS_DIR, 'setup-offline-mobile-light.png')
      );
    });
  });

  test('setup flow screenshots — mobile dark mode', async ({
    unconfiguredPage: page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.emulateMedia({ colorScheme: 'dark' });

    await test.step('mode selection', async () => {
      await captureModeSelection(
        page,
        join(SCREENSHOTS_DIR, 'setup-mode-selection-mobile-dark.png')
      );
    });

    await test.step('offline profile form', async () => {
      await captureOfflineProfile(
        page,
        join(SCREENSHOTS_DIR, 'setup-offline-mobile-dark.png')
      );
    });
  });
});
