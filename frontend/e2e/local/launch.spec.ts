/**
 * Application Launch Tests - Local Mode
 *
 * Verifies the app launches correctly in local mode without any server
 * connection, that local mode persists across reload, and that navigation
 * into a project still works.
 *
 * Consolidated from 4 individual tests into 1 grouped test using
 * `test.step()`. The local-mode indicator and config-active-mode checks
 * are merged with launch + persistence + navigation since they all
 * operate on the same `localPageWithProject` fixture.
 */
import { expect, test } from './fixtures';

/** Read the active mode from the v2 (or legacy v1) config blob. */
function getActiveMode(config: string): 'local' | 'server' | undefined {
  const parsed = JSON.parse(config);
  if (parsed.version === 2) {
    const activeConfig = parsed.configurations?.find(
      (c: { id: string }) => c.id === parsed.activeConfigId
    );
    return activeConfig?.type;
  }
  // Legacy v1 format fallback.
  return parsed.mode;
}

test.describe('Local Application Launch', () => {
  test('launch in local mode, persist across reload, navigate to project', async ({
    localPageWithProject: page,
  }) => {
    await test.step('app launches with local config and a project card visible', async () => {
      await expect(page.getByTestId('project-card').first()).toBeVisible();

      const config = await page.evaluate(() =>
        localStorage.getItem('inkweld-app-config')
      );
      expect(config).not.toBeNull();
      expect(getActiveMode(config!)).toBe('local');
    });

    await test.step('local mode persists across a page reload', async () => {
      const configBefore = await page.evaluate(() =>
        localStorage.getItem('inkweld-app-config')
      );

      await page.reload();
      await expect(page.getByTestId('project-card').first()).toBeVisible();

      const configAfter = await page.evaluate(() =>
        localStorage.getItem('inkweld-app-config')
      );
      expect(getActiveMode(configAfter!)).toBe(getActiveMode(configBefore!));
      expect(getActiveMode(configAfter!)).toBe('local');
    });

    await test.step('clicking a project card opens the project tree', async () => {
      await page.getByTestId('project-card').first().click();
      await expect(page).toHaveURL(/\/.+\/.+/);
      await expect(page.getByTestId('project-tree')).toBeVisible();
    });
  });
});
