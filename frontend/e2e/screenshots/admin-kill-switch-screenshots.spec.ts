/**
 * Admin Settings Kill Switch Screenshot Tests
 *
 * These tests capture screenshots of the AI kill switch settings
 * for documentation purposes.
 */
import path from 'path';

import { test } from './fixtures';

const SCREENSHOTS_DIR = path.join(
  __dirname,
  '../../',
  '../docs/site/static/img/features'
);

/**
 * Helper to set up kill switch as ENABLED in the mock API.
 * This overrides the default mock which has kill switch disabled.
 */
async function enableKillSwitchMock(
  page: import('@playwright/test').Page
): Promise<void> {
  // Intercept config/features endpoint to return kill switch as enabled
  await page.route('**/api/v1/config/features', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        aiKillSwitch: true,
        aiKillSwitchLockedByEnv: false,
        aiLinting: false,
        aiImageGeneration: false,
        captcha: { enabled: false },
        appMode: 'BOTH',
        defaultServerName: null,
        userApprovalRequired: true,
      }),
    });
  });

  // Also override the admin config GET for AI_KILL_SWITCH
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

/**
 * Helper to navigate to admin settings page via user menu.
 */
async function navigateToAdminSettingsViaMenu(
  page: import('@playwright/test').Page
): Promise<void> {
  // Open user menu
  await page.locator('[data-testid="user-menu-button"]').click();
  // Wait for menu to open
  await page.waitForTimeout(300);
  // Click admin link
  await page.locator('[data-testid="admin-menu-link"]').click();
  // Wait for admin page to load
  await page.waitForURL('**/admin/**');
  await page.waitForLoadState('networkidle');

  // Navigate to settings
  const settingsLink = page.locator(
    '[data-testid="admin-nav-settings"], a[href*="/admin/settings"]'
  );
  if ((await settingsLink.count()) > 0) {
    await settingsLink.first().click();
    await page.waitForLoadState('networkidle');
  }
}

test.describe('Admin Kill Switch Screenshots', () => {
  test.beforeEach(async ({ adminPage }) => {
    // Set up kill switch as enabled BEFORE navigating
    await enableKillSwitchMock(adminPage);

    // Navigate via user menu (more reliable than direct URL)
    await navigateToAdminSettingsViaMenu(adminPage);

    // Wait for the page to load
    await adminPage.waitForSelector('.settings-container, .loading-container', {
      timeout: 10000,
    });

    // Wait for loading to complete
    const loadingSpinner = adminPage.locator('mat-spinner');
    if (await loadingSpinner.isVisible()) {
      await loadingSpinner.waitFor({ state: 'hidden', timeout: 10000 });
    }
  });

  test('Admin settings page with kill switch - light mode', async ({
    adminPage,
  }) => {
    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    // Wait a moment for theme to apply
    await adminPage.waitForTimeout(300);

    // Take screenshot of the full page
    await adminPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'admin-kill-switch-settings-light.png'),
      fullPage: false,
    });
  });

  test('Admin settings page with kill switch - dark mode', async ({
    adminPage,
  }) => {
    // Set dark mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('light-mode');
      document.documentElement.classList.add('dark-mode');
    });

    // Wait a moment for theme to apply
    await adminPage.waitForTimeout(300);

    // Take screenshot of the full page
    await adminPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'admin-kill-switch-settings-dark.png'),
      fullPage: false,
    });
  });

  test('Kill switch card focused - light mode', async ({ adminPage }) => {
    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    await adminPage.waitForTimeout(300);

    // Find and screenshot just the AI kill switch card
    const killSwitchCard = adminPage.locator('.kill-switch-card');
    if (await killSwitchCard.isVisible()) {
      await killSwitchCard.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-kill-switch-card-light.png'),
      });
    }
  });

  test('Kill switch card focused - dark mode', async ({ adminPage }) => {
    // Set dark mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('light-mode');
      document.documentElement.classList.add('dark-mode');
    });

    await adminPage.waitForTimeout(300);

    // Find and screenshot just the AI kill switch card
    const killSwitchCard = adminPage.locator('.kill-switch-card');
    if (await killSwitchCard.isVisible()) {
      await killSwitchCard.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-kill-switch-card-dark.png'),
      });
    }
  });
});
