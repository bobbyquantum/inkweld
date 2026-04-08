/**
 * Comments E2E Tests — Local Mode
 *
 * Tests for the comment/annotation system in local-only mode.
 * Comments are stored entirely in ProseMirror marks (no server).
 *
 * Covers:
 * - Adding a comment via Ctrl+Alt+M
 * - Comment highlight appears in editor
 * - Clicking a highlight opens the popover
 * - Comment panel toggle and thread listing
 * - Resolving (deleting) a local comment
 * - Deleting a comment
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
 * Open a project, navigate into a document, and return the editor locator.
 * Uses the 'worldbuilding-demo' template so there is a README with content.
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

  // Open the README document
  await page
    .getByTestId('element-README')
    .click()
    .catch(() => page.locator('[role="treeitem"]').first().click());

  const editor = page.getByTestId('document-editor');
  await expect(editor).toBeVisible();
}

/**
 * Select a plain-text paragraph in the editor and add a comment via the
 * keyboard shortcut, accepting the browser prompt with the given text.
 * Targets the first <p> element (intro paragraph) to avoid element references.
 */
async function addCommentViaShortcut(
  page: Page,
  commentText: string
): Promise<void> {
  const editor = page.getByTestId('document-editor');

  // Click on the first plain-text paragraph (no element refs)
  // Triple-click to select the entire paragraph
  const paragraph = editor.locator('p').first();
  await paragraph.click({ clickCount: 3 });

  // Trigger the add-comment shortcut (Ctrl+Alt+M)
  await pressShortcut(page, 'Alt+m');

  // Fill in the Material dialog
  const dialogInput = page.getByTestId('comment-text-input');
  await expect(dialogInput).toBeVisible();
  await dialogInput.fill(commentText);
  await page.getByTestId('submit-comment-btn').click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Comments — Local Mode', () => {
  test('should add a comment via Ctrl+Alt+M and highlight text', async ({
    localPage: page,
  }) => {
    await openEditorInProject(page, 'comment-add');

    await addCommentViaShortcut(page, 'This is a test comment');

    // A comment-highlight span should appear in the editor
    const highlight = page.locator('.comment-highlight').first();
    await expect(highlight).toBeVisible();

    // The highlight should carry the data-comment-id attribute
    await expect(highlight).toHaveAttribute('data-comment-id', /.+/);

    // It should be marked as local-only
    await expect(highlight).toHaveAttribute('data-comment-local-only', 'true');
  });

  test('should open popover when clicking a comment highlight', async ({
    localPage: page,
  }) => {
    await openEditorInProject(page, 'comment-popover');
    await addCommentViaShortcut(page, 'Popover test comment');

    // Click the highlighted text to open the popover
    const highlight = page.locator('.comment-highlight').first();
    await expect(highlight).toBeVisible();
    await highlight.click();

    // The popover should appear
    const popover = page.getByTestId('comment-popover');
    await expect(popover).toBeVisible();

    // Close btn should be visible
    await expect(page.getByTestId('comment-close-btn')).toBeVisible();
  });

  test('should delete a comment via popover', async ({ localPage: page }) => {
    await openEditorInProject(page, 'comment-delete');
    await addCommentViaShortcut(page, 'Delete me');

    // Verify highlight exists
    const highlight = page.locator('.comment-highlight').first();
    await expect(highlight).toBeVisible();

    // Open popover
    await highlight.click();
    await expect(page.getByTestId('comment-popover')).toBeVisible();

    // Click delete
    await page.getByTestId('comment-delete-btn').click();

    // Popover should close
    await expect(page.getByTestId('comment-popover')).not.toBeVisible();

    // Highlight should be removed from editor
    await expect(page.locator('.comment-highlight')).not.toBeVisible();
  });

  test('should resolve a comment via popover', async ({ localPage: page }) => {
    await openEditorInProject(page, 'comment-resolve');
    await addCommentViaShortcut(page, 'Resolve me');

    const highlight = page.locator('.comment-highlight').first();
    await expect(highlight).toBeVisible();

    // Open popover
    await highlight.click();
    await expect(page.getByTestId('comment-popover')).toBeVisible();

    // Click resolve
    await page.getByTestId('comment-resolve-btn').click();

    // Popover closes after resolve
    await expect(page.getByTestId('comment-popover')).not.toBeVisible();

    // Mark stays but is now resolved (subtle dashed underline)
    await expect(
      page.locator('.comment-highlight--resolved').first()
    ).toBeVisible();
  });

  test('should open and close the comment panel', async ({
    localPage: page,
  }) => {
    await openEditorInProject(page, 'comment-panel');

    // Click the comments toggle button in the toolbar
    await page.getByTestId('toolbar-comments').click();

    // Panel should appear
    const panel = page.getByTestId('comment-panel');
    await expect(panel).toBeVisible();

    // With no comments, should show empty state
    await expect(page.getByTestId('comment-panel-empty')).toBeVisible();

    // Close the panel
    await page.getByTestId('comment-panel-close').click();
    await expect(panel).not.toBeVisible();
  });

  test('should list comments in the panel after adding one', async ({
    localPage: page,
  }) => {
    await openEditorInProject(page, 'comment-panel-list');
    await addCommentViaShortcut(page, 'Panel test comment');

    // Verify highlight exists
    await expect(page.locator('.comment-highlight').first()).toBeVisible();

    // Open the comment panel
    await page.getByTestId('toolbar-comments').click();

    const panel = page.getByTestId('comment-panel');
    await expect(panel).toBeVisible();

    // Should show the thread
    const thread = page.getByTestId('comment-panel-thread').first();
    await expect(thread).toBeVisible();

    // Thread preview should contain our comment text
    await expect(thread).toContainText('Panel test comment');
  });

  test('should close popover with close button', async ({
    localPage: page,
  }) => {
    await openEditorInProject(page, 'comment-close');
    await addCommentViaShortcut(page, 'Close test comment');

    const highlight = page.locator('.comment-highlight').first();
    await highlight.click();

    const popover = page.getByTestId('comment-popover');
    await expect(popover).toBeVisible();

    // Click the close button
    await page.getByTestId('comment-close-btn').click();
    await expect(popover).not.toBeVisible();

    // Highlight should still exist (we only closed the popover, not deleted)
    await expect(page.locator('.comment-highlight').first()).toBeVisible();
  });
});
