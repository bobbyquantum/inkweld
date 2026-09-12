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

    await page.getByTestId('project-tree').waitFor({ state: 'visible' });

    await page.click('[data-testid="create-new-element"]');
    await page.waitForSelector('mat-dialog-container', { state: 'visible' });

    // The name field and action bar are always present in the redesigned
    // single-pane dialog, but Create stays disabled until a type is picked.
    await page.getByTestId('element-type-folder').click();

    const nameInput = page.getByTestId('element-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('My Test Folder');

    const createButton = page.getByTestId('create-element-button');
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // The new folder appears in the tree.
    await expect(page.getByTestId('element-My Test Folder')).toBeVisible();
  });

  test('demo-template folders: context menu, expand to show children, click navigation', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.getByTestId('empty-state').waitFor({ state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'Folder Demo Test',
      'folder-demo-test',
      'Testing folder operations',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/testuser\/folder-demo-test/);
    await page.getByTestId('project-tree').waitFor({ state: 'visible' });
    // Wait on the folder the steps below assert against, so a missing seed
    // fails here instead of silently skipping every folder assertion.
    await page.getByTestId('element-Chronicles').waitFor({ state: 'visible' });

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
        await expect(page.getByTestId('context-menu')).toBeVisible();
        // Dismiss the menu before the next step so it doesn't intercept clicks.
        await page.keyboard.press('Escape');
        await expect(page.getByTestId('context-menu')).not.toBeVisible();
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
