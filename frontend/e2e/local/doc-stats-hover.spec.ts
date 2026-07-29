/**
 * Doc Stats Hover Tests - Local Mode
 *
 * Verifies that hovering the sync status indicators in local mode does not
 * crash or leak API requests. The local fixture blocks all API/WS requests
 * and fails the test if any are made, so this test implicitly verifies the
 * local-mode guard in both ConnectionStatusComponent and
 * DocumentElementEditorComponent.
 */
import { expect, test } from './fixtures';

test.describe('Doc Stats Hover (Local Mode)', () => {
  test('hovering sync status does not leak API requests', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/testuser\//);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Hover the sidebar connection status — should not trigger any API call
    const connectionStatus = page.getByTestId('sidebar-connection-status');
    await expect(connectionStatus).toBeVisible();
    await connectionStatus.hover();
    // Small wait to ensure any async hover handler would have fired
    await page.waitForTimeout(500);

    // Open a document to test the editor sync status hover
    const firstDoc = page
      .getByRole('treeitem')
      .filter({ hasNot: page.locator('button') })
      .first();
    if (await firstDoc.isVisible()) {
      await firstDoc.click();
      await expect(page.getByTestId('document-sync-status')).toBeVisible({
        timeout: 5000,
      });

      // Hover the document sync status dot
      await page.getByTestId('document-sync-status').hover();
      await page.waitForTimeout(500);
    }

    // The local fixture's afterEach will fail the test if any API requests
    // were made. Reaching this point means the local-mode guards worked.
  });
});
