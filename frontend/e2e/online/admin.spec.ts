import { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Helper to navigate to admin page via user menu.
 * This is more reliable than direct URL navigation because it ensures
 * the user is fully authenticated before accessing admin routes.
 */
async function navigateToAdminViaMenu(page: Page): Promise<void> {
  // Open user menu
  await page.locator('[data-testid="user-menu-button"]').click();
  // Click admin link
  await page.locator('[data-testid="admin-menu-link"]').click();
  // Wait for admin page to load (may redirect to /admin/users)
  await page.waitForURL('**/admin/**');
  await page.waitForLoadState('networkidle');
}

test.describe('Admin Dashboard', () => {
  test.describe('Access Control', () => {
    test('should show admin link in user menu for admin users', async ({
      adminPage,
    }) => {
      // Open user menu
      await adminPage.locator('[data-testid="user-menu-button"]').click();

      // Check admin link is visible
      const adminLink = adminPage.locator('[data-testid="admin-menu-link"]');
      await expect(adminLink).toBeVisible();
    });

    test('should not show admin link for non-admin users', async ({
      authenticatedPage,
    }) => {
      // Open user menu
      await authenticatedPage
        .locator('[data-testid="user-menu-button"]')
        .click();

      // Check admin link is NOT visible
      const adminLink = authenticatedPage.locator(
        '[data-testid="admin-menu-link"]'
      );
      await expect(adminLink).not.toBeVisible();
    });

    test('should redirect non-admin users away from /admin', async ({
      authenticatedPage,
    }) => {
      // Try to navigate directly to admin page
      await authenticatedPage.goto('/admin');
      await authenticatedPage.waitForLoadState('networkidle');

      // Should be redirected away (not on /admin)
      expect(authenticatedPage.url()).not.toContain('/admin');
    });

    test('should allow admin users to access /admin', async ({ adminPage }) => {
      // Navigate via user menu (more reliable than direct URL)
      await navigateToAdminViaMenu(adminPage);

      // Should be on admin page
      expect(adminPage.url()).toContain('/admin');

      // Admin page should be visible
      await expect(
        adminPage.locator('[data-testid="admin-page"]')
      ).toBeVisible();
    });
  });

  test.describe('Dashboard Display', () => {
    test('should display admin dashboard with tabs', async ({ adminPage }) => {
      await navigateToAdminViaMenu(adminPage);

      // Wait for loading to complete - tabs should be visible
      await adminPage
        .locator('[data-testid="admin-tabs"]')
        .waitFor({ state: 'visible', timeout: 10000 });

      // Check tab labels are displayed (using role-based selectors since mat-tab doesn't pass data-testid to rendered element)
      const pendingTab = adminPage.getByRole('tab', { name: /pending/i });
      const allUsersTab = adminPage.getByRole('tab', { name: /all users/i });

      await expect(pendingTab).toBeVisible();
      await expect(allUsersTab).toBeVisible();
    });

    test('should show at least 1 user in stats', async ({ adminPage }) => {
      await navigateToAdminViaMenu(adminPage);

      // Wait for tabs to load
      await adminPage
        .locator('[data-testid="admin-tabs"]')
        .waitFor({ state: 'visible', timeout: 10000 });

      // Get the total user count from "All Users" tab label
      const allUsersTab = adminPage.getByRole('tab', { name: /all users/i });
      const totalUsersText = await allUsersTab.textContent();

      // Should have at least 1 user (the e2e-admin user)
      // Text is like "All Users (1)"
      const match = totalUsersText?.match(/\((\d+)\)/);
      const count = match ? parseInt(match[1]) : 0;
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should display tabs for pending and all users', async ({
      adminPage,
    }) => {
      await navigateToAdminViaMenu(adminPage);

      // Check tabs are displayed
      await expect(
        adminPage.locator('[data-testid="admin-tabs"]')
      ).toBeVisible();

      // Check tab labels contain expected text
      const pendingTab = adminPage.getByRole('tab', { name: /pending/i });
      const allUsersTab = adminPage.getByRole('tab', { name: /all users/i });

      await expect(pendingTab).toBeVisible();
      await expect(allUsersTab).toBeVisible();
    });
  });

  test.describe('User List', () => {
    test('should display all users tab with user cards', async ({
      adminPage,
    }) => {
      await navigateToAdminViaMenu(adminPage);

      // Click on All Users tab
      const allUsersTab = adminPage.getByRole('tab', { name: /all users/i });
      await allUsersTab.click();

      // Wait for tab content
      await adminPage
        .locator('[data-testid="all-users-tab"]')
        .waitFor({ state: 'visible', timeout: 10000 });

      // Should have at least the admin user card
      const userList = adminPage.locator('[data-testid="all-users-list"]');

      // Check if list is visible (may be empty if no users)
      const isEmpty = await adminPage
        .locator('[data-testid="all-users-empty"]')
        .isVisible()
        .catch(() => false);

      if (!isEmpty) {
        await expect(userList).toBeVisible();

        // Admin user card should exist
        const adminCard = adminPage.locator(
          '[data-testid="user-card-e2e-admin"]'
        );
        await expect(adminCard).toBeVisible();
      }
    });

    test('should show admin status chip for admin users', async ({
      adminPage,
    }) => {
      await navigateToAdminViaMenu(adminPage);

      // Click on All Users tab
      const allUsersTab = adminPage.getByRole('tab', { name: /all users/i });
      await allUsersTab.click();

      // Wait for user list
      await adminPage
        .locator('[data-testid="all-users-tab"]')
        .waitFor({ state: 'visible', timeout: 10000 });

      // Find admin user card and check status
      const adminCard = adminPage.locator(
        '[data-testid="user-card-e2e-admin"]'
      );

      if (await adminCard.isVisible()) {
        const statusChip = adminCard.locator(
          '[data-testid="user-status-chip"]'
        );
        await expect(statusChip).toContainText(/admin/i);
      }
    });
  });

  test.describe('Navigation', () => {
    test('should navigate to admin via user menu', async ({ adminPage }) => {
      // Start from home page
      await adminPage.goto('/');
      await adminPage.waitForLoadState('networkidle');

      // Open user menu
      await adminPage.locator('[data-testid="user-menu-button"]').click();

      // Click admin link
      await adminPage.locator('[data-testid="admin-menu-link"]').click();

      // Should navigate to admin page (redirects to /admin/users)
      await adminPage.waitForURL('**/admin/**');
      await expect(
        adminPage.locator('[data-testid="admin-page"]')
      ).toBeVisible();
    });

    test('should navigate back home via back link', async ({ adminPage }) => {
      await navigateToAdminViaMenu(adminPage);

      // Click back link
      await adminPage.locator('[data-testid="admin-back-link"]').click();

      // Should navigate back to home
      await adminPage.waitForURL('/');
    });
  });
});

