/**
 * AI Grammar/Lint E2E Tests — Online Mode
 *
 * Exercises the lint plugin end-to-end against the real backend, faking only
 * the OpenAI lint responses (the backend has a fake OPENAI_API_KEY from the
 * global setup, so `aiLinting` is enabled in /config/features, but the actual
 * model call would fail). Playwright `page.route` intercepts the lint API and
 * returns canned corrections so the full plugin pipeline — per-paragraph
 * linting, doc-position mapping, decorations, floating menu, accept/reject —
 * runs for real in the browser.
 *
 * Covers:
 * - Lint decorations appear for a flagged word on load and after edits
 * - Floating menu shows the suggestion when the cursor is in a decoration
 * - Accepting a correction replaces the flagged text
 * - Rejecting a correction removes the decoration
 */

import { expect, type Page, type Route } from '@playwright/test';

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
  // Override navigator.platform so ProseMirror maps Mod- to Ctrl.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'platform', {
      get: () => 'Linux x86_64',
    });
  });

  await page.goto('/create-project');

  const nextButton = page.getByRole('button', { name: /next/i });
  await nextButton.waitFor();
  await nextButton.click();

  await page.getByTestId('project-title-input').fill('Lint Test');
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
 * Intercept lint API calls and return a canned correction for the first
 * occurrence of `flaggedWord` in the request paragraph, suggesting
 * `correctionWord`.
 *
 * Returns a cleanup function to unroute the interception.
 */
async function interceptLint(
  page: Page,
  flaggedWord: string,
  correctionWord: string
): Promise<() => Promise<void>> {
  const handler = async (route: Route) => {
    const request = route.request();
    let paragraph = '';
    try {
      const body = (await request.postDataJSON()) as { paragraph?: string };
      paragraph = body.paragraph ?? '';
    } catch {
      paragraph = '';
    }

    const start = paragraph.indexOf(flaggedWord);
    const corrections =
      start >= 0
        ? [
            {
              startPos: start,
              endPos: start + flaggedWord.length,
              originalText: flaggedWord,
              correctedText: correctionWord,
              errorType: 'spelling',
              recommendation: `Replace "${flaggedWord}" with "${correctionWord}"`,
            },
          ]
        : [];

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        originalParagraph: paragraph,
        corrections,
        styleRecommendations: [],
        source: 'openai',
      }),
    });
  };

  await page.route('**/api/v1/ai/lint', handler);

  return async () => {
    await page.unroute('**/api/v1/ai/lint', handler);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('AI Grammar/Lint — Online Mode', () => {
  test.describe.configure({ timeout: 90_000 });

  test('lint decoration, floating menu, accept, and reject', async ({
    authenticatedPage: page,
  }) => {
    const slug = `lint-${Date.now()}`;
    const flagged = 'teh';
    const correction = 'the';

    // Set up the fake lint response before navigating.
    const unroute = await interceptLint(page, flagged, correction);

    await createProjectAndOpenEditor(page, slug);

    // Replace the README content with a known sentence containing the error.
    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
    await editor.fill(`This is ${flagged} test sentence.`);

    // Wait for the debounced lint cycle to fire and render the decoration.
    const decoration = page.locator('.lint-error').first();
    await expect(decoration).toBeVisible({ timeout: 15_000 });
    await expect(decoration).toContainText(flagged);

    await test.step('floating menu shows the suggestion', async () => {
      // Place the cursor inside the flagged word to trigger the menu.
      await decoration.click();

      const menu = page.locator('.lint-floating-menu');
      await expect(menu).toBeVisible({ timeout: 10_000 });
      await expect(menu.locator('.lint-tooltip-title')).toContainText(
        correction
      );
    });

    await test.step('accepting replaces the flagged text', async () => {
      await page.locator('.lint-floating-menu .lint-accept-button').click();

      // The flagged word should be gone, replaced by the correction.
      await expect(editor).toContainText(correction);
      await expect(editor).not.toContainText(flagged);
      await expect(page.locator('.lint-error')).toHaveCount(0);
    });

    await unroute();
  });

  test('rejecting a suggestion removes the decoration', async ({
    authenticatedPage: page,
  }) => {
    const slug = `lint-reject-${Date.now()}`;
    const flagged = 'recieve';
    const correction = 'receive';

    const unroute = await interceptLint(page, flagged, correction);

    await createProjectAndOpenEditor(page, slug);

    const editor = page.locator('.ProseMirror');
    await expect(editor).toBeVisible();
    await editor.fill(`Please ${flagged} the package.`);

    const decoration = page.locator('.lint-error').first();
    await expect(decoration).toBeVisible({ timeout: 15_000 });

    // Place the cursor inside the flagged word and reject it.
    await decoration.click();
    const menu = page.locator('.lint-floating-menu');
    await expect(menu).toBeVisible({ timeout: 10_000 });

    await page.locator('.lint-floating-menu .lint-reject-button').click();

    // The decoration should be removed; the text itself stays unchanged.
    await expect(page.locator('.lint-error')).toHaveCount(0);
    await expect(editor).toContainText(flagged);

    await unroute();
  });
});