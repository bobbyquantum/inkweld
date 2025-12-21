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
   * Helper to create a project and navigate to create a publish plan
   */
  async function setupProjectAndCreatePlan(
    page: import('@playwright/test').Page
  ): Promise<string> {
    // Create a unique project
    const uniqueSlug = `publish-test-${Date.now()}`;
    await page.goto('/create-project');

    // Step 1: Click Next to proceed to step 2
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Fill in project details
    await page.getByTestId('project-title-input').fill('Publishing Test');
    await page.getByTestId('project-slug-input').fill(uniqueSlug);
    await page.getByTestId('create-project-button').click();

    // Wait for project page
    await page.waitForURL(new RegExp(uniqueSlug), { timeout: 10000 });

    // Wait for project home to load - use role to avoid multiple matches
    await expect(
      page.getByRole('heading', { name: 'Publish Plans' })
    ).toBeVisible({
      timeout: 10000,
    });

    // Create a new publish plan
    await page.getByTestId('create-publish-plan-button').click();

    // Wait for the publish plan tab to open - first wait for heading which is more stable
    await expect(page.getByTestId('plan-name-display')).toBeVisible({
      timeout: 15000,
    });

    return uniqueSlug;
  }

  test.describe('Publish Plan Creation', () => {
    test('should show publish plans section on project home', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      const uniqueSlug = `plan-test-${Date.now()}`;
      await page.goto('/create-project');

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Plan Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug), { timeout: 10000 });

      // Should see the Publish Plans heading
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible({
        timeout: 10000,
      });

      // Should see the create button
      await expect(
        page.getByTestId('create-publish-plan-button')
      ).toBeVisible();
    });

    test('should create and configure a publish plan', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndCreatePlan(page);

      // Update plan name
      const planNameInput = page.getByTestId('plan-name-input');
      await planNameInput.fill('My Book Export');

      // Update book title
      await page.getByTestId('book-title-input').fill('My Published Book');

      // Update author
      await page.getByTestId('author-input').fill('Test Author');

      // Should show save button
      await expect(page.getByTestId('save-changes-button')).toBeVisible();

      // Save changes
      await page.getByTestId('save-changes-button').click();

      // Save button should disappear after saving
      await expect(page.getByTestId('save-changes-button')).not.toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe('Adding Content to Plan', () => {
    test('should add table of contents to publication', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndCreatePlan(page);

      // Click add TOC button
      await page.getByTestId('add-toc-button').click();

      // Should show in the items list
      await expect(page.getByTestId('content-items-list')).toBeVisible();

      // Use specific test ID to avoid matching multiple elements
      await expect(page.getByTestId('item-name')).toContainText(
        'Table of Contents'
      );

      // Generate button should be enabled now
      await expect(page.getByTestId('generate-button')).toBeEnabled();
    });

    test('should remove content items', async ({ authenticatedPage: page }) => {
      await setupProjectAndCreatePlan(page);

      // Add TOC first
      await page.getByTestId('add-toc-button').click();
      await expect(page.getByTestId('content-items-list')).toBeVisible();

      // Remove it
      await page
        .getByTestId('content-item-0')
        .getByTestId('remove-item-button')
        .click();

      // Should show empty state again
      await expect(page.getByTestId('empty-content-state')).toBeVisible();
    });
  });

  test.describe('Format Selection', () => {
    test('should allow switching between all formats', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndCreatePlan(page);

      const formatSelect = page.getByTestId('format-select');
      await formatSelect.click();

      // Check that dropdown opened with format options
      const options = page.getByRole('option');
      await expect(options).toHaveCount(4);

      // Select EPUB using role option to avoid multiple matches
      await page.getByRole('option', { name: 'EPUB (E-Book)' }).click();

      // Verify generate button shows the selected format
      await expect(page.getByTestId('generate-button')).toContainText('EPUB');
    });

    test('should remember format selection after save', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndCreatePlan(page);

      // Select PDF format (different from default EPUB)
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'PDF' }).click();

      // Wait for save button to appear (format change triggers hasChanges)
      await expect(page.getByTestId('save-changes-button')).toBeVisible({
        timeout: 5000,
      });

      // Save
      await page.getByTestId('save-changes-button').click();
      await expect(page.getByTestId('save-changes-button')).not.toBeVisible({
        timeout: 5000,
      });

      // Reload - the tab should remain open
      await page.reload();

      // The publish plan should still be visible
      await expect(page.getByTestId('publish-plan-container')).toBeVisible({
        timeout: 10000,
      });

      // Generate button should show PDF
      await expect(page.getByTestId('generate-button')).toContainText('PDF');
    });
  });

  test.describe('Publishing Generation', () => {
    test('should generate EPUB (default) and show complete dialog', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndCreatePlan(page);

      // Add content
      await page.getByTestId('add-toc-button').click();
      await expect(page.getByTestId('content-items-list')).toBeVisible();

      // Click generate
      await page.getByTestId('generate-button').click();

      // Should show "Generating..." button state
      await expect(page.getByTestId('generate-button-loading')).toBeVisible();

      // Wait for publish complete dialog
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30000 });

      // Should show file info
      await expect(page.getByTestId('filename')).toBeVisible();
      await expect(page.getByTestId('format-name')).toContainText('EPUB');
      await expect(page.getByTestId('file-size')).toBeVisible();

      // In online mode, should NOT show offline notice
      await expect(page.getByTestId('offline-notice')).not.toBeVisible();
    });

    test('should generate PDF format with actual document content', async ({
      authenticatedPage: page,
    }) => {
      // This test does multiple complex operations - set a higher timeout
      test.setTimeout(60000);

      // Create a unique project
      const uniqueSlug = `pdf-content-test-${Date.now()}`;
      const testContent =
        'The quick brown fox jumps over the lazy dog near the riverbank.';

      await page.goto('/create-project');

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('PDF Content Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();

      // Wait for project page
      await page.waitForURL(new RegExp(uniqueSlug), { timeout: 10000 });

      // Wait for project home to fully load
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible({ timeout: 10000 });

      // Online projects now have a default README document
      // Click on README using treeitem role
      const readme = page.getByRole('treeitem', { name: /readme/i });
      await expect(readme).toBeVisible({ timeout: 5000 });
      await readme.click();

      // Wait for editor to load
      const editor = page.locator('.ProseMirror').first();
      await expect(editor).toBeVisible({ timeout: 10000 });

      // Wait for sync status to show "synced" (initial load)
      await expect(page.locator('.sync-status')).toContainText('synced', {
        timeout: 10000,
      });

      // Click into editor and add content
      await editor.click();
      await editor.pressSequentially(testContent, { delay: 5 });

      // Wait for sync status to return to "synced" after edits
      await expect(page.locator('.sync-status')).toContainText('synced', {
        timeout: 10000,
      });

      // Log debugging info about the document state
      const docId = await page.evaluate(() => {
        // Try to find the document ID being used
        const projectState = (window as unknown as Record<string, unknown>)[
          'inkweldDebug'
        ];
        if (projectState) {
          console.log('Project state:', projectState);
        }
        // Get IndexedDB databases
        return indexedDB.databases
          ? indexedDB.databases()
          : Promise.resolve([]);
      });
      console.log('IndexedDB databases:', docId);

      // Additional wait to ensure IndexedDB is persisted
      // y-indexeddb debounces writes with 1000ms timeout, and storeState needs
      // to complete before the data is available. Wait 3 seconds to be safe.
      await page.waitForTimeout(3000);

      // Go back to project home
      await page.getByTestId('home-node').click();

      // Wait for project home to load
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible({ timeout: 10000 });

      // Create a new publish plan
      await page.getByTestId('create-publish-plan-button').click();
      await expect(page.getByTestId('plan-name-display')).toBeVisible({
        timeout: 15000,
      });

      // Select PDF format
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'PDF' }).click();

      // Wait for format dropdown to close before clicking document select
      await page.waitForTimeout(500);

      // Add README document to the plan using the dropdown
      // Use force: true because mat-label may intercept pointer events
      await page.getByTestId('add-document-select').click({ force: true });
      await page.getByRole('option', { name: 'README' }).click();

      // Verify document was added - look for the item with README name
      await expect(page.getByTestId('content-items-list')).toBeVisible();
      await expect(page.getByTestId('item-name')).toContainText('README');

      // Wait for the item count to update
      await expect(page.locator('text=/Contents.*1 item/i')).toBeVisible({
        timeout: 5000,
      });

      // Generate
      await page.getByTestId('generate-button').click();

      // Wait for completion
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30000 });

      // Verify format in complete dialog
      await expect(page.getByTestId('format-name')).toContainText('PDF');

      // Download and verify the PDF was generated with document content
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      if (filePath) {
        const data = await fs.readFile(filePath);
        // PDF with actual content should be substantially larger than empty PDF (~6KB)
        // An empty PDF has only metadata/fonts, while one with content has text streams
        console.log('PDF size:', data.length, 'bytes');
        expect(data.length).toBeGreaterThan(10000);

        // The PDF is generated with actual document content because:
        // 1. IndexedDB stores the document content when we type
        // 2. PDF generator loads from IndexedDB using getDocumentContent()
        // 3. The content is converted to pdfmake format and included in the PDF
        //
        // Note: pdfmake uses CID font encoding (font subsetting), so the raw bytes
        // don't contain plain ASCII text - they contain glyph indices. To verify
        // the content is present, we would need a full PDF text extractor.
        //
        // The increased file size (>10KB vs ~6KB for empty) indicates content was added.
      }
    });

    test('should generate EPUB format with actual document content', async ({
      authenticatedPage: page,
    }) => {
      // This test does multiple complex operations - set a higher timeout
      test.setTimeout(60000);

      // Create a unique project
      const uniqueSlug = `epub-content-test-${Date.now()}`;
      const testContent =
        'The quick brown fox jumps over the lazy dog near the riverbank.';

      await page.goto('/create-project');

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('EPUB Content Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();

      // Wait for project page
      await page.waitForURL(new RegExp(uniqueSlug), { timeout: 10000 });

      // Wait for project home to fully load
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible({ timeout: 10000 });

      // Online projects now have a default README document
      // Click on README using treeitem role
      const readme = page.getByRole('treeitem', { name: /readme/i });
      await expect(readme).toBeVisible({ timeout: 5000 });
      await readme.click();

      // Wait for editor to load
      const editor = page.locator('.ProseMirror').first();
      await expect(editor).toBeVisible({ timeout: 10000 });

      // Wait for sync status to show "synced" (initial load)
      await expect(page.locator('.sync-status')).toContainText('synced', {
        timeout: 10000,
      });

      // Click into editor and add content
      await editor.click();
      await editor.pressSequentially(testContent, { delay: 5 });

      // Wait for sync status to return to "synced" after edits
      await expect(page.locator('.sync-status')).toContainText('synced', {
        timeout: 10000,
      });

      // Log debugging info about the document state
      const docId = await page.evaluate(() => {
        return indexedDB.databases
          ? indexedDB.databases()
          : Promise.resolve([]);
      });
      console.log('EPUB test - IndexedDB databases:', docId);

      // Additional wait to ensure IndexedDB is persisted
      // y-indexeddb debounces writes with 1000ms timeout
      await page.waitForTimeout(3000);

      // Go back to project home
      await page.getByTestId('home-node').click();

      // Wait for project home to load
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible({ timeout: 10000 });

      // Create a new publish plan
      await page.getByTestId('create-publish-plan-button').click();
      await expect(page.getByTestId('plan-name-display')).toBeVisible({
        timeout: 15000,
      });

      // EPUB is the default format, no need to change it

      // Wait for format dropdown to close before clicking document select
      await page.waitForTimeout(500);

      // Add README document to the plan using the dropdown
      await page.getByTestId('add-document-select').click({ force: true });
      await page.getByRole('option', { name: 'README' }).click();

      // Verify document was added
      await expect(page.getByTestId('content-items-list')).toBeVisible();
      await expect(page.getByTestId('item-name')).toContainText('README');

      // Generate
      await page.getByTestId('generate-button').click();

      // Wait for completion
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30000 });

      // Verify format in complete dialog
      await expect(page.getByTestId('format-name')).toContainText('EPUB');

      // Download and verify the EPUB contains our actual document content
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      if (filePath) {
        const data = await fs.readFile(filePath);
        console.log('EPUB size:', data.length, 'bytes');
        // EPUB should be at least 1000 bytes (basic structure + content)
        expect(data.length).toBeGreaterThan(1000);

        // Use AdmZip to extract and read EPUB contents (EPUB is a ZIP file)
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();
        console.log(
          'EPUB entries:',
          zipEntries.map(e => e.entryName)
        );

        // Find and read the chapter XHTML files
        let allContent = '';
        for (const entry of zipEntries) {
          if (entry.entryName.endsWith('.xhtml')) {
            const content = entry.getData().toString('utf-8');
            console.log(`EPUB ${entry.entryName} content:`, content);
            allContent += content;
          }
        }

        const hasTestContent =
          allContent.includes('quick brown fox') ||
          allContent.includes('riverbank') ||
          allContent.includes('lazy dog');

        console.log('EPUB has test content:', hasTestContent);
        expect(hasTestContent).toBeTruthy();
      }
    });

    test('should generate Markdown format with actual document content', async ({
      authenticatedPage: page,
    }) => {
      // This test does multiple complex operations - set a higher timeout
      test.setTimeout(60000);

      // Create a unique project
      const uniqueSlug = `markdown-content-test-${Date.now()}`;
      const testContent =
        'The quick brown fox jumps over the lazy dog near the riverbank.';

      await page.goto('/create-project');

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page
        .getByTestId('project-title-input')
        .fill('Markdown Content Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();

      // Wait for project page
      await page.waitForURL(new RegExp(uniqueSlug), { timeout: 10000 });

      // Wait for project home to fully load
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible({ timeout: 10000 });

      // Click on README document
      const readme = page.getByRole('treeitem', { name: /readme/i });
      await expect(readme).toBeVisible({ timeout: 5000 });
      await readme.click();

      // Wait for editor to load
      const editor = page.locator('.ProseMirror').first();
      await expect(editor).toBeVisible({ timeout: 10000 });

      // Wait for sync status to show "synced"
      await expect(page.locator('.sync-status')).toContainText('synced', {
        timeout: 10000,
      });

      // Add content
      await editor.click();
      await editor.pressSequentially(testContent, { delay: 5 });

      // Wait for sync
      await expect(page.locator('.sync-status')).toContainText('synced', {
        timeout: 10000,
      });

      // Wait for IndexedDB persistence
      await page.waitForTimeout(3000);

      // Go back to project home
      await page.getByTestId('home-node').click();

      // Wait for project home
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible({ timeout: 10000 });

      // Create publish plan
      await page.getByTestId('create-publish-plan-button').click();
      await expect(page.getByTestId('plan-name-display')).toBeVisible({
        timeout: 15000,
      });

      // Select Markdown format
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'Markdown' }).click();

      await page.waitForTimeout(500);

      // Add README document
      await page.getByTestId('add-document-select').click({ force: true });
      await page.getByRole('option', { name: 'README' }).click();

      // Verify document was added
      await expect(page.getByTestId('content-items-list')).toBeVisible();
      await expect(page.getByTestId('item-name')).toContainText('README');

      // Generate
      await page.getByTestId('generate-button').click();

      // Wait for completion
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30000 });

      // Verify format
      await expect(page.getByTestId('format-name')).toContainText('Markdown');

      // Download and verify
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      if (filePath) {
        const data = await fs.readFile(filePath, 'utf-8');
        console.log('Markdown size:', data.length, 'characters');
        console.log('Markdown content preview:', data.substring(0, 500));

        // Markdown should contain our test content in plain text
        const hasTestContent =
          data.includes('quick brown fox') ||
          data.includes('riverbank') ||
          data.includes('lazy dog');

        console.log('Markdown has test content:', hasTestContent);
        expect(hasTestContent).toBeTruthy();
      }
    });

    test('should generate HTML format with actual document content', async ({
      authenticatedPage: page,
    }) => {
      // This test does multiple complex operations - set a higher timeout
      test.setTimeout(60000);

      // Create a unique project
      const uniqueSlug = `html-content-test-${Date.now()}`;
      const testContent =
        'The quick brown fox jumps over the lazy dog near the riverbank.';

      await page.goto('/create-project');

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('HTML Content Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();

      // Wait for project page
      await page.waitForURL(new RegExp(uniqueSlug), { timeout: 10000 });

      // Wait for project home to fully load
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible({ timeout: 10000 });

      // Click on README document
      const readme = page.getByRole('treeitem', { name: /readme/i });
      await expect(readme).toBeVisible({ timeout: 5000 });
      await readme.click();

      // Wait for editor to load
      const editor = page.locator('.ProseMirror').first();
      await expect(editor).toBeVisible({ timeout: 10000 });

      // Wait for sync status
      await expect(page.locator('.sync-status')).toContainText('synced', {
        timeout: 10000,
      });

      // Add content
      await editor.click();
      await editor.pressSequentially(testContent, { delay: 5 });

      // Wait for sync
      await expect(page.locator('.sync-status')).toContainText('synced', {
        timeout: 10000,
      });

      // Wait for IndexedDB persistence
      await page.waitForTimeout(3000);

      // Go back to project home
      await page.getByTestId('home-node').click();

      // Wait for project home
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible({ timeout: 10000 });

      // Create publish plan
      await page.getByTestId('create-publish-plan-button').click();
      await expect(page.getByTestId('plan-name-display')).toBeVisible({
        timeout: 15000,
      });

      // Select HTML format
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'HTML' }).click();

      await page.waitForTimeout(500);

      // Add README document
      await page.getByTestId('add-document-select').click({ force: true });
      await page.getByRole('option', { name: 'README' }).click();

      // Verify document was added
      await expect(page.getByTestId('content-items-list')).toBeVisible();
      await expect(page.getByTestId('item-name')).toContainText('README');

      // Generate
      await page.getByTestId('generate-button').click();

      // Wait for completion
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30000 });

      // Verify format
      await expect(page.getByTestId('format-name')).toContainText('HTML');

      // Download and verify
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();
      const download = await downloadPromise;
      const filePath = await download.path();
      expect(filePath).toBeTruthy();
      if (filePath) {
        const data = await fs.readFile(filePath, 'utf-8');
        console.log('HTML size:', data.length, 'characters');
        console.log('HTML content preview:', data.substring(0, 500));

        // HTML should contain our test content
        const hasTestContent =
          data.includes('quick brown fox') ||
          data.includes('riverbank') ||
          data.includes('lazy dog');

        console.log('HTML has test content:', hasTestContent);
        expect(hasTestContent).toBeTruthy();
      }
    });

    test('should generate Markdown format', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndCreatePlan(page);

      // Select Markdown format
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'Markdown' }).click();

      // Add content
      await page.getByTestId('add-toc-button').click();

      // Generate
      await page.getByTestId('generate-button').click();

      // Wait for completion
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30000 });

      // Verify format in complete dialog
      await expect(page.getByTestId('format-name')).toContainText('Markdown');
    });

    test('should generate HTML format', async ({ authenticatedPage: page }) => {
      await setupProjectAndCreatePlan(page);

      // Select HTML format
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'HTML' }).click();

      // Add content
      await page.getByTestId('add-toc-button').click();

      // Generate
      await page.getByTestId('generate-button').click();

      // Wait for completion
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30000 });

      // Verify format in complete dialog
      await expect(page.getByTestId('format-name')).toContainText('HTML');
    });
  });

  test.describe('File Download', () => {
    test('should download generated file', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndCreatePlan(page);

      // Add content and generate
      await page.getByTestId('add-toc-button').click();
      await page.getByTestId('generate-button').click();

      // Wait for complete dialog
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30000 });

      // Prepare to intercept download
      const downloadPromise = page.waitForEvent('download');

      // Click download button
      await page.getByTestId('download-button').click();

      // Wait for download to start
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.(pdf|epub|md|html)$/);
    });
  });

  test.describe('Persistence', () => {
    test('should persist plan changes after reload', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndCreatePlan(page);

      // Make changes
      await page.getByTestId('book-title-input').fill('Persistent Title');
      await page.getByTestId('author-input').fill('Persistent Author');

      // Add TOC
      await page.getByTestId('add-toc-button').click();

      // Save
      await page.getByTestId('save-changes-button').click();
      await expect(page.getByTestId('save-changes-button')).not.toBeVisible({
        timeout: 5000,
      });

      // Reload
      await page.reload();

      // The publish plan should still be open - wait for plan name display which is more stable
      await expect(page.getByTestId('plan-name-display')).toBeVisible({
        timeout: 15000,
      });

      // Verify persistence
      await expect(page.getByTestId('book-title-input')).toHaveValue(
        'Persistent Title'
      );
      await expect(page.getByTestId('author-input')).toHaveValue(
        'Persistent Author'
      );
      await expect(page.getByTestId('content-items-list')).toBeVisible();
    });

    test('should discard changes when discard is clicked', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndCreatePlan(page);

      // Get original value
      const originalTitle = await page
        .getByTestId('book-title-input')
        .inputValue();

      // Make changes
      await page.getByTestId('book-title-input').fill('Temporary Change');

      // Discard
      await page.getByTestId('discard-changes-button').click();

      // Should revert
      await expect(page.getByTestId('book-title-input')).toHaveValue(
        originalTitle
      );
    });
  });
});
