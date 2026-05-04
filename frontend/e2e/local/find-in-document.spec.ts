/**
 * Find and Replace Feature Tests - Local Mode
 *
 * Tests that verify the find and replace functionality (Cmd/Ctrl + F)
 * works correctly for searching and replacing text within documents.
 *
 * Consolidated from 13 individual tests into 3 grouped tests using
 * `test.step()` to share the expensive project + document setup. Each
 * grouped test creates its own document(s) within a single shared
 * project so individual steps remain isolated and the find-bar state
 * doesn't leak between assertions.
 */
import { type Page } from '@playwright/test';

import { pressShortcut } from '../common';
import { expect, test } from './fixtures';

/**
 * Open the project, create a new document with the given name, and focus
 * the ngx-editor inside it. Returns the editor locator for convenience.
 *
 * Assumes we're on the project list page (or the previously-created
 * document still has the project tree visible — the create flow handles
 * both cases).
 */
async function openProjectAndCreateDocument(
  page: Page,
  documentName: string
): Promise<ReturnType<Page['locator']>> {
  // Project may already be open from a previous step; only click the card
  // if we're still on the project list.
  if (await page.getByTestId('project-card').first().isVisible()) {
    await page.getByTestId('project-card').first().click();
  }
  await expect(page.getByTestId('project-tree')).toBeVisible();

  await page.getByTestId('create-new-element').click();
  await page.getByRole('heading', { name: 'Document', level: 4 }).click();

  const dialogInput = page.getByLabel('Document Name');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(documentName);
  await page.getByTestId('create-element-button').click();

  await expect(page.locator('ngx-editor')).toBeVisible();
  // Brief wait for editor initialization (matches original tests).
  await page.waitForTimeout(500);

  const editor = page.locator('ngx-editor .ProseMirror');
  await editor.click();
  return editor;
}

