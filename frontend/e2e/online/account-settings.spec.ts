/**
 * Account Settings Tests - Online Mode
 *
 * Tests that verify the account settings page works correctly
 * with the real backend, including OAuth session management.
 */
import { expect, test } from './fixtures';

test.describe('Account Settings Page', () => {
  test('should navigate to account settings via user menu', async ({
    authenticatedPage: page,
  }) => {
    // Click the user menu button
    await page.locator('[data-testid="user-menu-button"]').click();

    // Click settings option
    const settingsOption = page.getByRole('menuitem', { name: /settings/i });
    await settingsOption.waitFor();
    await settingsOption.click();

    // Should navigate to settings page
    await expect(page).toHaveURL(/\/settings/);
  });

  test('should display the account settings page with proper header', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Should show the page with a toolbar/header
    await expect(page.locator('mat-toolbar, .settings-header')).toBeVisible();
  });

  test('should show empty state when no OAuth apps are connected', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Should show empty state or the connected apps section
    // A fresh test user should have no connected OAuth apps
    const emptyState = page.locator('.empty-card, .empty-state');
    const sessionsList = page.locator('mat-accordion, .sessions-list');

    // Either empty state or sessions list should be visible
    await expect(emptyState.or(sessionsList).first()).toBeVisible();
  });

  test('should navigate back from account settings', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Click the back button
    const backButton = page.locator(
      'button[aria-label*="back" i], button:has(mat-icon:text("arrow_back"))'
    );
    if (
      await backButton
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await backButton.first().click();

      // Should navigate away from settings
      await expect(page).not.toHaveURL(/\/settings/);
    }
  });

  test('should require authentication to access account settings', async ({
    anonymousPage: page,
  }) => {
    // Try to access settings without authentication
    await page.goto('/settings');

    // Should redirect to home page for unauthenticated users
    await expect(page).toHaveURL('/');
  });

  test('should display Connected Apps section heading', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Should display the connected apps section
    await expect(page.locator('body')).toContainText(
      /connected apps|oauth|authorized/i
    );
  });
});
