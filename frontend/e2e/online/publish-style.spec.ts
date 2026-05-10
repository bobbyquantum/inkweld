/**
 * Publish Style / Typography Tests - Online Mode
 *
 * Verifies the Style editor in the publish-plan tab:
 *   - Selecting a preset updates the current preset label and persists.
 *   - Tweaking a per-control value (heading 1 font size) clears the preset
 *     to "Custom" and persists across reload.
 *   - Toggling "Page break before chapter" persists.
 *   - The selected preset's typography is reflected in the generated HTML
 *     output (font tokens / heading sizes are emitted).
 */
import { promises as fs } from 'fs';

import { expect, test } from './fixtures';

test.describe('Online Publish Style Editor', () => {
  async function selectSection(
    page: import('@playwright/test').Page,
    section: string
  ): Promise<void> {
    await page.getByTestId(`nav-${section}`).click();
  }

  async function navigateToPublishingTab(
    page: import('@playwright/test').Page
  ): Promise<void> {
    await page.getByTestId('sidebar-publishing-button').click();
    await expect(
      page.getByTestId('publish-plans-list-container')
    ).toBeVisible();
  }

  async function createProject(
    page: import('@playwright/test').Page,
    titlePrefix: string
  ): Promise<string> {
    const uniqueSlug = `${titlePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/create-project');
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByTestId('project-title-input').fill(titlePrefix);
    await page.getByTestId('project-slug-input').fill(uniqueSlug);
    await page.getByTestId('create-project-button').click();
    await page.waitForURL(new RegExp(uniqueSlug));
    await page.waitForLoadState('networkidle');
    return uniqueSlug;
  }

  async function createPublishPlan(
    page: import('@playwright/test').Page
  ): Promise<void> {
    await navigateToPublishingTab(page);
    const createPlanButton = page.getByTestId('create-publish-plan-button');
    await expect(createPlanButton).toBeEnabled();
    await createPlanButton.click();
    await page.waitForURL(/\/publish-plan\//);
    await expect(page.getByTestId('plan-name-input')).toBeVisible();
  }

  async function openStyleEditor(
    page: import('@playwright/test').Page
  ): Promise<void> {
    await selectSection(page, 'formatting');
    const editor = page.getByTestId('publish-style-editor');
    await expect(editor).toBeVisible();
  }

  /**
   * Helper to choose a preset by id from the preset select.
   */
  async function selectPreset(
    page: import('@playwright/test').Page,
    presetId: string
  ): Promise<void> {
    await page.getByTestId('preset-select').click();
    await page.getByRole('option', { name: presetId, exact: false }).click();
    await expect(page.getByRole('listbox')).not.toBeVisible();
  }

  test('preset selection, override, persistence, and HTML output reflect styles', async ({
    authenticatedPage: page,
  }) => {
    const testContent =
      'A short paragraph used to verify rendered typography in the HTML output.';

    await createProject(page, 'pub-style');

    // Add a small amount of content so HTML generation has something to render.
    const readme = page.getByRole('treeitem', { name: /readme/i });
    await expect(readme).toBeVisible();
    await readme.click();
    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    await expect(page.locator('.sync-status')).toContainText('synced');
    await editor.click();
    await editor.pressSequentially(testContent, { delay: 5 });
    await expect(page.locator('.sync-status')).toContainText('synced');
    await page.waitForTimeout(2000);

    await createPublishPlan(page);

    // Add ToC content for HTML generation to walk.
    await selectSection(page, 'contents');
    await page.getByTestId('add-everything-button').click();
    await expect(page.getByTestId('content-items-list')).toBeVisible();

    await test.step('Style editor is visible inside the Style section', async () => {
      await openStyleEditor(page);
      await expect(page.getByTestId('preset-select')).toBeVisible();
      await expect(page.getByTestId('current-preset-label')).toBeVisible();
    });

    await test.step('Default preset is paperback', async () => {
      await expect(page.getByTestId('current-preset-label')).toHaveText(
        /paperback/i
      );
    });

    await test.step('Selecting Manuscript preset updates label', async () => {
      await selectPreset(page, 'Manuscript');
      await expect(page.getByTestId('current-preset-label')).toHaveText(
        /manuscript/i
      );
    });

    await test.step('Editing a control marks the preset as Custom', async () => {
      // Open the Heading 1 section then change its size.
      await page.getByTestId('section-node-heading1').click();
      const sizeInput = page.getByTestId('font-size-heading1');
      await expect(sizeInput).toBeVisible();
      await sizeInput.fill('42');
      await sizeInput.blur();
      await expect(page.getByTestId('current-preset-label')).toHaveText(
        /custom/i
      );
    });

    await test.step('Toggling chapter page-break persists the structural option', async () => {
      await page.getByTestId('section-chapter').click();
      const pageBreak = page
        .getByTestId('chapter-page-break')
        .locator('input[type="checkbox"]');
      const wasChecked = await pageBreak.isChecked();
      await page.getByTestId('chapter-page-break').click();
      await expect(pageBreak).toBeChecked({ checked: !wasChecked });
    });

    await test.step('Style edits persist across reload', async () => {
      await page.waitForTimeout(1000); // auto-save debounce
      await page.reload();
      await expect(page.getByTestId('publish-plan-container')).toBeVisible();
      await openStyleEditor(page);
      await expect(page.getByTestId('current-preset-label')).toHaveText(
        /custom/i
      );
      await page.getByTestId('section-node-heading1').click();
      await expect(page.getByTestId('font-size-heading1')).toHaveValue('42');
    });

    await test.step('Generated HTML reflects the customized styles', async () => {
      // Switch format to HTML and generate.
      await selectSection(page, 'metadata');
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'HTML' }).click();

      await selectSection(page, 'publish');
      await page.getByTestId('generate-button').click();
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible();

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      if (filePath) {
        const html = await fs.readFile(filePath, 'utf-8');
        // Should contain a <style> block with our heading-1 font-size override.
        expect(html).toContain('<style');
        // 42pt is what we set; emitter uses 'pt' units.
        expect(html).toMatch(/42pt/);
        // Typed paragraph content should round-trip into the HTML body.
        expect(html).toContain('rendered typography');
      }

      await page.getByTestId('done-button').click();
    });
  });

  /**
   * Regression coverage for the four publishing bugs fixed alongside the
   * typography customisation work:
   *
   *   1. Generators no longer auto-emit element name as an H1 — markdown
   *      output of a `# README` element starts with the user-authored
   *      heading exactly once, not twice.
   *   2. Paperback PDF compiles without the "expected 'a0'..." Typst page
   *      error — the success dialog is reachable end-to-end.
   *   3. Bundled fonts are wired through to HTML output — selecting the
   *      Book preset (which uses `serifBook` / EB Garamond) produces a
   *      `<style>` block that names the bundled family.
   *   4. "Add everything" surfaces worldbuilding-typed elements as proper
   *      WB renderings (not raw element bodies) in markdown output.
   *
   * One project + one publish plan is reused across format generations to
   * keep the test fast.
   */
  test('regression: bug fixes 1-4 carry through generated output', async ({
    authenticatedPage: page,
  }) => {
    // ---------- Setup: worldbuilding-demo template (has WB + chapters) ----
    const slug = `pub-regress-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await page.goto('/create-project');
    await page.waitForLoadState('networkidle');
    // Step 1: choose the worldbuilding-demo template, then advance.
    await page.getByTestId('template-worldbuilding-demo').click();
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByTestId('project-title-input').fill('pub-regress');
    await page.getByTestId('project-slug-input').fill(slug);
    await page.getByTestId('create-project-button').click();
    await page.waitForURL(new RegExp(slug));
    await page.waitForLoadState('networkidle');
    // Open the README element so the sync indicator is mounted, then wait
    // for the post-template sync to settle. The project landing page does
    // not render `.sync-status` until an editor is open.
    const readme = page.getByRole('treeitem', { name: /readme/i });
    await expect(readme).toBeVisible();
    await readme.click();
    await expect(page.locator('.ProseMirror').first()).toBeVisible();
    await expect(page.locator('.sync-status')).toContainText('synced');

    await createPublishPlan(page);

    // Add EVERYTHING — exercises bug fix #4 (WB elements rendered as WB)
    // and gives bugs #1-3 real chapters to walk.
    await selectSection(page, 'contents');
    await page.getByTestId('add-everything-button').click();
    await expect(page.getByTestId('content-items-list')).toBeVisible();

    // ---------- Bug #2: paperback PDF compiles ----------------------------
    await test.step('bug #2: paperback PDF compiles without Typst page error', async () => {
      await openStyleEditor(page);
      await selectPreset(page, 'Paperback');

      await selectSection(page, 'metadata');
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'PDF' }).click();

      await selectSection(page, 'publish');
      await page.getByTestId('generate-button').click();
      // Generation can take a while in CI for a non-trivial template.
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 60_000 });
      await page.getByTestId('done-button').click();
    });

    // ---------- Bugs #1, #3, #4: HTML + Markdown output assertions --------
    await test.step('bug #3: Book preset emits bundled EB Garamond in HTML <style>', async () => {
      await openStyleEditor(page);
      // Book preset wires base text to serifBook (EB Garamond).
      await selectPreset(page, 'Book');

      await selectSection(page, 'metadata');
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'HTML' }).click();

      await selectSection(page, 'publish');
      await page.getByTestId('generate-button').click();
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30_000 });

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      const html = await fs.readFile(filePath, 'utf-8');
      expect(html).toContain('<style');
      // The bundled family name must be present in the emitted CSS so
      // browsers actually load the woff2 we ship in /assets/fonts/.
      expect(html).toContain('EB Garamond');

      await page.getByTestId('done-button').click();
    });

    await test.step('bugs #1 + #4: markdown has no doubled H1 and renders WB entries', async () => {
      await selectSection(page, 'metadata');
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'Markdown' }).click();

      await selectSection(page, 'publish');
      await page.getByTestId('generate-button').click();
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30_000 });

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      const md = await fs.readFile(filePath, 'utf-8');

      // Bug #1 — "The Moonveil Accord" appears in body content (the
      // template's first document starts with that user-authored H1).
      // We assert it is NOT immediately repeated by an auto-emitted
      // element-name H1 above it.
      const moonveil = md.indexOf('The Moonveil Accord');
      expect(
        moonveil,
        'Expected user-authored H1 in markdown output'
      ).toBeGreaterThan(-1);
      // Count headings exactly equal to the title — prior to bug #1
      // there were two (auto-emitted element name, then in-doc H1).
      const exactHeadingMatches = md.match(/^# The Moonveil Accord$/gm) ?? [];
      expect(
        exactHeadingMatches.length,
        'Element name should not be auto-emitted as a duplicate H1'
      ).toBeLessThanOrEqual(1);

      // Bug #4 — worldbuilding entries from the demo template should
      // appear as titled WB blocks (not raw element bodies). The demo
      // ships WB items with category metadata; one such field name is
      // a stable substring across templates.
      // Heuristic: a WB rendering emits an entry header followed by
      // bullet rows. Check we have at least one bullet line — without
      // the WB renderer wired up, "Add everything" just inlined
      // element body text and produced no bullets at all.
      const bulletLines = md.match(/^[-*] /gm) ?? [];
      expect(
        bulletLines.length,
        'Expected WB entries to render as bulleted fields in markdown'
      ).toBeGreaterThan(0);

      await page.getByTestId('done-button').click();
    });
  });
});
