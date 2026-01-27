/**
 * Find in Document Feature Tests - Local Mode
 *
 * Tests that verify the find in document functionality (Cmd/Ctrl + F)
 * works correctly for searching text within documents.
 */
import { expect, test } from './fixtures';

test.describe('Find in Document', () => {
  test('should open find bar with keyboard shortcut', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document first
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    // Select "Document" from the Choose Element Type dialog
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    // The dialog proceeds to document name entry
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Find Test Document');
    await page.getByTestId('create-element-button').click();

    // Wait for the document to be created and editor to appear
    await expect(page.locator('ngx-editor')).toBeVisible();

    // Wait for editor to be ready and click to focus it
    await page.waitForTimeout(500);
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();

    // Press Cmd/Ctrl + F to open find bar
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');

    // Find bar should appear
    await expect(page.getByTestId('find-bar')).toBeVisible();

    // Search input should be visible
    await expect(page.getByTestId('find-input')).toBeVisible();
  });

  test('should close find bar with Escape', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Find Close Test');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Focus the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();

    // Open find bar
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    await expect(page.getByTestId('find-bar')).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Find bar should be closed
    await expect(page.getByTestId('find-bar')).not.toBeVisible();
  });

  test('should find text in document', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Search Test Document');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Type some text in the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('Hello world, hello universe, hello everyone');

    // Wait for text to be entered
    await page.waitForTimeout(300);

    // Open find bar
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    await expect(page.getByTestId('find-bar')).toBeVisible();

    // Type search query
    const findInput = page.getByTestId('find-input');
    await findInput.fill('hello');

    // Wait for search to complete (debounced)
    await page.waitForTimeout(200);

    // Should show match count
    const matchCounter = page.getByTestId('find-match-counter');
    await expect(matchCounter).toContainText('1 of 3');
  });

  test('should navigate between matches with Enter and Shift+Enter', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Navigation Test Document');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Type some text in the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('test one, test two, test three');
    await page.waitForTimeout(300);

    // Open find bar and search
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    const findInput = page.getByTestId('find-input');
    await findInput.fill('test');
    await page.waitForTimeout(200);

    const matchCounter = page.getByTestId('find-match-counter');
    await expect(matchCounter).toContainText('1 of 3');

    // Press Enter to go to next match
    await page.keyboard.press('Enter');
    await expect(matchCounter).toContainText('2 of 3');

    // Press Enter again
    await page.keyboard.press('Enter');
    await expect(matchCounter).toContainText('3 of 3');

    // Press Shift+Enter to go back
    await page.keyboard.press('Shift+Enter');
    await expect(matchCounter).toContainText('2 of 3');
  });

  test('should show "No results" when no matches found', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('No Results Test');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Type some text in the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('Hello world');
    await page.waitForTimeout(300);

    // Open find bar and search for non-existent text
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    const findInput = page.getByTestId('find-input');
    await findInput.fill('xyz123');
    await page.waitForTimeout(200);

    // Should show "No results"
    const matchCounter = page.getByTestId('find-match-counter');
    await expect(matchCounter).toContainText('No results');
  });

  test('should close find bar with close button', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Close Button Test');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Focus the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();

    // Open find bar
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    await expect(page.getByTestId('find-bar')).toBeVisible();

    // Click close button
    await page.getByTestId('find-close').click();

    // Find bar should be closed
    await expect(page.getByTestId('find-bar')).not.toBeVisible();
  });

  test('should navigate with next/previous buttons', async ({
    localPageWithProject: page,
  }) => {
    // Open a project
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document
    const newDocButton = page.getByTestId('toolbar-new-document-button');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();
    await page.getByRole('heading', { name: 'Document', level: 4 }).click();
    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Button Navigation Test');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Type some text in the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('find me, find me again');
    await page.waitForTimeout(300);

    // Open find bar and search
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    const findInput = page.getByTestId('find-input');
    await findInput.fill('find');
    await page.waitForTimeout(200);

    const matchCounter = page.getByTestId('find-match-counter');
    await expect(matchCounter).toContainText('1 of 2');

    // Click next button
    await page.getByTestId('find-next').click();
    await expect(matchCounter).toContainText('2 of 2');

    // Click previous button
    await page.getByTestId('find-previous').click();
    await expect(matchCounter).toContainText('1 of 2');
  });
});
