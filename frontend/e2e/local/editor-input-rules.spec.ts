/**
 * Editor Markdown Input Rules - Local Mode
 *
 * Typing "# ", "## ", "> ", "- " or "1. " at the start of a paragraph turns it
 * into a heading / blockquote / list, and Backspace straight afterwards (or
 * Ctrl/Cmd+Z) reverts the conversion. The result must survive a reload, which
 * exercises ProseMirror → Yjs → IndexedDB.
 */
import { type Page } from '@playwright/test';

import { openProjectFromGrid } from '../common/test-helpers';
import { expect, openUserSettings, test } from './fixtures';

/**
 * Markdown shortcuts are opt-in (Settings → General) and are read when an
 * editor is created, so the preference is switched on before the document.
 */
async function createDocumentAndFocus(
  page: Page,
  docName: string,
  { shortcuts = true }: { shortcuts?: boolean } = {}
): Promise<void> {
  await openProjectFromGrid(page);
  await expect(page.getByTestId('project-tree')).toBeVisible();
  if (shortcuts) {
    await openUserSettings(page);
    await page.getByRole('tab', { name: /general settings/i }).click();
    const toggle = page
      .getByTestId('markdown-shortcuts-toggle')
      .getByRole('switch');
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.getByTestId('settings-close-button').click();
  }
  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-item').click();
  const dialogInput = page.getByTestId('element-name-input');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(docName);
  await page.getByTestId('create-element-button').click();
  await expect(page.locator('ngx-editor')).toBeVisible();
  await page.locator('ngx-editor .ProseMirror').click();
}

test.describe('Editor input rules', () => {
  test('are off by default: "# " stays literal text', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Literal Hash', { shortcuts: false });
    const editor = page.locator('ngx-editor .ProseMirror');

    await page.keyboard.type('# Chapter 1');

    await expect(editor.locator('h1')).toHaveCount(0);
    await expect(editor.locator('p').first()).toHaveText('# Chapter 1');
  });

  test('"#" prefixes become headings of the matching level', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Heading Rules');
    const editor = page.locator('ngx-editor .ProseMirror');

    for (let level = 1; level <= 6; level++) {
      await page.keyboard.type(`${'#'.repeat(level)} Title ${level}`);
      await page.keyboard.press('Enter');
    }

    for (let level = 1; level <= 6; level++) {
      await expect(editor.locator(`h${level}`)).toHaveText(`Title ${level}`);
    }
    await expect(editor).not.toContainText('# ');
  });

  test('Ctrl/Cmd+Z straight after a conversion restores the typed text', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Heading Undo');
    const editor = page.locator('ngx-editor .ProseMirror');

    await page.keyboard.type('## ');
    await expect(editor.locator('h2')).toHaveCount(1);

    await page.keyboard.press('ControlOrMeta+z');
    await expect(editor.locator('h2')).toHaveCount(0);
    await expect(editor.locator('p').first()).toHaveText('##');
  });

  test('"> ", "- " and "1. " create a blockquote and lists', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Block Rules');
    const editor = page.locator('ngx-editor .ProseMirror');

    await page.keyboard.type('> quoted');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- item');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('1. first');

    await expect(editor.locator('blockquote')).toContainText('quoted');
    await expect(editor.locator('ul li')).toContainText('item');
    await expect(editor.locator('ol li')).toContainText('first');
  });

  test('a converted heading survives a reload', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Heading Persist');
    await page.keyboard.type('# Chapter 1');
    await expect(page.locator('ngx-editor .ProseMirror h1')).toHaveText(
      'Chapter 1'
    );

    await page.reload();
    await expect(page.locator('ngx-editor .ProseMirror h1')).toHaveText(
      'Chapter 1'
    );
  });
});
