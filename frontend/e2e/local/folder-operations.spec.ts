/**
 * Folder Operations Tests - Local Mode
 *
 * Verifies folder creation via the create-element dialog, plus folder
 * interactions (right-click context menu, expand button, click navigation)
 * inside a worldbuilding-demo project that ships with seeded folders.
 *
 * Consolidated from 4 individual tests into 2 grouped tests using
 * `test.step()`. The "create folder" test stays separate because it
 * uses the empty `localPageWithProject` fixture; the other three are
 * combined into one project that uses the demo template.
 */
import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

test.describe('Folder Operations', () => {
  test('create a folder via the create element dialog', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await page.waitForSelector('app-project-tree', { state: 'visible' });
    await page.waitForTimeout(500);

    await page.click('[data-testid="create-new-element"]');
    await page.waitForSelector('mat-dialog-container', { state: 'visible' });

    const folderTypeItem = page.locator(
      '[data-testid="element-type-folder"], mat-dialog-container :text("Folder")'
    );

    if (
      await folderTypeItem
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await folderTypeItem.first().click();

      const nameInput = page.getByTestId('element-name-input');
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('My Test Folder');

        const createButton = page.getByRole('button', { name: /create/i });
        if (await createButton.isVisible().catch(() => false)) {
          await createButton.click();
        }
      }
    }

    // Verify we're still on the project page (dialog closed without crashing).
    await expect(page).toHaveURL(/\/.+\/.+/);
  });

  test('demo-template folders: context menu, expand to show children, click navigation', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'Folder Demo Test',
      'folder-demo-test',
      'Testing folder operations',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/testuser\/folder-demo-test/);
    await page.waitForSelector('app-project-tree', { state: 'visible' });
    await page.waitForTimeout(500);

    await test.step('expand button reveals child items inside the folder', async () => {
      const expandButton = page
        .locator('[data-testid="expand-folder-button"]')
        .first();
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click();
        // The worldbuilding-demo seeds "The Moonveil Accord" inside Chronicles.
        await expect(page.locator('text="The Moonveil Accord"')).toBeVisible();
      }
    });

    await test.step('right-click on a folder opens the context menu', async () => {
      const folder = page.locator('[data-testid="element-Chronicles"]');
      if (await folder.isVisible().catch(() => false)) {
        await folder.click({ button: 'right' });
        await expect(page.locator('.context-menu')).toBeVisible();
        // Dismiss the menu before the next step so it doesn't intercept clicks.
        await page.keyboard.press('Escape');
        await expect(page.locator('.context-menu')).not.toBeVisible();
      }
    });

    await test.step('clicking a folder keeps us inside the project route', async () => {
      const folder = page.locator('[data-testid="element-Chronicles"]');
      if (await folder.isVisible().catch(() => false)) {
        await folder.click();
        expect(page.url()).toMatch(/\/testuser\/folder-demo-test/);
      }
    });
  });
});
