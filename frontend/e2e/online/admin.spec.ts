import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:9333';

/**
 * Helper to navigate to admin page via user menu.
 * This is more reliable than direct URL navigation because it ensures
 * the user is fully authenticated before accessing admin routes.
 */
async function navigateToAdminViaMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  await page.locator('[data-testid="admin-menu-link"]').click();
  await page.waitForURL('**/admin/**');
  await page.waitForLoadState('networkidle');
}

/**
 * Wait for the admin dashboard to finish loading. Throws a descriptive
 * error if it surfaces an error state.
 */
async function waitForAdminPageLoaded(page: Page): Promise<void> {
  const tabsLocator = page.locator('[data-testid="admin-tabs"]');
  const errorLocator = page.locator('[data-testid="admin-error"]');
  const loadingLocator = page.locator('[data-testid="admin-loading"]');

  try {
    await loadingLocator.waitFor({ state: 'hidden' });
  } catch {
    // Already gone — fine.
  }

  const [tabsVisible, errorVisible] = await Promise.all([
    tabsLocator.isVisible().catch(() => false),
    errorLocator.isVisible().catch(() => false),
  ]);

  if (errorVisible) {
    const errorMessage = await page
      .locator('[data-testid="admin-error-message"]')
      .textContent()
      .catch(() => 'Unknown error');
    throw new Error(`Admin page failed to load: ${errorMessage}`);
  }

  if (!tabsVisible) {
    await tabsLocator.waitFor({ state: 'visible' });
  }
}

/**
 * Admin Settings tests modify global config (USER_APPROVAL_REQUIRED) which
 * can race with parallel registration tests. The settings toggle step
 * restores immediately, but we still serialise this whole file's admin
 * test for safety.
 */
