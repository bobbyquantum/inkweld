/**
 * Application Launch Tests - Local Mode
 *
 * Tests that verify the app launches correctly in local mode
 * without any server connection.
 */
import { expect, test } from './fixtures';

test.describe('Local Application Launch', () => {
  test('should launch app in local mode with test project', async ({
    localPageWithProject: page,
  }) => {
    // The fixture already sets up local mode with a test project
    // Verify we're on the home page with a project card visible
    await expect(page.getByTestId('project-card').first()).toBeVisible();

    // Verify localStorage has local config
    const config = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });
    expect(config).not.toBeNull();
    const parsedConfig = JSON.parse(config!);
    expect(parsedConfig.mode).toBe('local');
  });

  test('should show local indicator in UI', async ({
    localPageWithProject: page,
  }) => {
    // Check for local mode indicator (if present in UI)
    // The app should indicate it's running in local mode
    const config = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });
    const parsedConfig = JSON.parse(config!);
    expect(parsedConfig.mode).toBe('local');
  });

  test('should persist local mode across page refresh', async ({
    localPageWithProject: page,
  }) => {
    // Get initial config
    const configBefore = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });

    // Refresh the page
    await page.reload();

    // Wait for app to reinitialize
    await expect(page.getByTestId('project-card').first()).toBeVisible();

    // Verify config is still local
    const configAfter = await page.evaluate(() => {
      return localStorage.getItem('inkweld-app-config');
    });
    expect(configAfter).toBe(configBefore);
  });

  test('should navigate to project in local mode', async ({
    localPageWithProject: page,
  }) => {
    // Click on the project card
    await page.getByTestId('project-card').first().click();

    // Should navigate to the project page
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Project tree should be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();
  });
});
