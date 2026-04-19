/**
 * Project Documents Tests - Local Mode
 *
 * The legacy `/documents-list` route has been removed. These tests validate
 * the current document discovery flow through the project tree.
 */
import { expect, test } from './fixtures';

test.describe('Project Documents', () => {
  test('should show default README document in project tree', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await expect(page.getByTestId('project-tree')).toBeVisible();
    await expect(page.getByTestId('element-README')).toBeVisible();
  });

  test('should show create element button in project view', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await expect(page.getByTestId('create-new-element')).toBeVisible();
  });

  test('should open README document from project tree', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await page.getByTestId('element-README').click();
    await expect(page).toHaveURL(/\/document\/.+/);
    await expect(page.getByTestId('document-editor')).toBeVisible();
  });

  test('should show seeded project content in project tree', async ({
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

  test('should keep project settings route available', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await page.getByTestId('sidebar-settings-button').click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  });
});
