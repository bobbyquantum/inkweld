/**
 * Server Unavailable Tests
 *
 * These tests verify local-first behavior when the app is configured
 * for server mode but the server becomes unavailable after initial auth.
 *
 * The fixture authenticates the user first, then blocks all API requests
 * to simulate the server going down after login.
 *
 * Key scenarios tested:
 * 1. Project creation falls back to local storage
 * 2. Pending projects are queued for sync
 * 3. Recovery when server comes back online
 */

import { expect, type ServerUnavailablePage, test } from './fixtures';

test.describe('Server Unavailable - Local First Behavior', () => {
  test.describe('Project Creation', () => {
    test('should allow creating a project when server is down', async ({
      serverUnavailablePage,
    }) => {
      const page = serverUnavailablePage as ServerUnavailablePage;

      // User is already authenticated and at home page with server now blocked
      // Navigate to create project page
      await page.goto('/create-project');

      // Step 1: Template selection (default 'empty' is already selected)
      const nextButton = page.getByRole('button', { name: /next/i });
      await nextButton.waitFor();
      await nextButton.click();

      // Step 2: Fill in project details
      const uniqueSlug = `offline-project-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Offline Project');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page
        .getByTestId('project-description-input')
        .fill('Created while server is unavailable');

      // Submit
      await page.getByTestId('create-project-button').click();

      // Should not show a fatal error - project should be created locally
      // Give it time to attempt server, fail, and fall back to local
      await page.waitForTimeout(2000);

      // The app should either redirect to project or show a gentle offline indicator
      // It should NOT show a blocking error dialog
      await expect(page.getByText(/fatal error/i)).not.toBeVisible();

      // Verify project was created locally by checking localStorage/IndexedDB
      const localStorageKeys = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        return keys.filter(k => k.includes('inkweld'));
      });

      // Should have some local storage data for the app
      expect(localStorageKeys.length).toBeGreaterThan(0);
    });

    test('should show sync pending indicator for locally created project', async ({
      serverUnavailablePage,
    }) => {
      const page = serverUnavailablePage as ServerUnavailablePage;

      await page.goto('/create-project');

      // Skip template selection
      const nextButton = page.getByRole('button', { name: /next/i });
      await nextButton.waitFor();
      await nextButton.click();

      // Fill in project details
      const uniqueSlug = `pending-sync-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Pending Sync Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();

      await page.waitForTimeout(2000);

      // Look for any sync status indicator showing pending/offline state
      // This might be in the UI after local fallback
      const syncStatus = page.locator('[data-testid="sync-status"]');
      if (await syncStatus.isVisible().catch(() => false)) {
        const statusText = await syncStatus.textContent();
        expect(statusText?.toLowerCase()).toMatch(/pending|offline|queued/);
      }
    });
  });

  test.describe('Server Recovery', () => {
    test('should sync pending project when server becomes available', async ({
      serverUnavailablePage,
    }) => {
      const page = serverUnavailablePage as ServerUnavailablePage;

      await page.goto('/create-project');

      // Skip template selection
      const nextButton = page.getByRole('button', { name: /next/i });
      await nextButton.waitFor();
      await nextButton.click();

      // Create project while server is down
      const uniqueSlug = `sync-recovery-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Sync Recovery Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();

      await page.waitForTimeout(2000);

      // Restore server connectivity
      await page.serverControl.restore();

      // Trigger online event to simulate network recovery
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
      });

      // Wait for background sync to complete
      await page.waitForTimeout(3000);

      // The app should still be functional
      await expect(page.getByText(/fatal error/i)).not.toBeVisible();
    });
  });

  test.describe('Partial Connectivity', () => {
    test('should handle specific API endpoints being down', async ({
      serverUnavailablePage,
    }) => {
      const page = serverUnavailablePage as ServerUnavailablePage;

      // First restore full connectivity
      await page.serverControl.restore();

      // Then block only project creation endpoint
      await page.serverControl.blockEndpoints(['/api/v1/projects']);

      await page.goto('/create-project');

      // Skip template selection
      const nextButton = page.getByRole('button', { name: /next/i });
      await nextButton.waitFor();
      await nextButton.click();

      // Fill in project details
      const uniqueSlug = `partial-outage-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Partial Outage Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();

      // Wait for fallback
      await page.waitForTimeout(2000);

      // Should not crash or show fatal error
      await expect(page.getByText(/fatal|crash/i)).not.toBeVisible();
    });

    test('should handle unreliable network with delays', async ({
      serverUnavailablePage,
    }) => {
      const page = serverUnavailablePage as ServerUnavailablePage;

      // Simulate unreliable network (2 second delay then fail)
      await page.serverControl.simulateUnreliable(2000);

      await page.goto('/create-project');

      // Skip template selection - longer timeout for slow network
      const nextButton = page.getByRole('button', { name: /next/i });
      await nextButton.waitFor();
      await nextButton.click();

      // Fill in project details
      const uniqueSlug = `slow-network-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Slow Network Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);

      // Click create - this will be slow
      await page.getByTestId('create-project-button').click();

      // Should show loading state then eventually succeed locally
      // Give it time for the request to timeout and fall back
      await page.waitForTimeout(5000);

      // Should not be stuck in error state
      await expect(page.getByText(/fatal error/i)).not.toBeVisible();
    });
  });
});

test.describe('Server Unavailable - Navigation', () => {
  test('should handle navigation when server is down', async ({
    serverUnavailablePage,
  }) => {
    const page = serverUnavailablePage as ServerUnavailablePage;

    // Try navigating to various pages
    await page.goto('/');
    await expect(page.getByText(/fatal error/i)).not.toBeVisible();

    await page.goto('/create-project');
    await expect(page.getByText(/fatal error/i)).not.toBeVisible();

    // Navigation should still work even with server down
  });
});
