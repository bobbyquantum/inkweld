/**
 * Publishing Workflow Tests - Local Mode
 *
 * Tests that verify publishing documents to PDF, EPUB, Markdown, and HTML
 * work correctly in pure local mode without any server connection.
 */
import { expect, test } from './fixtures';

test.describe('Local Publishing Workflow', () => {
  /**
   * Helper to navigate to project home and create a publish plan
   */
  async function navigateToPublishPlan(
    page: import('@playwright/test').Page
  ): Promise<void> {
    // Click on the project card to open project
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Wait for project to load
    await expect(
      page.getByRole('heading', { name: 'Publish Plans' })
    ).toBeVisible();

    // Click the create publish plan button
    await page.getByTestId('create-publish-plan-button').click();

    // Wait for the publish plan tab to open
    await expect(page.getByTestId('publish-plan-container')).toBeVisible();
  }

  test.describe('Publish Plan Creation', () => {
    test('should show publish plans section on project home', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);

      // Should see the Publish Plans heading
      await expect(
        page.getByRole('heading', { name: 'Publish Plans' })
      ).toBeVisible();

      // Should see the create button
      await expect(
        page.getByTestId('create-publish-plan-button')
      ).toBeVisible();
    });

    test('should create a new publish plan', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Should see the publish plan container with default values
      await expect(page.getByTestId('plan-name-display')).toBeVisible();
    });

    test('should update plan metadata', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Update book title
      const titleInput = page.getByTestId('book-title-input');
      await titleInput.fill('My Awesome Book');

      // Update author
      const authorInput = page.getByTestId('author-input');
      await authorInput.fill('Test Author');

      // Should show save button when changes are made
      await expect(page.getByTestId('save-changes-button')).toBeVisible();
    });

    test('should show empty state when no content items', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Should show empty state
      await expect(page.getByTestId('empty-content-state')).toBeVisible();

      // Generate button should be disabled
      await expect(page.getByTestId('generate-button')).toBeDisabled();

      // Should show hint about adding content
      await expect(page.getByTestId('generate-hint')).toBeVisible();
    });
  });

  test.describe('Adding Content to Plan', () => {
    test('should add table of contents', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Click add TOC button
      await page.getByTestId('add-toc-button').click();

      // Should show in the items list
      await expect(page.getByTestId('content-items-list')).toBeVisible();
      // Verify the item has "Table of Contents" using the item name test id
      await expect(page.getByTestId('item-name')).toContainText(
        'Table of Contents'
      );
    });

    test('should remove content item', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Add TOC first
      await page.getByTestId('add-toc-button').click();
      await expect(page.getByTestId('content-items-list')).toBeVisible();

      // Remove it
      const removeButton = page
        .getByTestId('content-item-0')
        .getByTestId('remove-item-button');
      await removeButton.click();

      // Should show empty state again
      await expect(page.getByTestId('empty-content-state')).toBeVisible();
    });
  });

  test.describe('Format Selection', () => {
    test('should switch between PDF, EPUB, Markdown, and HTML formats', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      const formatSelect = page.getByTestId('format-select');
      await formatSelect.click();

      // Check that dropdown opened with format options using mat-option role
      const options = page.getByRole('option');
      await expect(options).toHaveCount(4);

      // Select EPUB (using role option)
      await page.getByRole('option', { name: 'EPUB (E-Book)' }).click();

      // Verify generate button shows the selected format
      await expect(page.getByTestId('generate-button')).toContainText('EPUB');
    });
  });

  test.describe('Publishing Generation', () => {
    test('should generate a publication and show complete dialog', async ({
      localPageWithProject: page,
    }) => {
      // Capture console errors
      const consoleErrors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });

      await navigateToPublishPlan(page);

      // Add TOC as content (always available)
      await page.getByTestId('add-toc-button').click();
      await expect(page.getByTestId('content-items-list')).toBeVisible();

      // Click generate
      await page.getByTestId('generate-button').click();

      // Should show "Generating..." button state
      await expect(page.getByTestId('generate-button-loading')).toBeVisible();

      // Wait for either the complete dialog or an error snackbar
      const dialogOrError = await Promise.race([
        page
          .getByTestId('publish-complete-dialog-title')
          .waitFor()
          .then(() => 'dialog'),
        page
          .locator('.mat-mdc-snack-bar-label')
          .filter({ hasText: /error/i })
          .waitFor()
          .then(() => 'error'),
        // Also wait for generate button to come back (indicates completion or error)
        page
          .getByTestId('generate-button')
          .waitFor()
          .then(() => 'button-back'),
      ]);

      if (dialogOrError === 'error') {
        const errorText = await page
          .locator('.mat-mdc-snack-bar-label')
          .textContent();
        throw new Error(
          `Publication generation failed with error: ${errorText}`
        );
      }

      if (dialogOrError === 'button-back') {
        // Check if there was an error snackbar
        const snackbar = page.locator('.mat-mdc-snack-bar-label');
        if (await snackbar.isVisible()) {
          const text = await snackbar.textContent();
          if (text?.toLowerCase().includes('error')) {
            throw new Error(`Publication generation failed: ${text}`);
          }
        }
        throw new Error(
          `Generation completed but dialog did not appear. Console errors: ${consoleErrors.join(', ')}`
        );
      }

      // Should show file info
      await expect(page.getByTestId('filename')).toBeVisible();
      await expect(page.getByTestId('format-name')).toBeVisible();
      await expect(page.getByTestId('file-size')).toBeVisible();

      // In local mode, should show local notice
      await expect(page.getByTestId('local-notice')).toBeVisible();
    });

    test('should allow downloading the generated file', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Add content and generate
      await page.getByTestId('add-toc-button').click();
      await page.getByTestId('generate-button').click();

      // Wait for complete dialog
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).toBeVisible();

      // Prepare to intercept download
      const downloadPromise = page.waitForEvent('download');

      // Click download button
      await page.getByTestId('download-button').click();

      // Wait for download to start
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('.epub'); // Default format is now EPUB
    });
  });

  test.describe('Saving and Discarding Changes', () => {
    test('should save changes to publish plan', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Make changes
      await page.getByTestId('book-title-input').fill('Updated Book Title');

      // Save changes
      await page.getByTestId('save-changes-button').click();

      // Save button should disappear after saving
      await expect(page.getByTestId('save-changes-button')).not.toBeVisible();

      // Reload the page
      await page.reload();

      // The publish plan tab should still be open after reload
      await expect(page.getByTestId('publish-plan-container')).toBeVisible();

      // Verify the saved value persisted
      await expect(page.getByTestId('book-title-input')).toHaveValue(
        'Updated Book Title'
      );
    });

    test('should discard changes when discard button clicked', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Get original value
      const originalTitle = await page
        .getByTestId('book-title-input')
        .inputValue();

      // Make changes
      await page.getByTestId('book-title-input').fill('Changed Title');

      // Discard changes
      await page.getByTestId('discard-changes-button').click();

      // Should revert to original value
      await expect(page.getByTestId('book-title-input')).toHaveValue(
        originalTitle
      );
    });
  });
});
