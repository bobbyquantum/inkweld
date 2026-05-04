/**
 * Quick Open Feature Tests - Local Mode
 *
 * Tests that verify the quick file open functionality (Cmd/Ctrl + P)
 * works correctly for fast navigation within projects.
 *
 * Consolidated from 9 individual tests into 3 grouped tests using
 * `test.step()`. The first group exercises dialog lifecycle on an
 * empty project; the second seeds a few documents and exercises
 * search/filter; the third reuses the seeded documents to exercise
 * result navigation and selection.
 */
import { type Page } from '@playwright/test';

import { pressShortcut } from '../common';
import { expect, test } from './fixtures';

/**
 * Open the project (idempotent — checks if we're already inside a project).
 */
async function openProject(page: Page): Promise<void> {
  if (await page.getByTestId('project-card').first().isVisible()) {
    await page.getByTestId('project-card').first().click();
  }
  await expect(page.getByTestId('project-tree')).toBeVisible();
}

/**
 * Create a document with the given name via the New Element flow.
 */
async function createDocument(page: Page, name: string): Promise<void> {
  await page.getByTestId('create-new-element').click();
  await page.getByRole('heading', { name: 'Document', level: 4 }).click();

  const dialogInput = page.getByLabel('Document Name');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(name);
  await page.getByTestId('create-element-button').click();
  // Brief wait for tree update + IndexedDB persistence.
  await page.waitForTimeout(300);
}

test.describe('Quick Open', () => {
  test('dialog lifecycle: open shortcut, Escape, recent files, clear button', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);

    const dialog = page.getByTestId('quick-open-dialog');
    const search = page.getByTestId('quick-open-search');

    await test.step('Cmd/Ctrl+P opens dialog with focused search input', async () => {
      await pressShortcut(page, 'p');
      await expect(dialog).toBeVisible();
      await expect(search).toBeFocused();
    });

    await test.step('results container is visible (recent files area)', async () => {
      await expect(page.getByTestId('quick-open-results')).toBeVisible();
    });

    await test.step('clear button clears the search input', async () => {
      await search.fill('test query');
      const clearButton = page.locator('.clear-button');
      await expect(clearButton).toBeVisible();
      await clearButton.click();
      await expect(search).toHaveValue('');
    });

    await test.step('Escape closes the dialog', async () => {
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    });
  });

  test('search filters results and shows empty state when no match', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);

    // Seed a document we can search for.
    await createDocument(page, 'Searchable Document');

    const dialog = page.getByTestId('quick-open-dialog');
    const search = page.getByTestId('quick-open-search');
    const results = page.getByTestId('quick-open-results');

    await test.step('filters results to matching documents as user types', async () => {
      await pressShortcut(page, 'p');
      await expect(dialog).toBeVisible();

      await search.fill('Search');
      await expect(results).toContainText('Searchable');
    });

    await test.step('shows "No files match" empty state for non-matching query', async () => {
      await search.fill('xyznonexistent123');
      await expect(results).toContainText('No files match');
    });
  });

  test('navigation and selection: arrow keys, Enter, click', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);

    // Seed two documents we can navigate between.
    await createDocument(page, 'Alpha Doc');
    await createDocument(page, 'Beta Doc');

    const dialog = page.getByTestId('quick-open-dialog');
    const search = page.getByTestId('quick-open-search');

    await test.step('ArrowDown / ArrowUp move selection between results', async () => {
      await pressShortcut(page, 'p');
      await expect(dialog).toBeVisible();

      await search.fill('Doc');
      await page.waitForTimeout(200);

      const firstResult = page.getByTestId('quick-open-result-0');
      const secondResult = page.getByTestId('quick-open-result-1');
      await expect(firstResult).toHaveClass(/selected/);

      await page.keyboard.press('ArrowDown');
      await expect(secondResult).toHaveClass(/selected/);

      await page.keyboard.press('ArrowUp');
      await expect(firstResult).toHaveClass(/selected/);
    });

    await test.step('Enter opens the currently selected result', async () => {
      // Currently positioned on result-0 ("Alpha Doc" or "Beta Doc" depending
      // on sort). Pressing Enter should close the dialog and navigate.
      await page.keyboard.press('Enter');
      await expect(dialog).not.toBeVisible();
    });

    await test.step('clicking a result opens it and closes the dialog', async () => {
      // Go back to home, then reopen quick-open and click a result.
      await page.getByTestId('toolbar-home-button').click();
      await page.waitForTimeout(200);

      await pressShortcut(page, 'p');
      await expect(dialog).toBeVisible();
      await search.fill('Doc');
      await page.waitForTimeout(200);

      await page.getByTestId('quick-open-result-0').click();
      await expect(dialog).not.toBeVisible();
    });
  });
});
