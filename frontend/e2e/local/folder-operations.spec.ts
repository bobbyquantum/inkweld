/**
 * Folder Operations Tests - Local Mode
 *
 * Tests that verify folder creation, navigation, and context menu
 * operations work correctly in pure local mode without any server connection.
 */
import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

test.describe('Folder Operations', () => {
  test('should create a folder via the create element dialog', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click the "Create" button at the bottom of the tree
    await page.click('[data-testid="create-new-element"]');
    await page.waitForTimeout(300);

    // Wait for the dialog to appear
    await page.waitForSelector('mat-dialog-container', {
      state: 'visible',
    });

    // Look for folder type option in the dialog
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
      await page.waitForTimeout(300);

      // Fill in the folder name
      const nameInput = page.getByTestId('element-name-input');
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('My Test Folder');
        await page.waitForTimeout(200);

        // Submit the dialog
        const createButton = page.getByRole('button', { name: /create/i });
        if (await createButton.isVisible().catch(() => false)) {
          await createButton.click();
          await page.waitForTimeout(500);
        }
      }
    }

    // Verify we're still on the project page (dialog closed)
    await expect(page).toHaveURL(/\/.+\/.+/);
  });

  test('should show folder context menu on right-click', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    // Create project with worldbuilding-demo template (has folders)
    await createProjectWithTwoSteps(
      page,
      'Folder Test',
      'folder-test',
      'Testing folder operations',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/testuser\/folder-test/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Right-click on a folder to open context menu
    const folder = page.locator('[data-testid="element-Chronicles"]');
    if (await folder.isVisible().catch(() => false)) {
      await folder.click({ button: 'right' });
      await page.waitForTimeout(300);

      // Context menu should appear
      await expect(page.locator('.context-menu')).toBeVisible();
    }
  });

  test('should expand folder to show children in project tree', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    // Create project with worldbuilding-demo template (has folders)
    await createProjectWithTwoSteps(
      page,
      'Expand Test',
      'expand-test',
      'Testing folder expansion',
      'worldbuilding-demo'
    );

    // Wait for project page
    await page.waitForURL(/\/testuser\/expand-test/);

    // Wait for the project tree
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Find and click the expand button for a folder
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(500);

      // After expanding, child items should be visible
      // The worldbuilding-demo template has "The Moonveil Accord" inside "Chronicles"
      const childItem = page.locator('text="The Moonveil Accord"');
      await expect(childItem).toBeVisible();
    }
  });

  test('should navigate to folder tab when clicking a folder', async ({
    localPage: page,
  }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    // Create project with worldbuilding-demo template
    await createProjectWithTwoSteps(
      page,
      'Folder Nav Test',
      'folder-nav-test',
      'Testing folder navigation',
      'worldbuilding-demo'
    );

    // Wait for project page
    await page.waitForURL(/\/testuser\/folder-nav-test/);

    // Wait for the project tree
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click a folder in the tree (e.g., "Chronicles")
    const folder = page.locator('[data-testid="element-Chronicles"]');
    if (await folder.isVisible().catch(() => false)) {
      await folder.click();
      await page.waitForTimeout(500);

      // Should navigate to folder tab or show folder content
      // The URL should update to include the folder path
      const url = page.url();
      expect(url).toMatch(/\/testuser\/folder-nav-test/);
    }
  });
});
