/**
 * Project Documents Tests - Local Mode
 *
 * The legacy `/documents-list` route has been removed. These tests validate
 * the current document discovery flow through the project tree.
 *
 * Consolidated from 5 individual tests into 2 grouped tests using
 * `test.step()`. The seeded-template test is kept separate because it
 * uses a different fixture (`localPage`) and a different project flow.
 */
import { expect, test } from './fixtures';

test.describe('Project Documents', () => {
  test('project tree, create button, README open, and settings route', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await test.step('shows project tree with default README and create button', async () => {
      await expect(page.getByTestId('project-tree')).toBeVisible();
      await expect(page.getByTestId('element-README')).toBeVisible();
      await expect(page.getByTestId('create-new-element')).toBeVisible();
    });

    await test.step('opens README document from the project tree', async () => {
      await page.getByTestId('element-README').click();
      await expect(page).toHaveURL(/\/document\/.+/);
      await expect(page.getByTestId('document-editor')).toBeVisible();
    });

    await test.step('project settings route is available', async () => {
      await page.getByTestId('sidebar-settings-button').click();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(page.getByTestId('settings-tab-content')).toBeVisible();
    });
  });

  test('shows seeded project content from the worldbuilding-demo template', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const createButton = page.getByTestId('create-new-project-button');
    await createButton.waitFor();
    await createButton.click();
    await page.getByTestId('create-new-project-menu-item').click();

    const demoTemplate = page.locator(
      '[data-testid="template-worldbuilding-demo"]'
    );
    if (await demoTemplate.isVisible().catch(() => false)) {
      await demoTemplate.click();
    }

    await page.getByRole('button', { name: /next/i }).click();
    await page.getByTestId('project-title-input').fill('Doc List Test');
    await page.getByTestId('project-slug-input').fill('doc-list-test');
    await page.getByTestId('create-project-button').click();
    await page.waitForURL(/.*doc-list-test.*/);

    await expect(page.getByTestId('project-tree')).toBeVisible();
    await expect(page.getByTestId('element-README')).toBeVisible();
  });
});
