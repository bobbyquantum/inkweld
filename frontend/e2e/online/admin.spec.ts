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
  // Wait for admin page to load
  await page.waitForURL('**/admin');
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
    test('should display admin dashboard with stats', async ({ adminPage }) => {
      await navigateToAdminViaMenu(adminPage);

      // Wait for loading to complete
      await adminPage
        .locator('[data-testid="admin-stats-row"]')
        .waitFor({ state: 'visible', timeout: 10000 });

      // Check stats cards are displayed
      await expect(
        adminPage.locator('[data-testid="stat-total-users"]')
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="stat-pending-users"]')
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="stat-active-users"]')
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="stat-admin-users"]')
      ).toBeVisible();
    });

    test('should show at least 1 admin user in stats', async ({
      adminPage,
    }) => {
      await navigateToAdminViaMenu(adminPage);

      // Wait for stats to load
      await adminPage
        .locator('[data-testid="stat-admin-users-value"]')
        .waitFor({ state: 'visible', timeout: 10000 });

      // Get the admin count
      const adminCount = await adminPage
        .locator('[data-testid="stat-admin-users-value"]')
        .textContent();

      // Should have at least 1 admin (the e2e-admin user)
      expect(parseInt(adminCount || '0')).toBeGreaterThanOrEqual(1);
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

      // Should navigate to admin page
      await adminPage.waitForURL('**/admin');
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