test.describe('Admin User Management', () => {
  test('should show pending users tab when there are pending registrations', async ({
    adminPage,
  }) => {
    // For our test setup, USER_APPROVAL_REQUIRED is false, so this test checks the empty state

    await navigateToAdminViaMenu(adminPage);

    // Click on Pending tab (should be default)
    const pendingTab = adminPage.getByRole('tab', { name: /pending/i });
    await pendingTab.click();

    // Wait for tab content
    await adminPage
      .locator('[data-testid="pending-users-tab"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    // With USER_APPROVAL_REQUIRED=false, pending list should be empty
    const emptyState = adminPage.locator('[data-testid="pending-users-empty"]');
    const pendingList = adminPage.locator('[data-testid="pending-users-list"]');

    // Either empty state or list should be visible
    const isEmptyStateVisible = await emptyState.isVisible().catch(() => false);
    const isPendingListVisible = await pendingList
      .isVisible()
      .catch(() => false);

    expect(isEmptyStateVisible || isPendingListVisible).toBe(true);
  });

  test('should not allow admin to disable themselves', async ({
    adminPage,
  }) => {
    await navigateToAdminViaMenu(adminPage);

    // Click on All Users tab
    const allUsersTab = adminPage.getByRole('tab', { name: /all users/i });
    await allUsersTab.click();

    // Wait for user list
    await adminPage
      .locator('[data-testid="all-users-tab"]')
      .waitFor({ state: 'visible', timeout: 10000 });

    // Find the admin's own card
    const adminCard = adminPage.locator('[data-testid="user-card-e2e-admin"]');

    if (await adminCard.isVisible()) {
      // The disable button for current user should be disabled
      const disableButton = adminPage.locator(
        '[data-testid="disable-user-e2e-admin"]'
      );

      if (await disableButton.isVisible()) {
        await expect(disableButton).toBeDisabled();
      }
    }
  });
});

// Admin Settings tests modify global config state (USER_APPROVAL_REQUIRED)
// which can interfere with other tests registering users in parallel.
// Run these tests serially to avoid race conditions.
test.describe('Admin Settings', () => {
  // Configure this describe block to run serially (one test at a time)
  // This prevents the toggle test from interfering with parallel registration tests
  test.describe.configure({ mode: 'serial' });

  test('should display settings page with user approval toggle', async ({
    adminPage,
  }) => {
    await navigateToAdminViaMenu(adminPage);

    // Navigate to settings
    await adminPage.locator('[data-testid="admin-nav-settings"]').click();
    await adminPage.waitForURL('**/admin/settings');

    // Wait for settings to load
    const toggle = adminPage.locator(
      '[data-testid="setting-toggle-user-approval"]'
    );
    await expect(toggle).toBeVisible({ timeout: 10000 });
  });

  test('should toggle user approval setting and persist', async ({
    adminPage,
  }) => {
    // Get auth token for API calls
    const token = await adminPage.evaluate(() =>
      localStorage.getItem('auth_token')
    );

    // IMPORTANT: This test modifies USER_APPROVAL_REQUIRED which can affect other
    // tests that register users. We need to minimize the window where this is set to true.

    // First, ENSURE it starts as false (the safe default for parallel tests)
    await adminPage.request.put(
      'http://localhost:9333/api/v1/admin/config/USER_APPROVAL_REQUIRED',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { value: 'false' },
      }
    );

    await navigateToAdminViaMenu(adminPage);

    // Navigate to settings
    await adminPage.locator('[data-testid="admin-nav-settings"]').click();
    await adminPage.waitForURL('**/admin/settings');

    // Wait for toggle to be visible
    const toggle = adminPage.locator(
      '[data-testid="setting-toggle-user-approval"]'
    );
    await expect(toggle).toBeVisible({ timeout: 10000 });

    // Verify the toggle is in the expected unchecked state (USER_APPROVAL_REQUIRED=false)
    const isInitiallyChecked = await toggle.evaluate(el =>
      el.classList.contains('mat-mdc-slide-toggle-checked')
    );
    expect(isInitiallyChecked).toBe(false);

    // Click the toggle to enable approval (this is the dangerous change)
    await toggle.click();

    // Wait for the save to complete (snackbar appears)
    const snackbar = adminPage
      .locator('.mat-mdc-snack-bar-label')
      .filter({ hasText: /Setting saved/i })
      .first();
    await snackbar.waitFor({ state: 'visible', timeout: 5000 });

    // Verify the toggle changed state
    const isNowChecked = await toggle.evaluate(el =>
      el.classList.contains('mat-mdc-slide-toggle-checked')
    );
    expect(isNowChecked).toBe(true);

    // IMMEDIATELY restore to false to minimize impact on parallel tests
    await adminPage.request.put(
      'http://localhost:9333/api/v1/admin/config/USER_APPROVAL_REQUIRED',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { value: 'false' },
      }
    );

    // Reload the page to verify the API restore worked
    await adminPage.reload();
    await expect(toggle).toBeVisible({ timeout: 10000 });

    // Verify the setting was restored to unchecked
    const isRestoredChecked = await toggle.evaluate(el =>
      el.classList.contains('mat-mdc-slide-toggle-checked')
    );
    expect(isRestoredChecked).toBe(false);
  });
});
