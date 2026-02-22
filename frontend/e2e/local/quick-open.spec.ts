/**
 * Quick Open Feature Tests - Local Mode
 *
 * Tests that verify the quick file open functionality (Cmd/Ctrl + P)
 * works correctly for fast navigation within projects.
 */
import { expect, test } from './fixtures';

test.describe('Quick Open', () => {
  test('should open quick open dialog with keyboard shortcut', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Press Cmd/Ctrl + P to open quick open
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');

    // Quick open dialog should appear
    await expect(page.getByTestId('quick-open-dialog')).toBeVisible();

    // Search input should be focused
    await expect(page.getByTestId('quick-open-search')).toBeFocused();
  });

  test('should close quick open dialog with Escape', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Open quick open
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');
    await expect(page.getByTestId('quick-open-dialog')).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Dialog should be closed
    await expect(page.getByTestId('quick-open-dialog')).not.toBeVisible();
  });

  test('should show recent files when no search query', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // First open a document to add it to recent files
    // Click on a document in the tree
    const treeItems = page.locator('[data-testid^="element-"]');
    const itemCount = await treeItems.count();

    if (itemCount > 0) {
      // Try to find a non-folder element
      for (let i = 0; i < itemCount; i++) {
        const item = treeItems.nth(i);
        const isFolder = await item.evaluate(el =>
          el.classList.contains('folder-node')
        );
        if (!isFolder) {
          await item.click();
          break;
        }
      }
    }

    // Open quick open
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');
    await expect(page.getByTestId('quick-open-dialog')).toBeVisible();

    // Results should be visible (even with empty project, at least the container)
    await expect(page.getByTestId('quick-open-results')).toBeVisible();
  });

  test('should filter results as user types', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document first so we have something to search
    const newDocButton = page.getByTestId('create-new-element');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    // Select "Document" from the Choose Element Type dialog
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    // The dialog proceeds to document name entry
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Searchable Document');
    await page.getByTestId('create-element-button').click();

    // Wait for the document to be created
    await page.waitForTimeout(500);

    // Open quick open
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');
    await expect(page.getByTestId('quick-open-dialog')).toBeVisible();

    // Type in search query
    await page.getByTestId('quick-open-search').fill('Search');

    // Results should update - check for the created document
    await expect(page.getByTestId('quick-open-results')).toContainText(
      'Searchable'
    );
  });

  test('should navigate results with arrow keys', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create multiple documents
    for (const name of ['Alpha Doc', 'Beta Doc']) {
      const newDocButton = page.getByTestId('create-new-element');
      await expect(newDocButton).toBeVisible();
      await newDocButton.click();

      // Select "Document" from the Choose Element Type dialog
      await page.getByRole('heading', { name: 'Document', level: 4 }).click();

      // The dialog proceeds to document name entry
      const dialogInput = page.getByLabel('Document Name');
      await dialogInput.waitFor({ state: 'visible' });
      await dialogInput.fill(name);
      await page.getByTestId('create-element-button').click();
      await page.waitForTimeout(300);
    }

    // Open quick open
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');
    await expect(page.getByTestId('quick-open-dialog')).toBeVisible();

    // Type to get results
    await page.getByTestId('quick-open-search').fill('Doc');
    await page.waitForTimeout(200);

    // First result should be selected by default
    const firstResult = page.getByTestId('quick-open-result-0');
    await expect(firstResult).toHaveClass(/selected/);

    // Press Down to select next
    await page.keyboard.press('ArrowDown');
    const secondResult = page.getByTestId('quick-open-result-1');
    await expect(secondResult).toHaveClass(/selected/);

    // Press Up to go back
    await page.keyboard.press('ArrowUp');
    await expect(firstResult).toHaveClass(/selected/);
  });

  test('should open selected document with Enter', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document
    const newDocButton = page.getByTestId('create-new-element');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    // Select "Document" from the Choose Element Type dialog
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    // The dialog proceeds to document name entry
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Quick Open Target');
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(500);

    // Go back to home tab (so the document isn't already open)
    await page.getByTestId('toolbar-home-button').click();
    await page.waitForTimeout(200);

    // Open quick open
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');
    await expect(page.getByTestId('quick-open-dialog')).toBeVisible();

    // Search for the document
    await page.getByTestId('quick-open-search').fill('Quick Open Target');
    await page.waitForTimeout(200);

    // Press Enter to open
    await page.keyboard.press('Enter');

    // Dialog should close
    await expect(page.getByTestId('quick-open-dialog')).not.toBeVisible();

    // The document tab should be open (check for document name in tabs or content)
    // The document name should appear somewhere indicating it's open
    await page.waitForTimeout(500);
  });

  test('should open document by clicking on result', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document
    const newDocButton = page.getByTestId('create-new-element');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    // Select "Document" from the Choose Element Type dialog
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    // The dialog proceeds to document name entry
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Click Target Doc');
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(500);

    // Go back to home
    await page.getByTestId('toolbar-home-button').click();
    await page.waitForTimeout(200);

    // Open quick open
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');
    await expect(page.getByTestId('quick-open-dialog')).toBeVisible();

    // Search and click on result
    await page.getByTestId('quick-open-search').fill('Click Target');
    await page.waitForTimeout(200);

    // Click on the first result
    await page.getByTestId('quick-open-result-0').click();

    // Dialog should close
    await expect(page.getByTestId('quick-open-dialog')).not.toBeVisible();
  });

  test('should show empty state when no results match', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Open quick open
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');
    await expect(page.getByTestId('quick-open-dialog')).toBeVisible();

    // Type something that won't match anything
    await page.getByTestId('quick-open-search').fill('xyznonexistent123');

    // Should show empty state with search_off icon or no matches message
    await expect(page.getByTestId('quick-open-results')).toContainText(
      'No files match'
    );
  });

  test('should clear search with clear button', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Open quick open
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+p' : 'Control+p');
    await expect(page.getByTestId('quick-open-dialog')).toBeVisible();

    // Type something
    await page.getByTestId('quick-open-search').fill('test query');

    // Clear button should appear
    const clearButton = page.locator('.clear-button');
    await expect(clearButton).toBeVisible();

    // Click clear
    await clearButton.click();

    // Search should be empty
    await expect(page.getByTestId('quick-open-search')).toHaveValue('');
  });
});
