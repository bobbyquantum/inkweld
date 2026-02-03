/**
 * Breadcrumbs Feature Tests - Local Mode
 *
 * Tests that verify the breadcrumbs navigation functionality
 * works correctly for showing document hierarchy paths.
 */
import { expect, test } from './fixtures';

test.describe('Breadcrumbs Navigation', () => {
  test('should not show breadcrumbs for root-level document', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document at root level
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    // Select "Document" from the Choose Element Type dialog
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    // Fill in document name
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Root Document');
    await page.getByTestId('create-element-button').click();

    // Wait for the document to be created and editor to appear
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Breadcrumbs should NOT be visible for root-level document (no parent)
    await expect(page.getByTestId('breadcrumbs')).not.toBeVisible();
  });

  test('should show breadcrumbs for nested document', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a folder first
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    // Select "Folder" from the Choose Element Type dialog
    await page.getByRole('heading', { name: 'Folder', level: 4 }).click();

    // Fill in folder name
    const folderInput = page.getByLabel('Folder Name');
    await folderInput.waitFor({ state: 'visible' });
    await folderInput.fill('Chapter 1');
    await page.getByTestId('create-element-button').click();

    // Wait for folder to be created
    await page.waitForTimeout(500);

    // Now create a document inside the folder
    // Right-click on the folder to get context menu
    const folderNode = page.locator('[data-testid="tree-node"]').filter({ hasText: 'Chapter 1' });
    await folderNode.click({ button: 'right' });

    // Click "New Document" from context menu
    await page.getByRole('menuitem', { name: /new document/i }).click();

    // Select "Document" from the Choose Element Type dialog
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    // Fill in document name
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Scene 1');
    await page.getByTestId('create-element-button').click();

    // Wait for the document to be created and editor to appear
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Breadcrumbs should be visible
    await expect(page.getByTestId('breadcrumbs')).toBeVisible();

    // Should show the folder name in breadcrumbs
    await expect(page.getByTestId('breadcrumbs')).toContainText('Chapter 1');

    // Should show the current document name
    await expect(page.getByTestId('breadcrumb-current')).toContainText('Scene 1');
  });

  test('should navigate to parent folder when clicking breadcrumb', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a folder first
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    // Select "Folder" from the Choose Element Type dialog
    await page.getByRole('heading', { name: 'Folder', level: 4 }).click();

    // Fill in folder name
    const folderInput = page.getByLabel('Folder Name');
    await folderInput.waitFor({ state: 'visible' });
    await folderInput.fill('Test Folder');
    await page.getByTestId('create-element-button').click();

    // Wait for folder to be created
    await page.waitForTimeout(500);

    // Create a document inside the folder
    const folderNode = page.locator('[data-testid="tree-node"]').filter({ hasText: 'Test Folder' });
    await folderNode.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /new document/i }).click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Test Document');
    await page.getByTestId('create-element-button').click();

    // Wait for the document to be created and editor to appear
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Breadcrumbs should be visible
    await expect(page.getByTestId('breadcrumbs')).toBeVisible();

    // Click on the folder breadcrumb link
    const breadcrumbLink = page.locator('.breadcrumb-link').filter({ hasText: 'Test Folder' });
    await breadcrumbLink.click();

    // Should navigate to the folder (folder editor should appear)
    // The folder tab should now be active
    await page.waitForTimeout(500);

    // The current breadcrumb should no longer show "Test Document"
    // Instead, we should either not see breadcrumbs (folder at root) or see different content
    // Since the folder is at root, breadcrumbs should not be visible
    await expect(page.getByTestId('breadcrumbs')).not.toBeVisible();
  });

  test('should update breadcrumbs when switching documents', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create two folders
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();
    await page.getByRole('heading', { name: 'Folder', level: 4 }).click();
    const folderInput1 = page.getByLabel('Folder Name');
    await folderInput1.waitFor({ state: 'visible' });
    await folderInput1.fill('Folder A');
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(500);

    await newDocButton.click();
    await page.getByRole('heading', { name: 'Folder', level: 4 }).click();
    const folderInput2 = page.getByLabel('Folder Name');
    await folderInput2.waitFor({ state: 'visible' });
    await folderInput2.fill('Folder B');
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(500);

    // Create a document in Folder A
    const folderANode = page.locator('[data-testid="tree-node"]').filter({ hasText: 'Folder A' });
    await folderANode.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /new document/i }).click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    let dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Doc in A');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Verify breadcrumbs show Folder A
    await expect(page.getByTestId('breadcrumbs')).toContainText('Folder A');
    await expect(page.getByTestId('breadcrumb-current')).toContainText('Doc in A');

    // Create a document in Folder B
    const folderBNode = page.locator('[data-testid="tree-node"]').filter({ hasText: 'Folder B' });
    await folderBNode.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /new document/i }).click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Doc in B');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Verify breadcrumbs now show Folder B
    await expect(page.getByTestId('breadcrumbs')).toContainText('Folder B');
    await expect(page.getByTestId('breadcrumb-current')).toContainText('Doc in B');

    // Click on Doc in A in the tree to switch
    const docANode = page.locator('[data-testid="tree-node"]').filter({ hasText: 'Doc in A' });
    await docANode.click();
    await page.waitForTimeout(500);

    // Verify breadcrumbs updated back to Folder A
    await expect(page.getByTestId('breadcrumbs')).toContainText('Folder A');
    await expect(page.getByTestId('breadcrumb-current')).toContainText('Doc in A');
  });

  test('should show multiple levels in breadcrumbs for deeply nested documents', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a nested folder structure: Part 1 > Chapter 1 > Scene 1
    const newDocButton = page.getByTestId('toolbar-new-document-button');

    // Create Part 1 folder
    await newDocButton.click();
    await page.getByRole('heading', { name: 'Folder', level: 4 }).click();
    let folderInput = page.getByLabel('Folder Name');
    await folderInput.waitFor({ state: 'visible' });
    await folderInput.fill('Part 1');
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(500);

    // Create Chapter 1 folder inside Part 1
    const part1Node = page.locator('[data-testid="tree-node"]').filter({ hasText: 'Part 1' });
    await part1Node.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /new folder/i }).click();
    folderInput = page.getByLabel('Folder Name');
    await folderInput.waitFor({ state: 'visible' });
    await folderInput.fill('Chapter 1');
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(500);

    // Create Scene 1 document inside Chapter 1
    const chapter1Node = page.locator('[data-testid="tree-node"]').filter({ hasText: 'Chapter 1' });
    await chapter1Node.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /new document/i }).click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Scene 1');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Verify breadcrumbs show the full path
    await expect(page.getByTestId('breadcrumbs')).toBeVisible();
    await expect(page.getByTestId('breadcrumbs')).toContainText('Part 1');
    await expect(page.getByTestId('breadcrumbs')).toContainText('Chapter 1');
    await expect(page.getByTestId('breadcrumb-current')).toContainText('Scene 1');
  });
});
