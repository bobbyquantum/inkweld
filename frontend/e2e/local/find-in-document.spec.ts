/**
 * Find and Replace Feature Tests - Local Mode
 *
 * Tests that verify the find and replace functionality (Cmd/Ctrl + F)
 * works correctly for searching and replacing text within documents.
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

  test('should toggle replace mode with toggle button', async ({
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
    await dialogInput.fill('Replace Toggle Test');
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

    // Replace bar should not be visible initially
    await expect(page.getByTestId('replace-bar')).not.toBeVisible();

    // Click toggle replace button
    await page.getByTestId('find-toggle-replace').click();

    // Replace bar should now be visible
    await expect(page.getByTestId('replace-bar')).toBeVisible();
    await expect(page.getByTestId('replace-input')).toBeVisible();

    // Click toggle again to hide
    await page.getByTestId('find-toggle-replace').click();
    await expect(page.getByTestId('replace-bar')).not.toBeVisible();
  });

  test('should replace single match', async ({
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
    await dialogInput.fill('Replace Single Test');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Type some text in the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('cat and cat and cat');
    await page.waitForTimeout(300);

    // Open find bar and search
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    const findInput = page.getByTestId('find-input');
    await findInput.fill('cat');
    await page.waitForTimeout(200);

    // Verify we have 3 matches
    const matchCounter = page.getByTestId('find-match-counter');
    await expect(matchCounter).toContainText('1 of 3');

    // Open replace mode
    await page.getByTestId('find-toggle-replace').click();
    await expect(page.getByTestId('replace-bar')).toBeVisible();

    // Enter replacement text
    const replaceInput = page.getByTestId('replace-input');
    await replaceInput.fill('dog');

    // Click replace button
    await page.getByTestId('replace-single').click();
    await page.waitForTimeout(200);

    // Should now have 2 matches (one replaced)
    await expect(matchCounter).toContainText('1 of 2');

    // Verify the text was replaced
    await expect(editor).toContainText('dog');
  });

  test('should replace all matches', async ({ localPageWithProject: page }) => {
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
    await dialogInput.fill('Replace All Test');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Type some text in the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('foo bar foo baz foo');
    await page.waitForTimeout(300);

    // Open find bar and search
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    const findInput = page.getByTestId('find-input');
    await findInput.fill('foo');
    await page.waitForTimeout(200);

    // Verify we have 3 matches
    const matchCounter = page.getByTestId('find-match-counter');
    await expect(matchCounter).toContainText('1 of 3');

    // Open replace mode
    await page.getByTestId('find-toggle-replace').click();

    // Enter replacement text
    const replaceInput = page.getByTestId('replace-input');
    await replaceInput.fill('qux');

    // Click replace all button
    await page.getByTestId('replace-all').click();
    await page.waitForTimeout(200);

    // Should have no matches (all replaced)
    await expect(matchCounter).toContainText('No results');

    // Verify all text was replaced
    await expect(editor).toContainText('qux bar qux baz qux');
    await expect(editor).not.toContainText('foo');
  });

  test('should replace with Enter key in replace input', async ({
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
    await dialogInput.fill('Replace Enter Key Test');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Type some text in the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('apple banana apple');
    await page.waitForTimeout(300);

    // Open find bar and search
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    const findInput = page.getByTestId('find-input');
    await findInput.fill('apple');
    await page.waitForTimeout(200);

    const matchCounter = page.getByTestId('find-match-counter');
    await expect(matchCounter).toContainText('1 of 2');

    // Open replace mode
    await page.getByTestId('find-toggle-replace').click();

    // Enter replacement text and press Enter
    const replaceInput = page.getByTestId('replace-input');
    await replaceInput.fill('orange');
    await replaceInput.press('Enter');
    await page.waitForTimeout(200);

    // Should now have 1 match (one replaced)
    await expect(matchCounter).toContainText('1 of 1');
  });

  test('should replace all with Shift+Enter in replace input', async ({
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
    await dialogInput.fill('Replace Shift Enter Test');
    await page.getByTestId('create-element-button').click();
    await expect(page.locator('ngx-editor')).toBeVisible();
    await page.waitForTimeout(500);

    // Type some text in the editor
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();
    await page.keyboard.type('red blue red green red');
    await page.waitForTimeout(300);

    // Open find bar and search
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+f' : 'Control+f');
    const findInput = page.getByTestId('find-input');
    await findInput.fill('red');
    await page.waitForTimeout(200);

    const matchCounter = page.getByTestId('find-match-counter');
    await expect(matchCounter).toContainText('1 of 3');

    // Open replace mode
    await page.getByTestId('find-toggle-replace').click();

    // Enter replacement text and press Shift+Enter to replace all
    const replaceInput = page.getByTestId('replace-input');
    await replaceInput.fill('yellow');
    await replaceInput.press('Shift+Enter');
    await page.waitForTimeout(200);

    // Should have no matches (all replaced)
    await expect(matchCounter).toContainText('No results');

    // Verify all text was replaced
    await expect(editor).toContainText('yellow blue yellow green yellow');
  });

  test('should close replace bar when closing find bar', async ({
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
    await dialogInput.fill('Close Replace Test');
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

    // Open replace mode
    await page.getByTestId('find-toggle-replace').click();
    await expect(page.getByTestId('replace-bar')).toBeVisible();

    // Focus the find input before pressing Escape (Escape handler is on input)
    await page.getByTestId('find-input').click();

    // Close find bar with Escape
    await page.keyboard.press('Escape');

    // Both find bar and replace bar should be closed
    await expect(page.getByTestId('find-bar')).not.toBeVisible();
  });
});
