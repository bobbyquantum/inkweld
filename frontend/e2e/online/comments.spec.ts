/**
 * Comments E2E Tests — Online Mode
 *
 * Tests for the comment/annotation system in server mode.
 * Comments are persisted via REST API with ProseMirror marks as position anchors.
 *
 * Covers:
 * - Empty comment panel state
 * - Adding a comment (creates server thread + mark)
 * - Clicking highlight opens popover with server data
 * - Closing popover does not remove highlight
 * - Comment panel lists server threads
 * - Replying to a thread
 * - Resolving a thread
 * - Deleting a thread
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

  await page.goto('/create-project');

  const nextButton = page.getByRole('button', { name: /next/i });
  await nextButton.waitFor();
  await nextButton.click();

  await page.getByTestId('project-title-input').fill('Comment Test');
  await page.getByTestId('project-slug-input').fill(slug);
  await page.getByTestId('create-project-button').click();

  await expect(page).toHaveURL(new RegExp(slug));
  await expect(page.getByTestId('project-tree')).toBeVisible();

  await page
    .getByTestId('element-README')
    .click()
    .catch(() => page.locator('[role="treeitem"]').first().click());

  const editor = page.getByTestId('document-editor');
  await expect(editor).toBeVisible();
}

/**
 * Select a plain-text paragraph in the editor and add a comment via the
 * keyboard shortcut, accepting the dialog with the given text.
 */
async function addCommentToFirstParagraph(
  page: Page,
  commentText: string
): Promise<void> {
  const editor = page.getByTestId('document-editor');

  const paragraph = editor.locator('p').first();
  await paragraph.click({ clickCount: 3 });

  // Trigger the add-comment shortcut (Ctrl+Alt+M)
  await pressShortcut(page, 'Alt+m');

  const dialogInput = page.getByTestId('comment-text-input');
  await expect(dialogInput).toBeVisible();
  await dialogInput.fill(commentText);
  await page.getByTestId('submit-comment-btn').click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Comments — Online Mode', () => {
  // Single consolidated flow exercises the full comment lifecycle on one
  // project + one document. Covers what was previously 8 independent tests.
  test.describe.configure({ timeout: 90_000 });

  test('comment lifecycle: panel, add, popover, reply, resolve, delete', async ({
    authenticatedPage: page,
  }) => {
    const slug = `comments-lifecycle-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await test.step('opens and closes the comment panel (empty state)', async () => {
      await page.getByTestId('toolbar-comments').click();
      const panel = page.getByTestId('comment-panel');
      await expect(panel).toBeVisible();
      await expect(page.getByTestId('comment-panel-empty')).toBeVisible();
      await page.getByTestId('comment-panel-close').click();
      await expect(panel).not.toBeVisible();
    });

    await test.step('adds a comment that persists as a non-local highlight', async () => {
      await addCommentToFirstParagraph(page, 'Lifecycle comment');

      const highlight = page.locator('.comment-highlight').first();
      await expect(highlight).toBeVisible();
      await expect(highlight).toHaveAttribute('data-comment-id', /.+/);

      const localOnly = await highlight.getAttribute('data-comment-local-only');
      expect(localOnly).not.toBe('true');
    });

    await test.step('opens popover with server data and action buttons', async () => {
      const highlight = page.locator('.comment-highlight').first();
      await highlight.click();

      const popover = page.getByTestId('comment-popover');
      await expect(popover).toBeVisible();
      await expect(popover).toContainText('Lifecycle comment');
      await expect(page.getByTestId('comment-resolve-btn')).toBeVisible();
      await expect(page.getByTestId('comment-delete-btn')).toBeVisible();
      await expect(page.getByTestId('comment-close-btn')).toBeVisible();
    });

    await test.step('closes popover with close button without removing the highlight', async () => {
      const popover = page.getByTestId('comment-popover');
      // Popover is already open from previous step.
      await expect(popover).toBeVisible();
      await page.getByTestId('comment-close-btn').click();
      await expect(popover).not.toBeVisible();
      await expect(page.locator('.comment-highlight').first()).toBeVisible();
    });

    await test.step('lists the comment thread in the panel', async () => {
      await page.getByTestId('toolbar-comments').click();
      const panel = page.getByTestId('comment-panel');
      await expect(panel).toBeVisible();
      const thread = page.getByTestId('comment-panel-thread').first();
      await expect(thread).toBeVisible();
      // Close the panel so the editor is unobstructed for the next steps.
      await page.getByTestId('comment-panel-close').click();
      await expect(panel).not.toBeVisible();
    });

    await test.step('replies to the comment thread', async () => {
      const highlight = page.locator('.comment-highlight').first();
      await expect(highlight).toBeVisible();
      await highlight.scrollIntoViewIfNeeded();

      // Clicking the highlight occasionally races with editor focus
      // restoration after the panel close in the previous step. Retry a
      // few times until the popover actually appears.
      const popover = page.getByTestId('comment-popover');
      await expect
        .poll(
          async () => {
            if (await popover.isVisible().catch(() => false)) return true;
            await highlight.click();
            try {
              await popover.waitFor({ state: 'visible', timeout: 2000 });
              return true;
            } catch {
              return false;
            }
          },
          { timeout: 15_000 }
        )
        .toBe(true);

      const replyInput = page.getByTestId('comment-reply-input');
      await replyInput.fill('This is a reply');
      await page.getByTestId('comment-reply-btn').click();
      await expect(popover).toContainText('This is a reply');
    });

    await test.step('resolves the comment thread (mark stays, becomes resolved)', async () => {
      // Popover still open from reply step.
      await page.getByTestId('comment-resolve-btn').click();
      await expect(page.getByTestId('comment-popover')).not.toBeVisible();
      await expect(
        page.locator('.comment-highlight--resolved').first()
      ).toBeVisible();
    });

    await test.step('deletes a comment thread (highlight removed)', async () => {
      // The previous step left a *resolved* highlight, which may not open
      // its popover on click. Add a fresh comment on the next paragraph
      // (or reuse the same paragraph — a 2nd selection works) and delete it.
      const editor = page.getByTestId('document-editor');
      // Use the second paragraph if one exists, otherwise the first.
      const paragraphs = editor.locator('p');
      const targetIndex = (await paragraphs.count()) > 1 ? 1 : 0;
      await paragraphs.nth(targetIndex).click({ clickCount: 3 });
      await pressShortcut(page, 'Alt+m');

      const dialogInput = page.getByTestId('comment-text-input');
      await expect(dialogInput).toBeVisible();
      await dialogInput.fill('Comment to delete');
      await page.getByTestId('submit-comment-btn').click();

      // Find the new (non-resolved) highlight and click it.
      const newHighlight = page
        .locator('.comment-highlight:not(.comment-highlight--resolved)')
        .first();
      await expect(newHighlight).toBeVisible();
      await newHighlight.click();
      await expect(page.getByTestId('comment-popover')).toBeVisible();

      await page.getByTestId('comment-delete-btn').click();
      await expect(page.getByTestId('comment-popover')).not.toBeVisible();
      await expect(
        page.locator('.comment-highlight:not(.comment-highlight--resolved)')
      ).not.toBeVisible();
    });
  });
});
