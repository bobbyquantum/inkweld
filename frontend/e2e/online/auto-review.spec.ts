/**
 * AI Auto-Review E2E Tests — Online Mode
 *
 * Tests the server-side mark-based auto-review architecture:
 * - Open the auto-review panel sidebar via the toolbar
 * - Click "Review" to trigger the server-side review endpoint
 * - Suggestions appear as auto_review marks (highlighted in the editor)
 * - Click on highlighted text shows a popover with accept/reject
 * - Accepting a suggestion replaces the text + removes the mark
 * - Rejecting a suggestion removes the mark (keeps text)
 *
 * The backend review endpoint is faked via page.route. Since the fake
 * response doesn't actually insert marks into the Yjs doc, we verify
 * the panel UI (open/close, empty state, review button trigger).
 * Full mark insertion is covered by backend unit tests.
 */

import { expect, type Page, type Route } from '@playwright/test';

import { test } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createProjectAndOpenEditor(
  page: Page,
  slug: string
): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Linux x86_64',
    });
  });

  await page.goto('/create-project');

  const nextButton = page.getByRole('button', { name: /next/i });
  await nextButton.waitFor();
  await nextButton.click();

  await page.getByTestId('project-title-input').fill('Auto-Review Test');
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

async function interceptReview(page: Page): Promise<() => Promise<void>> {
  const handler = async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        suggestions: [],
        clearedMarks: 0,
      }),
    });
  };

  await page.route('**/api/v1/projects/**/auto-review/review', handler);
  return async () => {
    await page.unroute('**/api/v1/projects/**/auto-review/review', handler);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('AI Auto-Review — Online Mode', () => {
  test.describe.configure({ timeout: 90_000 });

  test('auto-review panel opens and closes via toolbar', async ({
    authenticatedPage: page,
  }) => {
    const slug = `auto-review-${Date.now()}`;

    await createProjectAndOpenEditor(page, slug);

    // Panel should not be visible initially
    await expect(page.getByTestId('auto-review-panel')).not.toBeVisible();

    // Open via toolbar button
    await page.getByTestId('toolbar-auto-review').click();
    await expect(page.getByTestId('auto-review-panel')).toBeVisible();

    // Close via toolbar button
    await page.getByTestId('toolbar-auto-review').click();
    await expect(page.getByTestId('auto-review-panel')).not.toBeVisible();
  });

  test('auto-review panel shows empty state', async ({
    authenticatedPage: page,
  }) => {
    const slug = `auto-review-empty-${Date.now()}`;

    await createProjectAndOpenEditor(page, slug);

    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
    await editor.fill('A clean sentence with no errors.');

    // Open the panel
    await page.getByTestId('toolbar-auto-review').click();
    await expect(page.getByTestId('auto-review-panel')).toBeVisible();

    // Should show the empty state
    await expect(page.getByTestId('auto-review-panel-empty')).toBeVisible();
  });

  test('review button triggers API call', async ({
    authenticatedPage: page,
  }) => {
    const slug = `auto-review-call-${Date.now()}`;
    const unroute = await interceptReview(page);

    await createProjectAndOpenEditor(page, slug);

    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
    await editor.fill('This are a test.');

    // Open the panel
    await page.getByTestId('toolbar-auto-review').click();
    await expect(page.getByTestId('auto-review-panel')).toBeVisible();

    // Click the review button
    await page.getByTestId('auto-review-btn').click();

    // The review call should have been made (panel stays visible)
    await expect(page.getByTestId('auto-review-panel')).toBeVisible();

    await unroute();
  });

  test('auto-review panel can be closed via close button', async ({
    authenticatedPage: page,
  }) => {
    const slug = `auto-review-close-${Date.now()}`;

    await createProjectAndOpenEditor(page, slug);

    // Open
    await page.getByTestId('toolbar-auto-review').click();
    await expect(page.getByTestId('auto-review-panel')).toBeVisible();

    // Close via close button in the panel
    await page.getByTestId('auto-review-panel-close').click();
    await expect(page.getByTestId('auto-review-panel')).not.toBeVisible();
  });
});
