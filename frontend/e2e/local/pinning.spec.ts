/**
 * Pinning Feature Tests - Local Mode
 *
 * Verifies that project owners can pin / unpin elements, that pins appear in
 * both the sidebar pinned-section and the Home tab Pinned column, and that
 * pins survive a full page reload (persisted via IndexedDB in local mode).
 */
import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

/** Navigate to the project and wait for the tree to be ready. */
async function openProject(
  page: Parameters<typeof test>[1]['page'],
  slug: string
) {
  await page.waitForURL(new RegExp(`testuser/${slug}`));
  await page.waitForSelector('app-project-tree', { state: 'visible' });
  // Give IndexedDB a moment to hydrate
  await page.waitForTimeout(500);
}

/** Right-click the named tree node and click Pin/Unpin. */
async function togglePinViaContextMenu(
  page: Parameters<typeof test>[1]['page'],
  elementName: string
) {
  const node = page.locator(`[data-testid="element-${elementName}"]`);
  await node.waitFor({ state: 'visible' });
  await node.click({ button: 'right' });
  await page.waitForSelector('.context-menu', { state: 'visible' });
  await page.locator('[data-testid="context-menu-pin"]').click();
  // Allow the Yjs write + IndexedDB flush to complete
  await page.waitForTimeout(500);
}

test.describe('Pinning', () => {
  test('pinned element appears in the sidebar pinned section', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(page, 'Pin Test', 'pin-test');
    await openProject(page, 'pin-test');

    // Pinned section should not exist yet
    await expect(page.locator('.pinned-section')).not.toBeVisible();

    // Pin the default README element
    await togglePinViaContextMenu(page, 'README');

    // Pinned section should now appear with README
    await expect(page.locator('.pinned-section')).toBeVisible();
    await expect(page.locator('[data-testid="pinned-README"]')).toBeVisible();
  });

  test('pinned element appears in the Home tab Pinned column', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(page, 'Pin Home Test', 'pin-home-test');
    await openProject(page, 'pin-home-test');

    await togglePinViaContextMenu(page, 'README');

    // Navigate to the Home tab
    await page.locator('[data-testid="toolbar-home-button"]').click();
    await page.waitForTimeout(300);

    // Home tab Pinned column should list README
    await expect(
      page.locator('[data-testid="home-pinned-README"]')
    ).toBeVisible();
    // Empty-state hint should be gone
    await expect(
      page.locator('[data-testid="home-pinned-empty"]')
    ).not.toBeVisible();
  });

  test('pins survive a page reload', async ({ localPage: page }) => {
    await createProjectWithTwoSteps(page, 'Pin Reload Test', 'pin-reload-test');
    await openProject(page, 'pin-reload-test');

    await togglePinViaContextMenu(page, 'README');

    // Confirm pin is visible before reload
    await expect(page.locator('[data-testid="pinned-README"]')).toBeVisible();

    // Reload the page — IndexedDB should restore the pin
    await page.reload();
    await openProject(page, 'pin-reload-test');

    await expect(page.locator('.pinned-section')).toBeVisible();
    await expect(page.locator('[data-testid="pinned-README"]')).toBeVisible();

    // Home tab should also show the pin after reload
    await page.locator('[data-testid="toolbar-home-button"]').click();
    await page.waitForTimeout(300);
    await expect(
      page.locator('[data-testid="home-pinned-README"]')
    ).toBeVisible();
  });

  test('unpinning removes element from both surfaces', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(page, 'Unpin Test', 'unpin-test');
    await openProject(page, 'unpin-test');

    // Pin first
    await togglePinViaContextMenu(page, 'README');
    await expect(page.locator('[data-testid="pinned-README"]')).toBeVisible();

    // Unpin via context menu (same item toggles)
    await togglePinViaContextMenu(page, 'README');

    // Pinned section should disappear
    await expect(page.locator('.pinned-section')).not.toBeVisible();

    // Home tab empty state should be shown
    await page.locator('[data-testid="toolbar-home-button"]').click();
    await page.waitForTimeout(300);
    await expect(
      page.locator('[data-testid="home-pinned-empty"]')
    ).toBeVisible();
  });

  test('project title is not blanked after pinning in local mode', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(
      page,
      'Title Preserve Test',
      'title-preserve-test'
    );
    await openProject(page, 'title-preserve-test');

    // Navigate to home tab to see the project title
    await page.locator('[data-testid="toolbar-home-button"]').click();
    await page.waitForTimeout(300);

    // Record the title shown before pinning
    const titleBefore = await page
      .locator('h1, h2, .project-title, [data-testid="project-title"]')
      .first()
      .textContent();

    // Go back, pin an element
    await page
      .locator('[data-testid="toolbar-home-button"]')
      .click()
      .catch(() => {});
    // Navigate to tree by going back to project URL
    await page.goto(`/testuser/title-preserve-test`);
    await openProject(page, 'title-preserve-test');
    await togglePinViaContextMenu(page, 'README');

    // Navigate to home tab again
    await page.locator('[data-testid="toolbar-home-button"]').click();
    await page.waitForTimeout(300);

    // Title must still be present and non-empty
    const titleAfter = await page
      .locator('h1, h2, .project-title, [data-testid="project-title"]')
      .first()
      .textContent();
    expect(titleAfter?.trim()).toBeTruthy();
    expect(titleAfter?.trim()).toBe(titleBefore?.trim());
  });
});
