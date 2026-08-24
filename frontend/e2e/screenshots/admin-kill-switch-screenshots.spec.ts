/**
 * Admin Settings Kill Switch Screenshot Tests
 *
 * Captures screenshots of the AI kill switch settings for documentation.
 * Consolidated 4 → 2 tests (one per color scheme), each capturing both
 * the full settings page and the focused kill-switch card via test.step.
 */
import type { Page } from '@playwright/test';
import path from 'path';

import { expect, test } from './fixtures';

const SCREENSHOTS_DIR = path.join(
  __dirname,
  '../../',
  '../docs/site/static/img/features'
);

async function enableKillSwitchMock(page: Page): Promise<void> {
  await page.route('**/api/v1/config/features', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        aiKillSwitch: true,
        aiKillSwitchLockedByEnv: false,
        aiAutoReview: false,
        aiImageGeneration: false,
        captcha: { enabled: false },
        appMode: 'BOTH',
        defaultServerName: null,
        userApprovalRequired: true,
      }),
    });
  });

  await page.route('**/api/v1/admin/config/AI_KILL_SWITCH', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ value: 'true', source: 'database' }),
      });
    } else {
      await route.continue();
    }
  });
}

async function navigateToAdminSettingsViaMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  await page.locator('[data-testid="admin-menu-link"]').click();
  await page.waitForURL('**/admin/**');

  const settingsLink = page.locator(
    '[data-testid="admin-nav-settings"], a[href*="/admin/settings"]'
  );
  // Wait briefly for the admin nav to render, but stay tolerant of
  // layouts where the settings link is absent.
  await settingsLink
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 })
    .catch(() => {});
  if (
    await settingsLink
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await settingsLink.first().click();
  }
}

async function applyColorScheme(
  page: Page,
  scheme: 'light' | 'dark'
): Promise<void> {
  await page.evaluate(mode => {
    const html = document.documentElement;
    if (mode === 'dark') {
      html.classList.remove('light-mode');
      html.classList.add('dark-mode');
    } else {
      html.classList.remove('dark-mode');
      html.classList.add('light-mode');
    }
  }, scheme);
}

test.describe('Admin Kill Switch Screenshots', () => {
  test.beforeEach(async ({ adminPage }) => {
    await enableKillSwitchMock(adminPage);
    await navigateToAdminSettingsViaMenu(adminPage);

    await expect(adminPage.getByTestId('settings-container')).toBeVisible();

    const loadingSpinner = adminPage.locator('mat-spinner');
    if (await loadingSpinner.isVisible()) {
      await loadingSpinner.waitFor({ state: 'hidden' });
    }
  });

  test('Admin kill switch screenshots — light mode', async ({ adminPage }) => {
    await applyColorScheme(adminPage, 'light');

    await test.step('full settings page', async () => {
      await adminPage.screenshot({
        path: path.join(
          SCREENSHOTS_DIR,
          'admin-kill-switch-settings-light.png'
        ),
        fullPage: false,
      });
    });

    await test.step('focused kill-switch card', async () => {
      const killSwitchCard = adminPage.getByTestId('kill-switch-card');
      if (await killSwitchCard.isVisible()) {
        await killSwitchCard.screenshot({
          path: path.join(SCREENSHOTS_DIR, 'admin-kill-switch-card-light.png'),
        });
      }
    });

    await expect(adminPage.getByTestId('settings-container')).toBeVisible();
  });

  test('Admin kill switch screenshots — dark mode', async ({ adminPage }) => {
    await applyColorScheme(adminPage, 'dark');

    await test.step('full settings page', async () => {
      await adminPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-kill-switch-settings-dark.png'),
        fullPage: false,
      });
    });

    await test.step('focused kill-switch card', async () => {
      const killSwitchCard = adminPage.getByTestId('kill-switch-card');
      if (await killSwitchCard.isVisible()) {
        await killSwitchCard.screenshot({
          path: path.join(SCREENSHOTS_DIR, 'admin-kill-switch-card-dark.png'),
        });
      }
    });

    await expect(adminPage.getByTestId('settings-container')).toBeVisible();
  });
});