test.describe('Find in Document', () => {
  test('find bar lifecycle: open, close with Escape, close with button', async ({
    localPageWithProject: page,
  }) => {
    const findBar = page.getByTestId('find-bar');
    const findInput = page.getByTestId('find-input');

    await test.step('open find bar with keyboard shortcut', async () => {
      await openProjectAndCreateDocument(page, 'Find Lifecycle Doc');
      await pressShortcut(page, 'f');
      await expect(findBar).toBeVisible();
      await expect(findInput).toBeVisible();
    });

    await test.step('close find bar with Escape', async () => {
      await expect(findInput).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(findBar).not.toBeVisible();
    });

    await test.step('close find bar with close button', async () => {
      // Re-focus the editor and reopen the find bar.
      await page.locator('ngx-editor .ProseMirror').click();
      await pressShortcut(page, 'f');
      await expect(findBar).toBeVisible();

      await page.getByTestId('find-close').click();
      await expect(findBar).not.toBeVisible();
    });
  });

  test('find: text matches, no-results, navigation with keyboard and buttons', async ({
    localPageWithProject: page,
  }) => {
    await openProjectAndCreateDocument(page, 'Find Search Doc');
    const matchCounter = page.getByTestId('find-match-counter');
    const findInput = page.getByTestId('find-input');

    // Single shared document content powers all search assertions.
    // - "hello" → 3 matches (case-insensitive)
    // - "find" → 2 matches
    // - "xyz123" → no results
    await page.keyboard.type(
      'Hello world, hello universe, hello everyone. find me, find me again'
    );
    await page.waitForTimeout(300);

    await test.step('find text and show match count', async () => {
      await pressShortcut(page, 'f');
      await expect(page.getByTestId('find-bar')).toBeVisible();
      await findInput.fill('hello');
      // Debounced search.
      await page.waitForTimeout(200);
      await expect(matchCounter).toContainText('1 of 3');
    });

    await test.step('navigate matches with Enter and Shift+Enter', async () => {
      await page.keyboard.press('Enter');
      await expect(matchCounter).toContainText('2 of 3');
      await page.keyboard.press('Enter');
      await expect(matchCounter).toContainText('3 of 3');
      await page.keyboard.press('Shift+Enter');
      await expect(matchCounter).toContainText('2 of 3');
    });

    await test.step('navigate matches with next/previous buttons', async () => {
      // Switch the search query so we have a fresh 1 of N starting state.
      await findInput.fill('find');
      await page.waitForTimeout(200);
      await expect(matchCounter).toContainText('1 of 2');

      await page.getByTestId('find-next').click();
      await expect(matchCounter).toContainText('2 of 2');

      await page.getByTestId('find-previous').click();
      await expect(matchCounter).toContainText('1 of 2');
    });

    await test.step('show "No results" when query has no matches', async () => {
      await findInput.fill('xyz123');
      await page.waitForTimeout(200);
      await expect(matchCounter).toContainText('No results');
    });
  });

  test('replace: toggle, single, all, Enter, Shift+Enter, and close', async ({
    localPageWithProject: page,
  }) => {
    const editor = await openProjectAndCreateDocument(page, 'Replace Doc');
    const findInput = page.getByTestId('find-input');
    const replaceBar = page.getByTestId('replace-bar');
    const matchCounter = page.getByTestId('find-match-counter');

    await test.step('toggle replace mode shows and hides replace bar', async () => {
      await pressShortcut(page, 'f');
      await expect(page.getByTestId('find-bar')).toBeVisible();
      await expect(replaceBar).not.toBeVisible();

      await page.getByTestId('find-toggle-replace').click();
      await expect(replaceBar).toBeVisible();
      await expect(page.getByTestId('replace-input')).toBeVisible();

      // Toggle off then back on; subsequent steps assume replace bar open.
      await page.getByTestId('find-toggle-replace').click();
      await expect(replaceBar).not.toBeVisible();
      await page.getByTestId('find-toggle-replace').click();
      await expect(replaceBar).toBeVisible();
    });

    await test.step('replace single match with replace-single button', async () => {
      // Type fresh content for this step.
      await editor.click();
      await page.keyboard.type('cat and cat and cat');
      await page.waitForTimeout(300);

      await findInput.click();
      await findInput.fill('cat');
      await page.waitForTimeout(200);
      await expect(matchCounter).toContainText('1 of 3');

      const replaceInput = page.getByTestId('replace-input');
      await replaceInput.fill('dog');
      await page.getByTestId('replace-single').click();
      await page.waitForTimeout(200);

      await expect(matchCounter).toContainText('1 of 2');
      await expect(editor).toContainText('dog');
    });

    await test.step('replace all matches with replace-all button', async () => {
      // Add a fresh, distinct line of content for this step.
      await editor.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('foo bar foo baz foo');
      await page.waitForTimeout(300);

      await findInput.click();
      await findInput.fill('foo');
      await page.waitForTimeout(200);
      await expect(matchCounter).toContainText('1 of 3');

      const replaceInput = page.getByTestId('replace-input');
      await replaceInput.click();
      await replaceInput.fill('qux');
      await page.getByTestId('replace-all').click();
      await page.waitForTimeout(200);

      await expect(matchCounter).toContainText('No results');
      await expect(editor).toContainText('qux bar qux baz qux');
      await expect(editor).not.toContainText('foo');
    });

    await test.step('replace single match with Enter key in replace input', async () => {
      await editor.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('apple banana apple');
      await page.waitForTimeout(300);

      await findInput.click();
      await findInput.fill('apple');
      await page.waitForTimeout(200);
      await expect(matchCounter).toContainText('1 of 2');

      const replaceInput = page.getByTestId('replace-input');
      await replaceInput.click();
      await replaceInput.fill('orange');
      await replaceInput.press('Enter');
      await page.waitForTimeout(200);

      await expect(matchCounter).toContainText('1 of 1');
    });

    await test.step('replace all with Shift+Enter in replace input', async () => {
      await editor.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('red blue red green red');
      await page.waitForTimeout(300);

      await findInput.click();
      await findInput.fill('red');
      await page.waitForTimeout(200);
      await expect(matchCounter).toContainText('1 of 3');

      const replaceInput = page.getByTestId('replace-input');
      await replaceInput.click();
      await replaceInput.fill('yellow');
      await replaceInput.press('Shift+Enter');
      await page.waitForTimeout(200);

      await expect(matchCounter).toContainText('No results');
      await expect(editor).toContainText('yellow blue yellow green yellow');
    });

    await test.step('Escape from find input closes both bars', async () => {
      // Replace bar is currently open. Focus find input and Escape.
      await findInput.click();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('find-bar')).not.toBeVisible();
      await expect(replaceBar).not.toBeVisible();
    });
  });
});