test.describe('Admin Dashboard', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * Single admin user does the full admin dashboard tour: access control,
   * dashboard display, user list, navigation, user-management safeguards,
   * and the settings toggle (with immediate restore).
   *
   * Replaces 11 separate adminPage-based tests.
   */
  test('admin dashboard: access, display, user list, settings toggle', async ({
    adminPage,
  }) => {
    await test.step('admin link is visible in user menu', async () => {
      await adminPage.locator('[data-testid="user-menu-button"]').click();
      await expect(
        adminPage.locator('[data-testid="admin-menu-link"]')
      ).toBeVisible();
      // Close menu before clicking elsewhere.
      await adminPage.keyboard.press('Escape');
    });

    await test.step('navigates to admin via user menu and renders the page', async () => {
      await navigateToAdminViaMenu(adminPage);
      expect(adminPage.url()).toContain('/admin');
      await expect(
        adminPage.locator('[data-testid="admin-page"]')
      ).toBeVisible();
    });

    await test.step('dashboard shows tabs and at least 1 user in stats', async () => {
      await waitForAdminPageLoaded(adminPage);

      const pendingTab = adminPage.getByRole('tab', { name: /pending/i });
      const allUsersTab = adminPage.getByRole('tab', { name: /all users/i });
      await expect(pendingTab).toBeVisible();
      await expect(allUsersTab).toBeVisible();

      const totalUsersValue = adminPage.getByTestId('stat-total-users-value');
      const totalUsersText = await totalUsersValue.textContent();
      const match = totalUsersText?.match(/\((\d+)\)/);
      const count = match ? Number.parseInt(match[1], 10) : 0;
      expect(count).toBeGreaterThanOrEqual(1);
    });

    await test.step('all users tab shows user cards with admin status chip', async () => {
      const allUsersTab = adminPage.getByRole('tab', { name: /all users/i });
      await allUsersTab.click();

      await expect(
        adminPage.locator('[data-testid="all-users-tab"]')
      ).toBeVisible();

      const userList = adminPage.locator('[data-testid="all-users-list"]');
      const isEmpty = await adminPage
        .locator('[data-testid="all-users-empty"]')
        .isVisible()
        .catch(() => false);

      if (!isEmpty) {
        await expect(userList).toBeVisible();
        const adminCard = adminPage.locator(
          '[data-testid="user-card-e2e-admin"]'
        );
        await expect(adminCard).toBeVisible();

        const statusChip = adminCard.locator(
          '[data-testid="user-status-chip"]'
        );
        await expect(statusChip).toContainText(/admin/i);

        // Admin cannot disable themselves: button (when present) must be
        // disabled.
        const disableButton = adminPage.locator(
          '[data-testid="disable-user-e2e-admin"]'
        );
        if (await disableButton.isVisible().catch(() => false)) {
          await expect(disableButton).toBeDisabled();
        }
      }
    });

    await test.step('pending users tab renders empty state or list', async () => {
      const pendingTab = adminPage.getByRole('tab', { name: /pending/i });
      await pendingTab.click();

      await expect(
        adminPage.locator('[data-testid="pending-users-tab"]')
      ).toBeVisible();

      const emptyVisible = await adminPage
        .locator('[data-testid="pending-users-empty"]')
        .isVisible()
        .catch(() => false);
      const listVisible = await adminPage
        .locator('[data-testid="pending-users-list"]')
        .isVisible()
        .catch(() => false);
      expect(emptyVisible || listVisible).toBe(true);
    });

    await test.step('settings page exposes user-approval toggle that persists, then restores', async () => {
      const token = await adminPage.evaluate(() =>
        localStorage.getItem('srv:server-1:auth_token')
      );

      // Belt-and-braces: ensure starting state before we mutate.
      await adminPage.request.put(
        `${API_BASE}/api/v1/admin/config/USER_APPROVAL_REQUIRED`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          data: { value: 'false' },
        }
      );

      await adminPage.locator('[data-testid="admin-nav-settings"]').click();
      await adminPage.waitForURL('**/admin/settings');

      const toggle = adminPage.locator(
        '[data-testid="setting-toggle-user-approval"]'
      );
      await expect(toggle).toBeVisible();

      const isInitiallyChecked = await toggle.evaluate(el =>
        el.classList.contains('mat-mdc-slide-toggle-checked')
      );
      expect(isInitiallyChecked).toBe(false);

      await toggle.click();

      const snackbar = adminPage
        .locator('.mat-mdc-snack-bar-label')
        .filter({ hasText: /Setting saved/i })
        .first();
      await expect(snackbar).toBeVisible();

      const isNowChecked = await toggle.evaluate(el =>
        el.classList.contains('mat-mdc-slide-toggle-checked')
      );
      expect(isNowChecked).toBe(true);

      // Restore IMMEDIATELY to minimise impact on parallel tests.
      await adminPage.request.put(
        `${API_BASE}/api/v1/admin/config/USER_APPROVAL_REQUIRED`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          data: { value: 'false' },
        }
      );

      await adminPage.reload();
      await expect(toggle).toBeVisible();

      const isRestoredChecked = await toggle.evaluate(el =>
        el.classList.contains('mat-mdc-slide-toggle-checked')
      );
      expect(isRestoredChecked).toBe(false);
    });

    await test.step('back link navigates home', async () => {
      // Return to the main admin page where the back link lives.
      await navigateToAdminViaMenu(adminPage);
      await adminPage.locator('[data-testid="admin-back-link"]').click();
      await adminPage.waitForURL('/');
    });
  });
});

test.describe('Admin Access Control - non-admin users', () => {
  /**
   * Non-admin user gets no admin link in the menu and is redirected away
   * from /admin. Combines two previously-separate tests.
   */
  test('non-admin users have no admin link and are redirected from /admin', async ({
    authenticatedPage,
  }) => {
    await test.step('user menu does not expose admin link', async () => {
      await authenticatedPage
        .locator('[data-testid="user-menu-button"]')
        .click();
      await expect(
        authenticatedPage.locator('[data-testid="admin-menu-link"]')
      ).not.toBeVisible();
      await authenticatedPage.keyboard.press('Escape');
    });

    await test.step('direct navigation to /admin is redirected away', async () => {
      await authenticatedPage.goto('/admin');
      await authenticatedPage.waitForLoadState('networkidle');
      expect(authenticatedPage.url()).not.toContain('/admin');
    });
  });
});
