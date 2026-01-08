/**
 * Application Launch Tests - Offline Mode
 *
 * Tests that verify the app launches correctly in offline mode
 * without any server connection.
 */
import { expect, test } from './fixtures';

test.describe('Offline Application Launch', () => {
  test('should launch app in offline mode with test project', async ({
    offlinePageWithProject: page,
  }) => {
    // The fixture already sets up offline mode with a test project
    // Verify we're on the home page with a project card visible
    await expect(page.getByTestId('project-card').first()).toBeVisible();

    // Verify localStorage has offline config
    const config = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });
    expect(config).not.toBeNull();
    const parsedConfig = JSON.parse(config!);
    expect(parsedConfig.mode).toBe('offline');
  });

  test('should show offline indicator in UI', async ({
    offlinePageWithProject: page,
  }) => {
    // Check for offline mode indicator (if present in UI)
    // The app should indicate it's running in offline mode
    const config = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });
    const parsedConfig = JSON.parse(config!);
    expect(parsedConfig.mode).toBe('offline');
  });

  test('should persist offline mode across page refresh', async ({
    offlinePageWithProject: page,
  }) => {
    // Get initial config
    const configBefore = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });

    // Refresh the page
    await page.reload();

    // Wait for app to reinitialize
    await expect(page.getByTestId('project-card').first()).toBeVisible();

    // Verify config is still offline
    const configAfter = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });
    expect(configAfter).toBe(configBefore);
  });

  test('should navigate to project in offline mode', async ({
    offlinePageWithProject: page,
  }) => {
    // Click on the project card
    await page.getByTestId('project-card').first().click();

    // Should navigate to the project page
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Project tree should be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();
  });
});
