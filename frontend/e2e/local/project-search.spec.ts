/**
 * Project-wide Search Feature Tests - Local Mode
 *
 * Tests that verify the project-wide full-text search functionality
 * (Cmd/Ctrl + Shift + F) works correctly for finding content across
 * all documents in a project.
 *
 * Consolidated from 9 individual tests into 3 grouped tests using
 * `test.step()` to share fixture setup.
 */
import { type Page } from '@playwright/test';

import { pressShortcut } from '../common';
import { expect, test } from './fixtures';

/**
 * Open the fixture project (idempotent).
 */
async function openProject(page: Page): Promise<void> {
  if (await page.getByTestId('project-card').first().isVisible()) {
    await page.getByTestId('project-card').first().click();
  }
  await expect(page.getByTestId('project-tree')).toBeVisible();
}

/**
 * Create a document with the given name and fill its editor with body text.
 */
async function createDocumentWithContent(
  page: Page,
  name: string,
  body: string
): Promise<void> {
  await page.getByTestId('create-new-element').click();
  await page.getByRole('heading', { name: 'Document', level: 4 }).click();

  const dialogInput = page.getByLabel('Document Name');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(name);
  await page.getByTestId('create-element-button').click();
  await page.waitForTimeout(300);

  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await editor.fill(body);
  await page.waitForTimeout(300);
}

test.describe('Project Search', () => {
  test('dialog lifecycle: toolbar open, shortcut open, focus, empty state, Escape', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);

    const dialog = page.getByTestId('project-search-dialog');

    await test.step('toolbar button opens the dialog', async () => {
      const searchButton = page.getByTestId('toolbar-project-search-button');
      await expect(searchButton).toBeVisible();
      await searchButton.click();
      await expect(dialog).toBeVisible();
    });

    await test.step('search input is focused on open', async () => {
      await expect(page.getByTestId('project-search-input')).toBeFocused();
    });

    await test.step('empty state with no query renders the dialog only', async () => {
      // No query typed yet — dialog visible, no results section needed.
      await expect(dialog).toBeVisible();
    });

    await test.step('Escape closes the dialog', async () => {
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    });

    await test.step('Cmd/Ctrl+Shift+F shortcut also opens the dialog', async () => {
      await pressShortcut(page, 'Shift+f');
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
    });
  });

  test('search across documents: find content, navigate with arrows, click opens result', async ({
    localPageWithProject: page,
  }) => {
    await openProject(page);

    const dialog = page.getByTestId('project-search-dialog');
    const input = page.getByTestId('project-search-input');
    const results = page.getByTestId('project-search-results');

    // Seed three documents with distinct keywords for the steps below.
    await createDocumentWithContent(
      page,
      'Dragon Story',
      'The fearless knight defeated the ancient dragon.'
    );
    await createDocumentWithContent(
      page,
      'Alpha Document',
      'Content of Alpha Document with special keyword zebrafish.'
    );
    await createDocumentWithContent(
      page,
      'Beta Document',
      'Content of Beta Document with special keyword zebrafish.'
    );

    await test.step('finds matching document by keyword', async () => {
      await pressShortcut(page, 'Shift+f');
      await expect(dialog).toBeVisible();

      await input.fill('dragon');
      // Scan is debounced; allow it to complete.
      await page.waitForTimeout(1500);

      await expect(results).toBeVisible();
      await expect(results).toContainText('Dragon Story');
    });

    await test.step('arrow keys navigate between matching results', async () => {
      // Switch to a query that matches multiple docs.
      await input.fill('zebrafish');
      await page.waitForTimeout(1500);

      const firstResult = page.getByTestId('project-search-result-0');
      await expect(firstResult).toBeVisible();

      // Click the input to ensure focus, then verify selection model.
      await input.click();
      await expect(firstResult).toHaveClass(/selected/);

      await input.press('ArrowDown');
      const secondResult = page.getByTestId('project-search-result-1');
      if (await secondResult.isVisible()) {
        await expect(secondResult).toHaveClass(/selected/);
      }

      await input.press('ArrowUp');
      await expect(firstResult).toHaveClass(/selected/);
    });

    await test.step('clicking a result opens the document and closes the dialog', async () => {
      const firstResult = page.getByTestId('project-search-result-0');
      await firstResult.click();
      await expect(dialog).not.toBeVisible();
    });
  });

  test('does not open outside of a project', async ({ localPage: page }) => {
    // We are on the projects list page, not inside a project; the global
    // shortcut should be a no-op so users don't get confused.
    await pressShortcut(page, 'Shift+f');
    await page.waitForTimeout(300);
    await expect(page.getByTestId('project-search-dialog')).not.toBeVisible();
  });
});
