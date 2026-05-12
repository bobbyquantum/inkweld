/**
 * Writing-Stats & Activity Screenshot Tests
 *
 * Captures promotional screenshots for the user-profile writing-stats widget
 * and the per-project activity tab.
 *
 * NOTE: The stats + activity feature is **online-only** — the widget and
 * the Activity sidebar entry are hidden when Inkweld runs in local-only
 * mode. These screenshots therefore use the `authenticatedPage`
 * (server-mode) fixture, with the `/api/v1/stats/*` and
 * `/api/v1/activity/*` endpoints fulfilled by the screenshot mock-api
 * (`mock-api/stats.ts`).
 */

import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
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

const DESKTOP_VIEWPORT = { width: 1280, height: 900 } as const;
const PROFILE_USERNAME = 'testuser';

async function waitForWidget(page: Page): Promise<void> {
  // Widget renders once both /stats/me and /activity/me settle.
  await page.waitForSelector('app-writing-stats-widget .stats-widget', {
    state: 'visible',
    timeout: 15_000,
  });
  // Brief settle for sparkline animation.
  await page.waitForTimeout(400);
}

test.describe('Writing Stats & Activity Screenshots', () => {
  test.beforeAll(async () => {
    if (!existsSync(SCREENSHOTS_DIR)) {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test('writing-stats widget — light + dark', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(`/${PROFILE_USERNAME}`, {
      waitUntil: 'domcontentloaded',
    });

    await test.step('light', async () => {
      await waitForWidget(page);
      const widget = page.locator('app-writing-stats-widget .stats-widget');
      await expect(widget).toBeVisible();
      await widget.screenshot({
        path: join(SCREENSHOTS_DIR, 'writing-stats-widget-light.png'),
      });
    });

    await test.step('dark', async () => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForWidget(page);
      const widget = page.locator('app-writing-stats-widget .stats-widget');
      await expect(widget).toBeVisible();
      await widget.screenshot({
        path: join(SCREENSHOTS_DIR, 'writing-stats-widget-dark.png'),
      });
    });
  });
});
