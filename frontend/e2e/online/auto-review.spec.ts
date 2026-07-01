/**
 * AI Auto-Review E2E Tests — Online Mode
 *
 * Tests the **server-side mark-based auto-review architecture end-to-end**:
 *
 *   editor text → POST /review → backend → mock LLM (globalSetup) →
 *   backend inserts `auto_review` marks on Y.XmlText → Yjs sync to client →
 *   ProseMirror re-renders the highlight → panel lists the suggestion →
 *   user clicks accept/reject (in panel or editor popover) → backend
 *   mutates Yjs doc again (replace text / remove mark) → client re-syncs.
 *
 * The mock OpenAI-compatible server is started once in `online-setup.ts`
 * (the global setup) and pointed at by the `AI_OPENAI_ENDPOINT` config
 * key. Each test writes deterministic trigger phrases into the editor
 * (e.g. "This are a test.") that the mock responds to with fixed
 * corrections, so the full backend pipeline — Yjs mark insertion, sync,
 * accept/reject — runs for real.
 *
 * Coverage:
 *  1.  Panel open/close (toolbar + close button)
 *  2.  Idle form shown before any review runs (Start Review button)
 *  3.  Review with no issues → empty state + Run Again button
 *  4.  Review button triggers a real backend call (visible loading state)
 *  5.  Review returns suggestions → highlight visible in editor
 *  6.  Review returns suggestions → suggestion appears in panel
 *  7.  Clicking a panel suggestion expands it (shows accept/reject)
 *  8.  Accepting a suggestion from the panel replaces text + removes mark
 *  9.  Rejecting a suggestion from the panel removes mark, keeps text
 *  10. Clicking highlighted text in editor opens popover
 *  10. Accepting from editor popover replaces text + removes mark
 *  11. Rejecting from editor popover removes mark, keeps text
 *  12. Clear-all button removes all marks + hides clear button
 *  13. Re-review clears existing marks before applying new ones
 */

import { expect, type Page } from '@playwright/test';

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
  await page.waitForTimeout(100);
  await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 30000 });
}

async function openPanel(page: Page): Promise<void> {
  await page.getByTestId('toolbar-auto-review').click();
  await expect(page.getByTestId('auto-review-panel')).toBeVisible();
}

async function fillEditorAndReview(page: Page, text: string): Promise<void> {
  const editor = page.locator('.ProseMirror');
  await expect(editor).toBeVisible();
  // Clear existing content: select all + delete.
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);
  // Type the trigger text.
  await page.keyboard.type(text);
  await page.waitForTimeout(200);

  // Trigger the review.
  await page.getByTestId('auto-review-btn').click();

  // Wait for highlights to appear in the editor (Yjs sync from backend).
  await expect
    .poll(
      async () => (await page.locator('.auto-review-highlight').count()) > 0,
      { timeout: 90_000, intervals: [500, 1000, 2000] }
    )
    .toBeTruthy();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/** Whether the backend's AI auto-review is configured (mock LLM reachable).
 *  Mark-dependent tests are skipped when false (e.g. Wrangler/Docker CI). */
let aiConfigured = false;

