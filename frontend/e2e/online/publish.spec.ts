/**
 * Publishing Workflow Tests - Online Mode
 *
 * Tests that verify publishing documents to PDF, EPUB, Markdown, and HTML
 * work correctly in server mode with the real backend, including
 * file sharing capabilities.
 */
import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';

import { expect, test } from './fixtures';

test.describe('Online Publishing Workflow', () => {
  /**
   * Helper to navigate to a section within the publish plan sidenav
   */
  async function selectSection(
    page: import('@playwright/test').Page,
    section: string
  ): Promise<void> {
    await page.getByTestId(`nav-${section}`).click();
  }

  /**
   * Helper to navigate to the Publishing list tab via sidenav
   */
  async function navigateToPublishingTab(
    page: import('@playwright/test').Page
  ): Promise<void> {
    await page.getByTestId('sidebar-publishing-button').click();
    await expect(
      page.getByTestId('publish-plans-list-container')
    ).toBeVisible();
  }

  /**
   * Helper to create a project. Returns the unique slug.
   */
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

  /**
   * Helper to open Publishing tab and create a new publish plan.
   */
  async function createPublishPlan(
    page: import('@playwright/test').Page
  ): Promise<void> {
    await navigateToPublishingTab(page);
    const createPlanButton = page.getByTestId('create-publish-plan-button');
    await expect(createPlanButton).toBeVisible();
    await expect(createPlanButton).toBeEnabled();
    await createPlanButton.click();
    await page.waitForURL(/\/publish-plan\//);
    await expect(page.getByTestId('plan-name-input')).toBeVisible();
  }

  /**
   * Helper to select a format from the format dropdown. The format select
   * lives in the Metadata section, so navigate there first.
   */
  async function selectFormat(
    page: import('@playwright/test').Page,
    optionName: RegExp | string
  ): Promise<void> {
    await selectSection(page, 'metadata');
    await expect(page.getByTestId('format-select')).toBeVisible();
    await page.getByTestId('format-select').click();
    await page.getByRole('option', { name: optionName }).click();
    await expect(page.getByRole('listbox')).not.toBeVisible();
  }

  /**
   * Helper to generate the publication and wait for the complete dialog.
   */
  async function generateAndOpenDialog(
    page: import('@playwright/test').Page
  ): Promise<void> {
    await selectSection(page, 'publish');
    await page.getByTestId('generate-button').click();
    await expect(
      page.getByTestId('publish-complete-dialog-title')
    ).toBeVisible();
  }

  /**
   * Helper to close the publish-complete dialog so the next step can run.
   */
  async function closeCompleteDialog(
    page: import('@playwright/test').Page
  ): Promise<void> {
    await page.getByTestId('done-button').click();
    await expect(
      page.getByTestId('publish-complete-dialog-title')
    ).not.toBeVisible();
  }

  /**
   * Plan-management workflow: covers sidenav navigation, plan creation/config,
   * format selection + persistence, content add/remove, generation against an
   * empty document, file download, and persistence across reload — all on a
   * single project + plan to amortize setup cost.
   */
  test('plan management, format selection, content editing, and persistence', async ({
    authenticatedPage: page,
  }) => {
    await createProject(page, 'plan-mgmt');

    await test.step('shows publishing tab via sidenav button', async () => {
      await navigateToPublishingTab(page);
      await expect(
        page.getByTestId('create-publish-plan-button')
      ).toBeVisible();
    });

    await test.step('creates and configures a publish plan', async () => {
      const createPlanButton = page.getByTestId('create-publish-plan-button');
      await expect(createPlanButton).toBeEnabled();
      await createPlanButton.click();
      await page.waitForURL(/\/publish-plan\//);
      await expect(page.getByTestId('plan-name-input')).toBeVisible();

      await page.getByTestId('plan-name-input').fill('My Book Export');
      await page.getByTestId('book-title-input').fill('My Published Book');
      await page.getByTestId('author-input').fill('Test Author');
    });

    await test.step('switches between all formats', async () => {
      await page.getByTestId('format-select').click();
      await expect(page.getByRole('option')).toHaveCount(4);
      await page.getByRole('option', { name: 'EPUB (E-Book)' }).click();
      await selectSection(page, 'publish');
      await expect(page.getByTestId('generate-button')).toContainText('EPUB');
    });

    await test.step('adds table of contents and removes items', async () => {
      await selectSection(page, 'contents');
      await page.getByTestId('add-everything-button').click();
      await expect(page.getByTestId('content-items-list')).toBeVisible();
      await expect(page.getByTestId('content-item-0')).toBeVisible();

      await selectSection(page, 'publish');
      await expect(page.getByTestId('generate-button')).toBeEnabled();

      // Remove item, verify empty state
      await selectSection(page, 'contents');
      await page
        .getByTestId('content-item-0')
        .getByTestId('remove-item-button')
        .click();
      await expect(page.getByTestId('empty-content-state')).toBeVisible();

      // Re-add for downstream steps
      await page.getByTestId('add-everything-button').click();
      await expect(page.getByTestId('content-items-list')).toBeVisible();
    });

    await test.step('generates EPUB (default), shows complete dialog and downloads file', async () => {
      await generateAndOpenDialog(page);

      await expect(page.getByTestId('filename')).toBeVisible();
      await expect(page.getByTestId('format-name')).toContainText('EPUB');
      await expect(page.getByTestId('file-size')).toBeVisible();
      // Online mode should NOT show offline notice
      await expect(page.getByTestId('local-notice')).not.toBeVisible();

      // Download check (covers the standalone "should download generated file"
      // test — the suggested filename pattern verifies generation worked)
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.(pdf|epub|md|html)$/);

      await closeCompleteDialog(page);
    });

    await test.step('persists format selection (PDF) across reload', async () => {
      await selectFormat(page, 'PDF');
      // Auto-save debounce
      await page.waitForTimeout(1000);

      await page.reload();
      await expect(page.getByTestId('publish-plan-container')).toBeVisible();
      await selectSection(page, 'publish');
      await expect(page.getByTestId('generate-button')).toContainText('PDF');
    });

    await test.step('persists plan field changes and content items across reload', async () => {
      await selectSection(page, 'metadata');
      await page.getByTestId('book-title-input').fill('Persistent Title');
      await page.getByTestId('author-input').fill('Persistent Author');

      // Content was already added earlier and should still be present.
      await selectSection(page, 'contents');
      await expect(page.getByTestId('content-items-list')).toBeVisible();

      // Auto-save debounce
      await page.waitForTimeout(1000);

      await page.reload();
      await expect(page.getByTestId('plan-name-input')).toBeVisible();
      await selectSection(page, 'metadata');
      await expect(page.getByTestId('book-title-input')).toHaveValue(
        'Persistent Title'
      );
      await expect(page.getByTestId('author-input')).toHaveValue(
        'Persistent Author'
      );
      await selectSection(page, 'contents');
      await expect(page.getByTestId('content-items-list')).toBeVisible();
    });
  });

  /**
   * Format generation with real document content. Types README content ONCE
   * and then re-uses the same publish plan to generate each format,
   * switching the format setting between steps. This collapses four
   * previously-independent tests (PDF/EPUB/Markdown/HTML content) plus the
   * redundant "no-content" Markdown/HTML format tests into a single flow.
   */
  test('generates PDF, EPUB, Markdown, and HTML with real document content', async ({
    authenticatedPage: page,
  }) => {
    const testContent =
      'The quick brown fox jumps over the lazy dog near the riverbank.';

    await createProject(page, 'format-content');

    // Add real content to the README so all formats have something to render.
    const readme = page.getByRole('treeitem', { name: /readme/i });
    await expect(readme).toBeVisible();
    await readme.click();

    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    await expect(page.locator('.sync-status')).toContainText('synced');

    await editor.click();
    await editor.pressSequentially(testContent, { delay: 5 });
    await expect(page.locator('.sync-status')).toContainText('synced');

    // y-indexeddb debounces writes ~1s; storeState needs to complete before
    // PDF generation can read the document. Pad to be safe.
    await page.waitForTimeout(3000);

    await createPublishPlan(page);

    await selectSection(page, 'contents');
    await page.getByTestId('add-everything-button').click();
    await expect(page.getByTestId('content-items-list')).toBeVisible();
    await expect(page.getByTestId('item-name')).toContainText('README');

    await test.step('PDF: generates and download is non-trivial size', async () => {
      await selectFormat(page, 'PDF');
      await generateAndOpenDialog(page);
      await expect(page.getByTestId('format-name')).toContainText('PDF');

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      if (filePath) {
        const data = await fs.readFile(filePath);
        // Empty PDF is ~6KB; a PDF with content is substantially larger.
        // jsPDF encodes glyph indices, so we can't grep raw bytes for text.
        expect(data.length).toBeGreaterThan(10000);
      }

      await closeCompleteDialog(page);
    });

    await test.step('EPUB: generates and chapter XHTML contains the typed content', async () => {
      await selectFormat(page, 'EPUB (E-Book)');
      await generateAndOpenDialog(page);
      await expect(page.getByTestId('format-name')).toContainText('EPUB');

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      if (filePath) {
        const data = await fs.readFile(filePath);
        expect(data.length).toBeGreaterThan(1000);

        const zip = new AdmZip(filePath);
        let allContent = '';
        for (const entry of zip.getEntries()) {
          if (entry.entryName.endsWith('.xhtml')) {
            allContent += entry.getData().toString('utf-8');
          }
        }
        const hasTestContent =
          allContent.includes('quick brown fox') ||
          allContent.includes('riverbank') ||
          allContent.includes('lazy dog');
        expect(hasTestContent).toBeTruthy();
      }

      await closeCompleteDialog(page);
    });

    await test.step('Markdown: generates and file contains plain-text content', async () => {
      await selectFormat(page, 'Markdown');
      await generateAndOpenDialog(page);
      await expect(page.getByTestId('format-name')).toContainText('Markdown');

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      if (filePath) {
        const data = await fs.readFile(filePath, 'utf-8');
        const hasTestContent =
          data.includes('quick brown fox') ||
          data.includes('riverbank') ||
          data.includes('lazy dog');
        expect(hasTestContent).toBeTruthy();
      }

      await closeCompleteDialog(page);
    });

    await test.step('HTML: generates and file contains content', async () => {
      await selectFormat(page, 'HTML');
      await generateAndOpenDialog(page);
      await expect(page.getByTestId('format-name')).toContainText('HTML');

      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      if (filePath) {
        const data = await fs.readFile(filePath, 'utf-8');
        const hasTestContent =
          data.includes('quick brown fox') ||
          data.includes('riverbank') ||
          data.includes('lazy dog');
        expect(hasTestContent).toBeTruthy();
      }

      await closeCompleteDialog(page);
    });
  });
});
