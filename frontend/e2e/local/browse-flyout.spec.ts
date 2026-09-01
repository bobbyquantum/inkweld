/**
 * Browse Flyout Tests - Local Mode
 *
 * Covers the collapsed sidebar's "Browse Documents" button, which opens the
 * shared `app-element-tree-menu` flyout rooted at the project's top-level
 * elements. Folder rows expand into nested submenus; clicking a document row
 * opens it in a tab and navigates there.
 *
 * Rows are addressed by `element-tree-menu-row-<elementId>`. The
 * worldbuilding-demo template seeds stable element ids, so these are fixed.
 */
import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

/** Seeded ids from the worldbuilding-demo template. */
const README_ROW = 'element-tree-menu-row-readme-001';
const CHRONICLES_ROW = 'element-tree-menu-row-folder-chronicles';
const ACCORD_ROW = 'element-tree-menu-row-doc-moonveil-accord';

test.describe('Browse Flyout', () => {
  test('collapsed sidebar browse button navigates via nested flyout', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('empty-state').waitFor({ state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'Browse Flyout Test',
      'browse-flyout-test',
      'Testing the browse flyout',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/testuser\/browse-flyout-test/);
    await page.getByTestId('project-tree').waitFor({ state: 'visible' });

    await test.step('collapse the sidebar', async () => {
      await page.getByTestId('toolbar-collapse-button').click();
      await expect(page.getByTestId('collapsed-browse-button')).toBeVisible();
    });

    await test.step('browse button lists top-level elements', async () => {
      await page.getByTestId('collapsed-browse-button').click();
      await expect(page.getByTestId(README_ROW)).toBeVisible();
      await expect(page.getByTestId(CHRONICLES_ROW)).toBeVisible();
    });

    await test.step('folder rows expand into a nested submenu', async () => {
      await page.getByTestId(CHRONICLES_ROW).click();
      await expect(page.getByTestId(ACCORD_ROW)).toBeVisible();
    });

    await test.step('clicking a document row opens it', async () => {
      await page.getByTestId(ACCORD_ROW).click();

      await page.waitForURL(/\/document\/doc-moonveil-accord$/);
      // Selecting a row closes the whole menu chain, root menu included.
      await expect(page.getByTestId(README_ROW)).toBeHidden();
    });
  });
});
