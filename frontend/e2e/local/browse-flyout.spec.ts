/**
 * Browse Flyout Tests - Local Mode
 *
 * Covers the collapsed sidebar's "Browse Documents" button, which opens the
 * shared `app-element-tree-menu` flyout rooted at the project's top-level
 * elements. Folder rows expand into nested submenus; clicking a document row
 * opens it in a tab and navigates there.
 */
import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

/** Matches any row rendered by the element tree menu. */
const ROW = '[data-testid^="element-tree-menu-row-"]';
/** Folder rows are submenu triggers, so Material marks them aria-haspopup="menu". */
const FOLDER_ROW = `${ROW}[aria-haspopup="menu"]`;

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

    const root = page.locator('.element-tree-menu-panel').first();

    await test.step('browse button lists top-level elements', async () => {
      await page.getByTestId('collapsed-browse-button').click();
      await expect(root).toBeVisible();
      // The demo template seeds a README plus a set of top-level folders.
      await expect(
        root.getByRole('menuitem', { name: 'README' })
      ).toBeVisible();
      await expect(
        root.getByRole('menuitem', { name: 'Chronicles' })
      ).toBeVisible();
      await expect(root.locator(FOLDER_ROW).first()).toBeVisible();
    });

    await test.step('folder rows expand into a nested submenu', async () => {
      await root.getByRole('menuitem', { name: 'Chronicles' }).click();
      const submenu = page.locator('.element-tree-menu-panel').last();
      await expect(
        submenu.getByRole('menuitem', { name: 'The Moonveil Accord' })
      ).toBeVisible();
    });

    await test.step('clicking a document row opens it', async () => {
      await page
        .locator('.element-tree-menu-panel')
        .last()
        .getByRole('menuitem', { name: 'The Moonveil Accord' })
        .click();

      await page.waitForURL(/\/document\/doc-moonveil-accord$/);
      // Selecting a row closes the whole menu chain.
      await expect(page.locator('.element-tree-menu-panel')).toHaveCount(0);
    });
  });
});