test.describe('AI Auto-Review — Online Mode', () => {
  // Serial mode: each auto-review test creates a project, types text, calls
  // the mock LLM, and waits for Yjs sync. Running 16+ tests in parallel
  // overwhelms the single-threaded backend's Yjs processing, causing 60s
  // timeouts. Serial execution adds ~2m total but eliminates sync contention.
  test.describe.configure({ timeout: 120_000, mode: 'serial' });

  test.beforeAll(async () => {
    const apiUrl = process.env['API_BASE_URL'] ?? 'http://localhost:9333';
    try {
      const res = await fetch(`${apiUrl}/api/v1/config/features`);
      if (res.ok) {
        const data = (await res.json()) as { aiAutoReview?: boolean };
        aiConfigured = data.aiAutoReview === true;
      }
    } catch {
      // Backend not reachable — mark tests will fail
    }
  });

  test('auto-review panel opens and closes via toolbar', async ({
    authenticatedPage: page,
  }) => {
    // The toolbar button is gated on the AI auto-review feature flag, which
    // is off in configs that don't configure an OpenAI provider (Docker,
    // Wrangler). Skip there; the Online config (mock LLM) exercises this.
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await expect(page.getByTestId('auto-review-panel')).not.toBeVisible();

    await page.getByTestId('toolbar-auto-review').click();
    await expect(page.getByTestId('auto-review-panel')).toBeVisible();

    await page.getByTestId('toolbar-auto-review').click();
    await expect(page.getByTestId('auto-review-panel')).not.toBeVisible();
  });

  test('auto-review panel can be closed via close button', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-close-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    await page.getByTestId('toolbar-auto-review').click();
    await expect(page.getByTestId('auto-review-panel')).toBeVisible();

    await page.getByTestId('auto-review-panel-close').click();
    await expect(page.getByTestId('auto-review-panel')).not.toBeVisible();
  });

  test('auto-review panel shows the review form before any review runs', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-form-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);

    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('A flawless sentence with no triggers.');

    await openPanel(page);

    // Idle state: the review "form" with a Start Review button is shown,
    // not the post-review empty state.
    await expect(page.getByTestId('auto-review-panel-form')).toBeVisible();
    await expect(page.getByTestId('auto-review-btn')).toBeVisible();
    await expect(page.getByTestId('auto-review-panel-empty')).not.toBeVisible();
  });

  test('review with no issues shows the empty state and a Run Again button', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-no-issues-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    // Text with no trigger phrases → mock LLM returns no corrections.
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await page.keyboard.type('A flawless sentence with no triggers.');

    await page.getByTestId('auto-review-btn').click();

    // Loading state briefly, then the post-review empty state.
    await expect
      .poll(
        async () =>
          (await page.getByTestId('auto-review-panel-empty').isVisible()) ||
          (await page.getByTestId('auto-review-panel-suggestion').count()) > 0,
        { timeout: 60_000, intervals: [250, 500, 1000] }
      )
      .toBeTruthy();

    // No trigger phrases → no suggestions → empty state with Run Again.
    await expect(page.getByTestId('auto-review-panel-empty')).toBeVisible();
    await expect(page.getByTestId('auto-review-run-again-btn')).toBeVisible();
  });

  test('review triggers loading state and shows suggestion in panel', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-call-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    // Mark the editor with a trigger phrase the mock LLM recognises.
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await page.keyboard.type('This are a test.');

    // Kick off the review and wait for the backend request to fire.
    // Using waitForRequest (non-intercepting) instead of page.route to avoid
    // breaking the request in the prod-build serial execution environment.
    const reviewRequest = page.waitForRequest(
      '**/api/v1/projects/**/auto-review/review'
    );
    await page.getByTestId('auto-review-btn').click();
    await reviewRequest;

    // The loading state should render immediately.
    await expect(page.getByTestId('auto-review-panel-loading')).toBeVisible({
      timeout: 10_000,
    });

    // The panel should display at least one suggestion after the review
    // completes (Yjs sync → marks visible in ProseMirror doc).
    await expect
      .poll(
        async () =>
          (await page.getByTestId('auto-review-panel-suggestion').count()) > 0,
        { timeout: 60_000, intervals: [250, 500, 1000] }
      )
      .toBeTruthy();
  });

  test('review creates a visible highlight in the editor', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-highlight-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    await fillEditorAndReview(page, 'This are a test.');

    // The highlight should have the `auto-review-highlight` class and a
    // stable id stored in the `data-auto-review-id` attribute.
    const highlight = page.locator('.auto-review-highlight').first();
    await expect(highlight).toBeVisible();
    await expect(highlight).toHaveAttribute('data-auto-review-id', /.+/);
    await expect(highlight).toContainText('This are');
  });

  test('clicking a panel suggestion expands it with accept/reject buttons', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-expand-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    await fillEditorAndReview(page, 'This are a test.');

    const suggestion = page.getByTestId('auto-review-panel-suggestion').first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();

    await expect(page.getByTestId('auto-review-accept-btn')).toBeVisible();
    await expect(page.getByTestId('auto-review-reject-btn')).toBeVisible();
  });

  test('accepting a suggestion from the panel replaces text and removes the mark', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-accept-panel-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    await fillEditorAndReview(page, 'This are a test.');

    const suggestion = page.getByTestId('auto-review-panel-suggestion').first();
    await suggestion.click();
    await page.getByTestId('auto-review-accept-btn').click();

    // Mark disappears from the editor after Yjs sync.
    await expect
      .poll(
        async () =>
          (await page.locator('.auto-review-highlight').count()) === 0,
        { timeout: 30_000, intervals: [250, 500, 1000] }
      )
      .toBeTruthy();

    // The (now replaced) text should be "This is a test." somewhere in the
    // editor's visible text — the suggestion was applied server-side.
    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('This is a test.');

    // The suggestion should also be gone from the panel.
    await expect(page.getByTestId('auto-review-panel-suggestion')).toHaveCount(
      0
    );
  });

  test('rejecting a suggestion from the panel removes the mark but keeps the text', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-reject-panel-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    await fillEditorAndReview(page, 'This are a test.');

    const suggestion = page.getByTestId('auto-review-panel-suggestion').first();
    await suggestion.click();
    await page.getByTestId('auto-review-reject-btn').click();

    // Mark disappears from the editor after Yjs sync.
    await expect
      .poll(
        async () =>
          (await page.locator('.auto-review-highlight').count()) === 0,
        { timeout: 30_000, intervals: [250, 500, 1000] }
      )
      .toBeTruthy();

    // The text remains unchanged (rejection does not apply corrections).
    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('This are a test.');

    // The suggestion should be gone from the panel.
    await expect(page.getByTestId('auto-review-panel-suggestion')).toHaveCount(
      0
    );
  });

  test('clicking highlighted text opens the editor popover with accept/reject', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-popover-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    await fillEditorAndReview(page, 'This are a test.');

    const highlight = page.locator('.auto-review-highlight').first();
    await expect(highlight).toBeVisible();
    await highlight.click();

    await expect(page.getByTestId('auto-review-popover')).toBeVisible();
    await expect(page.getByTestId('auto-review-popover-accept')).toBeVisible();
    await expect(page.getByTestId('auto-review-popover-reject')).toBeVisible();

    // Closing the popover should NOT remove the highlight (matches the
    // comment-popover behaviour where closing keeps the mark).
    await page.getByTestId('auto-review-popover-close').click();
    await expect(page.getByTestId('auto-review-popover')).not.toBeVisible();
    await expect(highlight).toBeVisible();
  });

  test('accepting from the editor popover replaces text and removes the mark', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-popover-accept-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    await fillEditorAndReview(page, 'This are a test.');

    await page.locator('.auto-review-highlight').first().click();
    await page.getByTestId('auto-review-popover-accept').click();

    await expect
      .poll(
        async () =>
          (await page.locator('.auto-review-highlight').count()) === 0,
        { timeout: 30_000, intervals: [250, 500, 1000] }
      )
      .toBeTruthy();

    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('This is a test.');
  });

  test('rejecting from the editor popover removes the mark but keeps the text', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-popover-reject-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    await fillEditorAndReview(page, 'This are a test.');

    await page.locator('.auto-review-highlight').first().click();
    await page.getByTestId('auto-review-popover-reject').click();

    await expect
      .poll(
        async () =>
          (await page.locator('.auto-review-highlight').count()) === 0,
        { timeout: 30_000, intervals: [250, 500, 1000] }
      )
      .toBeTruthy();

    const editor = page.locator('.ProseMirror');
    await expect(editor).toContainText('This are a test.');
  });

  test('dismiss review button removes all marks and returns to idle form', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-clear-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    await fillEditorAndReview(page, 'This are a test.');

    // The dismiss button in the header is visible once a review has run.
    await expect(
      page.getByTestId('auto-review-dismiss-header-btn')
    ).toBeVisible();

    // Intercept the clear API call and verify it was made.
    let clearCalled = false;
    await page.route('**/api/v1/projects/**/auto-review/clear', route => {
      clearCalled = true;
      return route.continue();
    });

    await page.getByTestId('auto-review-dismiss-header-btn').click();

    await expect
      .poll(
        async () =>
          (await page.locator('.auto-review-highlight').count()) === 0,
        { timeout: 30_000, intervals: [250, 500, 1000] }
      )
      .toBeTruthy();

    expect(clearCalled).toBe(true);

    // After dismissing the review, the panel returns to the idle form.
    await expect(page.getByTestId('auto-review-panel-form')).toBeVisible();
    await expect(page.getByTestId('auto-review-panel-empty')).not.toBeVisible();
  });

  test('re-review clears existing marks before applying new ones', async ({
    authenticatedPage: page,
  }) => {
    if (!aiConfigured) test.skip('AI not configured in CI');
    const slug = `auto-review-rereview-${Date.now()}`;
    await createProjectAndOpenEditor(page, slug);
    await openPanel(page);

    await fillEditorAndReview(page, 'This are a test.');

    // After first review, one suggestion + clear-button shown.
    await expect(page.getByTestId('auto-review-panel-suggestion')).toHaveCount(
      1
    );

    // Re-run the review via the header re-review button (not the idle
    // form's Start Review button, which isn't visible during active review).
    await page.getByTestId('auto-review-rereview-btn').click();

    await expect
      .poll(
        async () => (await page.locator('.auto-review-highlight').count()) > 0,
        { timeout: 60_000, intervals: [250, 500, 1000] }
      )
      .toBeTruthy();

    // The id may have changed (regenerated server-side), but the
    // highlight should still reference "This are".
    const highlight = page.locator('.auto-review-highlight').first();
    await expect(highlight).toContainText('This are');
  });

  test('toolbar auto-review button is hidden when AI is disabled', async ({
    adminPage: page,
  }) => {
    // Use the admin fixture so we can toggle the config flag.
    const slug = `auto-review-toggled-${Date.now()}`;

    // Disable AI text via the admin config API.
    const apiUrl = process.env['API_BASE_URL'] ?? 'http://localhost:9333';
    const loginResponse = await page.request.post(
      `${apiUrl}/api/v1/auth/login`,
      { data: { username: 'e2e-admin', password: 'E2eAdminPassword123!' } }
    );
    const { token } = (await loginResponse.json()) as {
      token: string;
    };

    await page.request.put(`${apiUrl}/api/v1/admin/config/AI_TEXT_ENABLED`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { value: 'false' },
    });

    try {
      // Create project first (AI may still appear due to cached signal).
      await createProjectAndOpenEditor(page, slug);

      // Reload to force the SPA to re-fetch system features — the cached
      // signal still holds the previous `aiAutoReview: true` until then.
      await page.reload({ waitUntil: 'networkidle' });

      // Re-navigate to the README document since reload resets state.
      await page
        .getByTestId('element-README')
        .click()
        .catch(() => page.locator('[role="treeitem"]').first().click());

      await expect(page.getByTestId('document-editor')).toBeVisible();
      await expect(page.locator('.ProseMirror')).toBeVisible();

      // Toolbar button should now be hidden.
      await expect(page.getByTestId('toolbar-auto-review')).not.toBeVisible({
        timeout: 30_000,
      });
    } finally {
      // Restore the flag for subsequent tests.
      await page.request.put(`${apiUrl}/api/v1/admin/config/AI_TEXT_ENABLED`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { value: 'true' },
      });
    }
  });
});
