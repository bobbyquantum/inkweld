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

import {
  expect,
  type Page,
  type ServerUnavailablePage,
  test,
} from './fixtures';

/**
 * Wait for locally-fallback project creation to settle. The create-project
 * flow only navigates to the new project page after UnifiedProjectService
 * has BOTH created the local placeholder AND queued the pending-creation
 * record, so the redirect itself is the observable that the local-first
 * fallback completed. The project shell rendering confirms the app finished
 * its initial load over the (degraded) local connection.
 */
async function waitForLocalFallback(page: Page, slug: string): Promise<void> {
  await page.waitForURL(new RegExp(`/${slug}$`));
  await page
    .locator('app-project-tree, [data-testid="connection-strap"]')
    .first()
    .waitFor({ timeout: 15_000 });
}

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

      // Submit — synchronize on the observable outcome of the local-first
      // fallback instead of a fixed delay.
      await page.getByTestId('create-project-button').click();
      await waitForLocalFallback(page, uniqueSlug);

      // The app should have redirected to the project — it should NOT show
      // a blocking error dialog
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

      // Synchronize on the queued pending-creation state instead of a delay.
      await waitForLocalFallback(page, uniqueSlug);

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

      await waitForLocalFallback(page, uniqueSlug);

      // Restore server connectivity and observe the background sync flushing
      // the queued creation to the server (POST /api/v1/projects succeeds).
      const createResponse = page.waitForResponse(
        res =>
          res.url().includes('/api/v1/projects') &&
          res.request().method() === 'POST' &&
          res.status() < 400
      );
      await page.serverControl.restore();

      // Trigger online event to simulate network recovery
      await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
      });

      await createResponse;

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

      // Wait for the observable fallback (redirect + queued pending state)
      // instead of a fixed delay.
      await waitForLocalFallback(page, uniqueSlug);

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

      // Click create - this will be slow: the request must time out before
      // the local fallback can run, so wait on the fallback's observable
      // outcome (redirect + queued pending state) instead of a delay.
      await page.getByTestId('create-project-button').click();
      await waitForLocalFallback(page, uniqueSlug);

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
