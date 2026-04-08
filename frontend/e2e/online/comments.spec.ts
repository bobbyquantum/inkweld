/**
 * Comments E2E Tests — Online Mode
 *
 * Tests for the comment/annotation system in server mode.
 * Comments are persisted via REST API with ProseMirror marks as position anchors.
 *
 * Covers:
 * - Adding a comment (creates server thread + mark)
 * - Clicking highlight opens popover with server data
 * - Replying to a thread
 * - Resolving a thread
 * - Deleting a thread
 * - Comment panel lists server threads
 */

import { expect, type Page } from '@playwright/test';

import { pressShortcut } from '../common/test-helpers';
import { test } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a project via the two-step wizard and open its README in the editor.
 */
async function createProjectAndOpenEditor(
  page: Page,
  slug: string
): Promise<void> {
  // Override navigator.platform so ProseMirror maps Mod- to Ctrl,
  // matching the local test convention and avoiding macOS key interception.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Linux x86_64',
    });
  });

  // Navigate to create project page
  await page.goto('/create-project');

  // Step 1: Template selection — use default (empty is first, selected by default)
  const nextButton = page.getByRole('button', { name: /next/i });
  await nextButton.waitFor();
  await nextButton.click();

  // Step 2: Fill in project details
  await page.getByTestId('project-title-input').fill('Comment Test');
  await page.getByTestId('project-slug-input').fill(slug);

  // Submit the form
  await page.getByTestId('create-project-button').click();

  // Should redirect to the project page
  await expect(page).toHaveURL(new RegExp(slug));

  // Wait for the project tree
  await expect(page.locator('app-project-tree')).toBeVisible();

  // Open the README document (all templates include one)
  await page
    .click('text="README"')
    .catch(() => page.locator('.tree-node-item').first().click());

  // Wait for the ProseMirror editor to appear
  const editor = page.locator('.ProseMirror').first();
  await expect(editor).toBeVisible();
}

/**
 * Select a plain-text paragraph in the editor and add a comment via the
 * keyboard shortcut, accepting the browser prompt with the given text.
 */
async function addCommentToFirstParagraph(
  page: Page,
  commentText: string
): Promise<void> {
  const editor = page.locator('.ProseMirror').first();

  // Click on the first plain-text paragraph (no element refs or headings)
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

test.describe('Comments — Online Mode', () => {
  // Each test creates a project, opens editor, and adds a comment — allow extra time
  test.describe.configure({ timeout: 60_000 });

  test('should add a comment that persists as a highlight', async ({
    authenticatedPage: page,
  }) => {
    const slug = `comments-add-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await addCommentToFirstParagraph(page, 'My first comment');

    // A comment-highlight span should appear in the editor
    const highlight = page.locator('.comment-highlight').first();
    await expect(highlight).toBeVisible();

    // Should carry a valid UUID comment ID
    await expect(highlight).toHaveAttribute('data-comment-id', /.+/);

    // Should NOT be local-only
    const localOnly = await highlight.getAttribute('data-comment-local-only');
    expect(localOnly).not.toBe('true');
  });

  test('should open popover when clicking a comment highlight', async ({
    authenticatedPage: page,
  }) => {
    const slug = `comments-popover-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await addCommentToFirstParagraph(page, 'Popover comment');

    // Click the highlighted text
    const highlight = page.locator('.comment-highlight').first();
    await expect(highlight).toBeVisible();
    await highlight.click();

    // Popover should appear
    const popover = page.getByTestId('comment-popover');
    await expect(popover).toBeVisible();

    // Should show the comment text from the server
    await expect(popover).toContainText('Popover comment');

    // Action buttons should be visible
    await expect(page.getByTestId('comment-resolve-btn')).toBeVisible();
    await expect(page.getByTestId('comment-delete-btn')).toBeVisible();
    await expect(page.getByTestId('comment-close-btn')).toBeVisible();
  });

  test('should reply to a comment thread', async ({
    authenticatedPage: page,
  }) => {
    const slug = `comments-reply-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await addCommentToFirstParagraph(page, 'Original comment');

    // Open popover
    const highlight = page.locator('.comment-highlight').first();
    await highlight.click();

    const popover = page.getByTestId('comment-popover');
    await expect(popover).toBeVisible();

    // Type a reply
    const replyInput = page.getByTestId('comment-reply-input');
    await replyInput.fill('This is a reply');

    // Submit the reply
    await page.getByTestId('comment-reply-btn').click();

    // The reply should appear in the popover's message list
    await expect(popover).toContainText('This is a reply');
  });

  test('should resolve a comment thread', async ({
    authenticatedPage: page,
  }) => {
    const slug = `comments-resolve-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await addCommentToFirstParagraph(page, 'Comment to resolve');

    const highlight = page.locator('.comment-highlight').first();
    await highlight.click();

    await expect(page.getByTestId('comment-popover')).toBeVisible();

    // Click resolve
    await page.getByTestId('comment-resolve-btn').click();

    // Popover closes
    await expect(page.getByTestId('comment-popover')).not.toBeVisible();

    // Mark stays but is now resolved (subtle dashed underline)
    await expect(
      page.locator('.comment-highlight--resolved').first()
    ).toBeVisible();
  });

  test('should delete a comment thread', async ({
    authenticatedPage: page,
  }) => {
    const slug = `comments-delete-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await addCommentToFirstParagraph(page, 'Comment to delete');

    const highlight = page.locator('.comment-highlight').first();
    await highlight.click();

    await expect(page.getByTestId('comment-popover')).toBeVisible();

    // Click delete
    await page.getByTestId('comment-delete-btn').click();

    // Popover closes
    await expect(page.getByTestId('comment-popover')).not.toBeVisible();

    // Highlight is removed
    await expect(page.locator('.comment-highlight')).not.toBeVisible();
  });

  test('should open and close the comment panel', async ({
    authenticatedPage: page,
  }) => {
    const slug = `comments-panel-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    // Open panel
    await page.getByTestId('toolbar-comments').click();

    const panel = page.getByTestId('comment-panel');
    await expect(panel).toBeVisible();

    // Empty state
    await expect(panel.locator('text=No comments yet')).toBeVisible();

    // Close panel
    await page.getByTestId('comment-panel-close').click();
    await expect(panel).not.toBeVisible();
  });

  test('should list comments in the panel after adding one', async ({
    authenticatedPage: page,
  }) => {
    const slug = `comments-panel-list-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await addCommentToFirstParagraph(page, 'Panel test comment');

    // Verify highlight exists
    await expect(page.locator('.comment-highlight').first()).toBeVisible();

    // Open the comment panel
    await page.getByTestId('toolbar-comments').click();

    const panel = page.getByTestId('comment-panel');
    await expect(panel).toBeVisible();

    // Should show the thread
    const thread = page.getByTestId('comment-panel-thread').first();
    await expect(thread).toBeVisible();
  });

  test('should close popover with close button without removing comment', async ({
    authenticatedPage: page,
  }) => {
    const slug = `comments-close-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await addCommentToFirstParagraph(page, 'Close popover comment');

    const highlight = page.locator('.comment-highlight').first();
    await highlight.click();

    const popover = page.getByTestId('comment-popover');
    await expect(popover).toBeVisible();

    // Close the popover
    await page.getByTestId('comment-close-btn').click();
    await expect(popover).not.toBeVisible();

    // Highlight should still exist
    await expect(page.locator('.comment-highlight').first()).toBeVisible();
  });
});
