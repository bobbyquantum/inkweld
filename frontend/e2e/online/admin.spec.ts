import { type Page } from '@playwright/test';

import {
  canStartIsolatedBackend,
  type IsolatedBackend,
  openAppOn,
  signInAsAdmin,
  startIsolatedBackend,
} from '../common/isolated-backend';
import { TEST_PASSWORDS } from '../common/test-credentials';
import { expect, test } from './fixtures';

/**
 * Helper to navigate to admin page via user menu.
 * This is more reliable than direct URL navigation because it ensures
 * the user is fully authenticated before accessing admin routes.
 */
async function navigateToAdminViaMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  await page.locator('[data-testid="admin-menu-link"]').click();
  await page.waitForURL('**/admin/**');
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

test.describe('Admin Dashboard', () => {
  test.describe.configure({ mode: 'serial' });

  /**
   * Single admin user does the full admin dashboard tour: access control,
   * dashboard display, user list, navigation, user-management safeguards,
   * and the settings page.
   *
   * Replaces 11 separate adminPage-based tests.
   */
  test('admin dashboard: access, display, user list, settings page', async ({
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

    await test.step('settings page exposes the user-approval toggle', async () => {
      await adminPage.locator('[data-testid="admin-nav-settings"]').click();
      await adminPage.waitForURL('**/admin/settings');
      await expect(
        adminPage.locator('[data-testid="setting-toggle-user-approval"]')
      ).toBeVisible();
    });

    await test.step('back link navigates home', async () => {
      // Return to the main admin page where the back link lives.
      await navigateToAdminViaMenu(adminPage);
      await adminPage.locator('[data-testid="admin-back-link"]').click();
      await adminPage.waitForURL('/');
    });
  });
});

/**
 * USER_APPROVAL_REQUIRED is instance-wide: while it is on, every registration
 * on the same backend comes back pending, however quickly it is put back. So
 * switching it happens on a private backend.
 */
test.describe('Admin settings: user approval (USER_APPROVAL_REQUIRED)', () => {
  // Skipped outside the online config: the instance-wide flag needs a private
  // Bun backend, which only that config can start.
  test.skip(
    !canStartIsolatedBackend(),
    'Needs a private Bun backend; only the online config can start one'
  );

  let backend: IsolatedBackend;

  test.beforeAll(async () => {
    backend = await startIsolatedBackend();
  });

  test.afterAll(async () => {
    await backend?.stop();
  });

  test('turning it on persists, and new accounts then wait for approval', async ({
    browser,
  }) => {
    const page = await openAppOn(
      browser,
      backend,
      await signInAsAdmin(backend)
    );
    // The admin route sends a browser with no cached user home, so load the
    // home page first, as the adminPage fixture does.
    await page.goto('/');
    await expect(page.getByTestId('user-menu-button')).toBeVisible();
    await page.goto('/admin/settings');

    const toggle = page.getByTestId('setting-toggle-user-approval');
    const checked = /mat-mdc-slide-toggle-checked/;
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toHaveClass(checked);

    await toggle.click();
    await expect(
      page
        .locator('.mat-mdc-snack-bar-label')
        .filter({ hasText: /Setting saved/i })
        .first()
    ).toBeVisible();
    await expect(toggle).toHaveClass(checked);

    await page.reload();
    await expect(toggle).toHaveClass(checked);

    const registration = await fetch(`${backend.url}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `pending-${Date.now().toString(36)}`,
        password: TEST_PASSWORDS.VALID,
      }),
    });
    expect(registration.ok, 'register while approval is required').toBe(true);
    expect(
      ((await registration.json()) as { requiresApproval: boolean })
        .requiresApproval
    ).toBe(true);

    await page.context().close();
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
      await expect(authenticatedPage).not.toHaveURL(/\/admin/);
    });
  });
});
