/**
 * Comments E2E Tests — Local Mode
 *
 * Tests for the comment/annotation system in local-only mode.
 * Comments are stored entirely in ProseMirror marks (no server).
 *
 * Consolidated from 7 individual tests into 3 grouped tests using
 * `test.step()`. Each grouped test owns one project so flows that
 * mutate marks (resolve / delete) stay isolated.
 */

import { expect, type Page } from '@playwright/test';

import {
  createProjectWithTwoSteps,
  pressShortcut,
} from '../common/test-helpers';
import { test } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Open a project, navigate into the README document, and ensure the editor
 * is visible. Uses the 'worldbuilding-demo' template so README has content.
 */
async function openEditorInProject(
  page: Page,
  projectSlug: string
): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('empty-state')).toBeVisible();

  await createProjectWithTwoSteps(
    page,
    'Comment Test Project',
    projectSlug,
    undefined,
    'worldbuilding-demo'
  );

  await page.waitForURL(new RegExp(projectSlug));
  await expect(page.getByTestId('project-tree')).toBeVisible();

  await page
    .getByTestId('element-README')
    .click()
    .catch(() => page.locator('[role="treeitem"]').first().click());

  await expect(page.getByTestId('document-editor')).toBeVisible();
}

/**
 * Select a fresh paragraph in the editor and add a comment via the keyboard
 * shortcut, accepting the Material dialog with the given text.
 *
 * @param paragraphIndex - which <p> in the editor to comment on (each call
 *   should use a different index so highlights don't overlap).
 */
async function addCommentViaShortcut(
  page: Page,
  commentText: string,
  paragraphIndex = 0
): Promise<void> {
  const editor = page.getByTestId('document-editor');
  const paragraph = editor.locator('p').nth(paragraphIndex);
  await paragraph.click({ clickCount: 3 });

  await pressShortcut(page, 'Alt+m');

  const dialogInput = page.getByTestId('comment-text-input');
  await expect(dialogInput).toBeVisible();
  await dialogInput.fill(commentText);
  await page.getByTestId('submit-comment-btn').click();

  // Wait for the dialog to dismiss before continuing.
  await expect(dialogInput).not.toBeVisible();

  // Clear any text selection left over from the triple-click — subsequent
  // clicks on the highlight need to be treated as fresh clicks, not as
  // selection extensions.
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Comments — Local Mode', () => {
  test('add comment, highlight, popover open & close-button lifecycle', async ({
    localPage: page,
  }) => {
    await openEditorInProject(page, 'comment-lifecycle');

    await test.step('Ctrl+Alt+M adds a local comment with highlight attrs', async () => {
      await addCommentViaShortcut(page, 'Lifecycle test comment');

      const highlight = page.locator('.comment-highlight').first();
      await expect(highlight).toBeVisible();
      await expect(highlight).toHaveAttribute('data-comment-id', /.+/);
      await expect(highlight).toHaveAttribute(
        'data-comment-local-only',
        'true'
      );
    });

    await test.step('clicking the highlight opens the popover with a close button', async () => {
      await page.locator('.comment-highlight').first().click();
      await expect(page.getByTestId('comment-popover')).toBeVisible();
      await expect(page.getByTestId('comment-close-btn')).toBeVisible();
    });

    await test.step('close button dismisses the popover but keeps the highlight', async () => {
      await page.getByTestId('comment-close-btn').click();
      await expect(page.getByTestId('comment-popover')).not.toBeVisible();
      await expect(page.locator('.comment-highlight').first()).toBeVisible();
    });
  });

  test('comment panel: empty state, listing after add, and close', async ({
    localPage: page,
  }) => {
    await openEditorInProject(page, 'comment-panel');

    await test.step('toolbar toggle opens the panel and shows empty state', async () => {
      await page.getByTestId('toolbar-comments').click();
      await expect(page.getByTestId('comment-panel')).toBeVisible();
      await expect(page.getByTestId('comment-panel-empty')).toBeVisible();
    });

    await test.step('adding a comment makes a thread appear in the panel', async () => {
      // Close the panel first so it doesn't intercept selection clicks in the editor.
      await page.getByTestId('comment-panel-close').click();
      await expect(page.getByTestId('comment-panel')).not.toBeVisible();

      await addCommentViaShortcut(page, 'Panel test comment');
      await expect(page.locator('.comment-highlight').first()).toBeVisible();

      await page.getByTestId('toolbar-comments').click();
      await expect(page.getByTestId('comment-panel')).toBeVisible();

      const thread = page.getByTestId('comment-panel-thread').first();
      await expect(thread).toBeVisible();
      await expect(thread).toContainText('Panel test comment');
    });

    await test.step('panel close button dismisses the panel', async () => {
      await page.getByTestId('comment-panel-close').click();
      await expect(page.getByTestId('comment-panel')).not.toBeVisible();
    });
  });

  test('delete a comment via the popover', async ({ localPage: page }) => {
    await openEditorInProject(page, 'comment-delete');
    await addCommentViaShortcut(page, 'Delete me', 0);

    const highlight = page.locator('.comment-highlight').first();
    await expect(highlight).toBeVisible();
    await highlight.click();

    await expect(page.getByTestId('comment-popover')).toBeVisible();
    await page.getByTestId('comment-delete-btn').click();

    await expect(page.getByTestId('comment-popover')).not.toBeVisible();
    await expect(page.locator('.comment-highlight')).toHaveCount(0);
  });

  test('resolve a comment via the popover', async ({ localPage: page }) => {
    await openEditorInProject(page, 'comment-resolve');
    await addCommentViaShortcut(page, 'Resolve me', 0);

    const highlight = page.locator('.comment-highlight').first();
    await expect(highlight).toBeVisible();
    await highlight.click();

    await expect(page.getByTestId('comment-popover')).toBeVisible();
    await page.getByTestId('comment-resolve-btn').click();

    await expect(page.getByTestId('comment-popover')).not.toBeVisible();
    await expect(
      page.locator('.comment-highlight--resolved').first()
    ).toBeVisible();
  });
});
