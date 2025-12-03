/**
 * Publishing Workflow Tests - Online Mode
 *
 * Tests that verify publishing documents to PDF, EPUB, Markdown, and HTML
 * work correctly in server mode with the real backend, including
 * file sharing capabilities.
 */
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

    test('should generate PDF format', async ({ authenticatedPage: page }) => {
      await setupProjectAndCreatePlan(page);

      // Select PDF format
      await page.getByTestId('format-select').click();
      await page.getByRole('option', { name: 'PDF' }).click();

      // Add content
      await page.getByTestId('add-toc-button').click();

      // Generate
      await page.getByTestId('generate-button').click();

      // Wait for completion
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible({ timeout: 30000 });

      // Verify format in complete dialog
      await expect(page.getByTestId('format-name')).toContainText('PDF');
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
