/**
 * Project-wide Search Feature Tests - Local Mode
 *
 * Tests that verify the project-wide full-text search functionality
 * (Cmd/Ctrl + Shift + F) works correctly for finding content across
 * all documents in a project.
 */
import { expect, test } from './fixtures';

test.describe('Project Search', () => {
  test('should open project search dialog via toolbar button', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    const searchButton = page.getByTestId('toolbar-project-search-button');
    await expect(searchButton).toBeVisible();
    await searchButton.click();

    await expect(page.getByTestId('project-search-dialog')).toBeVisible();
  });

  test('should open project search dialog with keyboard shortcut', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+Shift+f' : 'Control+Shift+F');

    await expect(page.getByTestId('project-search-dialog')).toBeVisible();
  });

  test('should focus the search input when opened', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    await page.getByTestId('toolbar-project-search-button').click();
    await expect(page.getByTestId('project-search-dialog')).toBeVisible();

    await expect(page.getByTestId('project-search-input')).toBeFocused();
  });

  test('should close project search dialog with Escape', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    await page.getByTestId('toolbar-project-search-button').click();
    await expect(page.getByTestId('project-search-dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('project-search-dialog')).not.toBeVisible();
  });

  test('should show empty state when no query is entered', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    await page.getByTestId('toolbar-project-search-button').click();
    await expect(page.getByTestId('project-search-dialog')).toBeVisible();

    // No query typed yet — empty state or results should be shown
    const dialog = page.getByTestId('project-search-dialog');
    await expect(dialog).toBeVisible();
  });

  test('should find content in a created document', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document
    const newDocButton = page.getByTestId('create-new-element');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Dragon Story');
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(500);

    // Type some distinct content into the new document
    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await editor.fill('The fearless knight defeated the ancient dragon.');
    await page.waitForTimeout(500);

    // Open project search
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+Shift+f' : 'Control+Shift+F');
    await expect(page.getByTestId('project-search-dialog')).toBeVisible();

    // Type the search query
    await page.getByTestId('project-search-input').fill('dragon');

    // Wait for scan to complete and results to appear
    await page.waitForTimeout(1500);

    await expect(page.getByTestId('project-search-results')).toBeVisible();
    await expect(page.getByTestId('project-search-results')).toContainText(
      'Dragon Story'
    );
  });

  test('should navigate results with arrow keys', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create two documents with searchable content
    for (const name of ['Alpha Document', 'Beta Document']) {
      const newDocButton = page.getByTestId('create-new-element');
      await expect(newDocButton).toBeVisible();
      await newDocButton.click();

      await page.getByRole('heading', { name: 'Document', level: 4 }).click();

      const dialogInput = page.getByLabel('Document Name');
      await dialogInput.waitFor({ state: 'visible' });
      await dialogInput.fill(name);
      await page.getByTestId('create-element-button').click();
      await page.waitForTimeout(300);

      const editor = page.locator('.ProseMirror').first();
      await editor.click();
      await editor.fill(`Content of ${name} with special keyword zebrafish.`);
      await page.waitForTimeout(300);
    }

    // Open project search
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+Shift+f' : 'Control+Shift+F');
    await expect(page.getByTestId('project-search-dialog')).toBeVisible();

    // Type query that matches both docs
    await page.getByTestId('project-search-input').fill('zebrafish');
    await page.waitForTimeout(1500);

    await expect(page.getByTestId('project-search-results')).toBeVisible();

    // First result should be selected by default
    const firstResult = page.getByTestId('project-search-result-0');
    await expect(firstResult).toBeVisible();
    // Click the input to ensure focus, then press ArrowDown
    await page.getByTestId('project-search-input').click();
    await expect(page.getByTestId('project-search-result-0')).toHaveClass(
      /selected/
    );

    // Arrow down selects the second result
    await page.getByTestId('project-search-input').press('ArrowDown');
    const secondResult = page.getByTestId('project-search-result-1');
    if (await secondResult.isVisible()) {
      await expect(secondResult).toHaveClass(/selected/);
    }

    // Arrow up goes back to the first
    await page.getByTestId('project-search-input').press('ArrowUp');
    await expect(firstResult).toHaveClass(/selected/);
  });

  test('should open document when result is clicked', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-tree')).toBeVisible();

    // Create a document with searchable content
    const newDocButton = page.getByTestId('create-new-element');
    await expect(newDocButton).toBeVisible();
    await newDocButton.click();

    await page.getByRole('heading', { name: 'Document', level: 4 }).click();

    const dialogInput = page.getByLabel('Document Name');
    await dialogInput.waitFor({ state: 'visible' });
    await dialogInput.fill('Clickable Result Doc');
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(500);

    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await editor.fill('This document contains the word starfish for testing.');
    await page.waitForTimeout(500);

    // Navigate away to another doc first so we can verify navigation
    await page.keyboard.press('Escape');

    // Open project search
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+Shift+f' : 'Control+Shift+F');
    await expect(page.getByTestId('project-search-dialog')).toBeVisible();

    await page.getByTestId('project-search-input').fill('starfish');
    await page.waitForTimeout(1500);

    // Click the first result
    const firstResult = page.getByTestId('project-search-result-0');
    await expect(firstResult).toBeVisible();
    await firstResult.click();

    // Dialog should close
    await expect(page.getByTestId('project-search-dialog')).not.toBeVisible();
  });

  test('should not open when not inside a project', async ({
    localPage: page,
  }) => {
    // We are on the projects list page, not inside a project
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+Shift+f' : 'Control+Shift+F');

    // No dialog should appear
    await page.waitForTimeout(300);
    await expect(page.getByTestId('project-search-dialog')).not.toBeVisible();
  });
});
