/**
 * Editor Table Tests - Local Mode
 *
 * Covers the table support added on top of `prosemirror-tables`: inserting a
 * table from the toolbar, editing cells, the row/column commands, and — the
 * part most likely to regress silently — that a table survives a reload,
 * which exercises the ProseMirror → canonical XML → Yjs → IndexedDB path.
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Open a project, create a fresh document, and leave the editor focused.
 */
async function createDocumentAndFocus(
  page: Page,
  docName: string
): Promise<void> {
  await page.getByTestId('project-card').first().click();
  await expect(page.getByTestId('project-tree')).toBeVisible();

  const newDocButton = page.getByTestId('create-new-element');
  await expect(newDocButton).toBeVisible();
  await newDocButton.click();

  await page.getByRole('heading', { name: 'Document', level: 4 }).click();

  const dialogInput = page.getByLabel('Document Name');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(docName);
  await page.getByTestId('create-element-button').click();

  await expect(page.locator('ngx-editor')).toBeVisible();
  await page.locator('ngx-editor .ProseMirror').click();
}

/** Open the toolbar's table menu. */
async function openTableMenu(page: Page): Promise<void> {
  await page.getByTestId('toolbar-table').click();
  await expect(page.getByTestId('table-insert')).toBeVisible();
}

/** Insert a default 3x3 table via the toolbar. */
async function insertTable(page: Page): Promise<void> {
  await openTableMenu(page);
  await page.getByTestId('table-insert').click();
  await expect(page.locator('ngx-editor .ProseMirror table')).toBeVisible();
}

test.describe('Editor Tables', () => {
  test('insert: toolbar menu creates a 3x3 table with a header row', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Table Insert Test');

    const editor = page.locator('ngx-editor .ProseMirror');

    await test.step('table button is visible in the editor toolbar', async () => {
      await expect(page.getByTestId('toolbar-table')).toBeVisible();
    });

    await test.step('row and column commands are disabled outside a table', async () => {
      await openTableMenu(page);
      await expect(page.getByTestId('table-add-row-after')).toBeDisabled();
      await expect(page.getByTestId('table-delete')).toBeDisabled();
      await page.keyboard.press('Escape');
    });

    await test.step('insert places a 3x3 table', async () => {
      await insertTable(page);
      await expect(editor.locator('table tr')).toHaveCount(3);
      // First row is a header row, the other two are body rows.
      await expect(editor.locator('table th')).toHaveCount(3);
      await expect(editor.locator('table td')).toHaveCount(6);
    });

    await test.step('a paragraph follows the table so writing can continue', async () => {
      // Without this a table inserted at the end of a document is a dead
      // end — there is no inline position after it to place the cursor.
      const lastChild = editor.locator('> *').last();
      await expect(lastChild).not.toHaveJSProperty('tagName', 'TABLE');
      await lastChild.click();
      await page.keyboard.type('After the table');
      await expect(editor).toContainText('After the table');
    });

    await test.step('commands become enabled once the cursor is in a cell', async () => {
      await editor.locator('table th').first().click();
      await openTableMenu(page);
      await expect(page.getByTestId('table-add-row-after')).toBeEnabled();
      await expect(page.getByTestId('table-delete')).toBeEnabled();
      await page.keyboard.press('Escape');
    });
  });

  test('edit: typing, Tab navigation, and row/column commands', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Table Edit Test');

    const editor = page.locator('ngx-editor .ProseMirror');
    await insertTable(page);

    await test.step('typing into a cell keeps the text in that cell', async () => {
      await editor.locator('table th').first().click();
      await page.keyboard.type('Name');
      await expect(editor.locator('table th').first()).toHaveText('Name');
    });

    await test.step('Tab moves to the next cell', async () => {
      await page.keyboard.press('Tab');
      await page.keyboard.type('Age');
      await expect(editor.locator('table th').nth(1)).toHaveText('Age');
    });

    await test.step('adding a row grows the table', async () => {
      await editor.locator('table td').first().click();
      await openTableMenu(page);
      await page.getByTestId('table-add-row-after').click();
      await expect(editor.locator('table tr')).toHaveCount(4);
    });

    await test.step('adding a column grows every row', async () => {
      await editor.locator('table td').first().click();
      await openTableMenu(page);
      await page.getByTestId('table-add-column-after').click();
      await expect(editor.locator('table th')).toHaveCount(4);
      await expect(
        editor.locator('table tr').first().locator('th')
      ).toHaveCount(4);
    });

    await test.step('deleting a row shrinks the table', async () => {
      await editor.locator('table td').first().click();
      await openTableMenu(page);
      await page.getByTestId('table-delete-row').click();
      await expect(editor.locator('table tr')).toHaveCount(3);
    });

    await test.step('delete table removes it entirely', async () => {
      await editor.locator('table th').first().click();
      await openTableMenu(page);
      await page.getByTestId('table-delete').click();
      await expect(editor.locator('table')).toHaveCount(0);
    });
  });

  test('persistence: a table with content survives a reload', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Table Persist Test');

    const editor = page.locator('ngx-editor .ProseMirror');
    await insertTable(page);

    await test.step('fill the header and a body cell', async () => {
      await editor.locator('table th').first().click();
      await page.keyboard.type('Character');
      await editor.locator('table td').first().click();
      await page.keyboard.type('Alice');

      await expect(editor.locator('table th').first()).toHaveText('Character');
      await expect(editor.locator('table td').first()).toHaveText('Alice');
    });

    await test.step('table and cell content are still there after reload', async () => {
      await page.reload();
      await expect(page.locator('ngx-editor')).toBeVisible();

      const reloaded = page.locator('ngx-editor .ProseMirror');
      await expect(reloaded.locator('table')).toBeVisible();

      // Shape is preserved: 3 rows, header row intact.
      await expect(reloaded.locator('table tr')).toHaveCount(3);
      await expect(reloaded.locator('table th')).toHaveCount(3);
      await expect(reloaded.locator('table td')).toHaveCount(6);

      // ...and so is the text, including the empty cells around it.
      await expect(reloaded.locator('table th').first()).toHaveText(
        'Character'
      );
      await expect(reloaded.locator('table td').first()).toHaveText('Alice');
    });
  });
});
