/**
 * Publishing Workflow Tests - Local Mode
 *
 * Tests that verify publishing documents to PDF, EPUB, Markdown, and HTML
 * work correctly in pure local mode without any server connection.
 */
import { expect, test } from './fixtures';

test.describe('Local Publishing Workflow', () => {
  /**
   * Helper to navigate to the Publishing tab via sidenav
   */
  async function navigateToPublishingTab(
    page: import('@playwright/test').Page
  ): Promise<void> {
    // Extract the project base path (e.g., /testuser/test-project)
    const url = new URL(page.url());
    const pathSegments = url.pathname.split('/').filter(Boolean);
    // Navigate directly to the publish-plans route
    await page.goto(`/${pathSegments[0]}/${pathSegments[1]}/publish-plans`);
    await expect(
      page.getByTestId('publish-plans-list-container')
    ).toBeVisible();
  }

  /**
   * Helper to select a section in the publish plan sidenav
   */
  async function selectSection(
    page: import('@playwright/test').Page,
    section: string
  ): Promise<void> {
    await page.getByTestId(`nav-${section}`).click();
  }

  /**
   * Helper to create a document element in the project tree
   */
  async function createDocumentElement(
    page: import('@playwright/test').Page,
    name: string
  ): Promise<void> {
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-item').click();
    const nameInput = page.getByTestId('element-name-input');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill(name);
    await page.getByTestId('create-element-button').click();
    await expect(page.getByTestId(`element-${name}`)).toBeVisible();
  }

  /**
   * Helper to navigate to project home and create a publish plan
   */
  async function navigateToPublishPlan(
    page: import('@playwright/test').Page
  ): Promise<void> {
    // Click on the project card to open project
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Navigate to Publishing tab via sidenav
    await navigateToPublishingTab(page);

    // Click the create publish plan button
    await page.getByTestId('create-publish-plan-button').click();

    // Wait for the publish plan tab to open
    await expect(page.getByTestId('publish-plan-container')).toBeVisible();
  }

  /**
   * Helper to create a publish plan with a document available for content.
   * Creates a document element first, then opens a publish plan.
   */
  async function navigateToPublishPlanWithContent(
    page: import('@playwright/test').Page,
    docName = 'TestDoc'
  ): Promise<void> {
    // Click on the project card to open project
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Create a document element so "add everything" is available
    await createDocumentElement(page, docName);

    // Navigate to Publishing tab via sidenav
    await navigateToPublishingTab(page);

    // Click the create publish plan button
    await page.getByTestId('create-publish-plan-button').click();

    // Wait for the publish plan tab to open
    await expect(page.getByTestId('publish-plan-container')).toBeVisible();
  }

  test.describe('Publish Plan Creation', () => {
    test('should show publishing tab via sidenav button', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);

      // Navigate to Publishing tab
      await navigateToPublishingTab(page);

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
      await expect(page.getByTestId('plan-name-input')).toBeVisible();
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
    });

    test('should show empty state when no content items', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Navigate to Contents section to check empty state
      await selectSection(page, 'contents');
      await expect(page.getByTestId('empty-content-state')).toBeVisible();

      // Navigate to Publish section for generate button state
      await selectSection(page, 'publish');
      await expect(page.getByTestId('generate-button')).toBeDisabled();
      await expect(page.getByTestId('generate-hint')).toBeVisible();
    });
  });

  test.describe('Adding Content to Plan', () => {
    test('should add content via add everything button', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlanWithContent(page);

      // Navigate to Contents section
      await selectSection(page, 'contents');

      // Click add everything button
      await page.getByTestId('add-everything-button').click();

      // Should show items in the list (may include default README)
      await expect(page.getByTestId('content-items-list')).toBeVisible();
      await expect(page.getByTestId('content-item-0')).toBeVisible();
    });

    test('should remove content item', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlanWithContent(page);

      // Navigate to Contents section and add content
      await selectSection(page, 'contents');
      await page.getByTestId('add-everything-button').click();
      await expect(page.getByTestId('content-items-list')).toBeVisible();

      // Remove all items until empty
      while (await page.getByTestId('remove-item-button').first().isVisible()) {
        await page.getByTestId('remove-item-button').first().click();
        // Wait for Angular to process the removal
        await page.waitForTimeout(300);
      }

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

      // Navigate to Publish section and verify generate button shows the selected format
      await selectSection(page, 'publish');
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

      await navigateToPublishPlanWithContent(page);

      // Navigate to Contents section and add content
      await selectSection(page, 'contents');
      await page.getByTestId('add-everything-button').click();
      await expect(page.getByTestId('content-items-list')).toBeVisible();

      // Navigate to Publish section and click generate
      await selectSection(page, 'publish');
      await page.getByTestId('generate-button').click();

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
          .first()
          .textContent();
        throw new Error(
          `Publication generation failed with error: ${errorText}`
        );
      }

      if (dialogOrError === 'button-back') {
        // Check if there was an error snackbar
        const snackbar = page.locator('.mat-mdc-snack-bar-label').first();
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
      await navigateToPublishPlanWithContent(page);

      // Add content in Contents section
      await selectSection(page, 'contents');
      await page.getByTestId('add-everything-button').click();

      // Navigate to Publish section and generate
      await selectSection(page, 'publish');
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

  test.describe('Saving Changes', () => {
    test('should auto-save changes to publish plan', async ({
      localPageWithProject: page,
    }) => {
      await navigateToPublishPlan(page);

      // Make changes
      await page.getByTestId('book-title-input').fill('Updated Book Title');

      // Auto-save debounce — wait for save to complete
      await page.waitForTimeout(1000);

      // Reload the page
      await page.reload();

      // The publish plan tab should still be open after reload
      await expect(page.getByTestId('publish-plan-container')).toBeVisible();

      // Verify the saved value persisted
      await expect(page.getByTestId('book-title-input')).toHaveValue(
        'Updated Book Title'
      );
    });
  });

  test.describe('Drag from Project Tree to Publish Plan', () => {
    /**
     * Helper: create a folder element in the project tree.
     */
    async function createFolderElement(
      page: import('@playwright/test').Page,
      name: string
    ): Promise<void> {
      await page.getByTestId('create-new-element').click();
      await page.getByTestId('element-type-folder').click();
      const nameInput = page.getByTestId('element-name-input');
      await nameInput.waitFor({ state: 'visible' });
      await nameInput.fill(name);
      await page.getByTestId('create-element-button').click();
      await expect(page.getByTestId(`element-${name}`)).toBeVisible();
    }

    /**
     * Helper: perform a CDK-compatible drag using mouse events.
     * Angular CDK uses pointer/mouse events, not HTML5 drag events,
     * so Playwright's dragTo() doesn't work. Uses deliberate timing
     * to ensure CDK processes each phase through requestAnimationFrame.
     */
    async function cdkDragTo(
      page: import('@playwright/test').Page,
      source: import('@playwright/test').Locator,
      target: import('@playwright/test').Locator
    ): Promise<void> {
      // Ensure both elements are scrolled into view
      await source.scrollIntoViewIfNeeded();
      await target.scrollIntoViewIfNeeded();

      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      if (!sourceBox || !targetBox) {
        throw new Error('Could not get bounding boxes for drag operation');
      }

      const srcX = sourceBox.x + sourceBox.width / 2;
      const srcY = sourceBox.y + sourceBox.height / 2;
      const tgtX = targetBox.x + targetBox.width / 2;
      const tgtY = targetBox.y + targetBox.height / 2;

      // 1. Hover over source to ensure CDK registers the element
      await page.mouse.move(srcX, srcY);
      await page.waitForTimeout(200);

      // 2. Press and hold on source
      await page.mouse.down();
      await page.waitForTimeout(200);

      // 3. Move past CDK's 5px drag-start threshold slowly
      for (let i = 1; i <= 5; i++) {
        await page.mouse.move(srcX + i * 4, srcY, { steps: 2 });
        await page.waitForTimeout(50);
      }

      // 4. Wait for CDK to create the drag preview
      await page.waitForTimeout(300);

      // 5. Move toward the target in many small steps
      await page.mouse.move(tgtX, tgtY, { steps: 30 });

      // 6. Hover over target to let CDK detect entry into the drop list
      await page.waitForTimeout(500);

      // 7. Drop
      await page.mouse.up();
      await page.waitForTimeout(200);
    }

    /**
     * Helper: navigate into the project, create a document, then open a publish plan.
     */
    async function setupProjectWithDocAndPlan(
      page: import('@playwright/test').Page,
      docName: string
    ): Promise<void> {
      // Open the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);

      // Create a document element
      await createDocumentElement(page, docName);

      // Go home and navigate to publish plan
      await navigateToPublishingTab(page);
      await page.getByTestId('create-publish-plan-button').click();
      await expect(page.getByTestId('publish-plan-container')).toBeVisible();

      // Select Contents section so the drop target is visible
      await selectSection(page, 'contents');
    }

    test('should add document to publish plan by dragging from project tree', async ({
      localPageWithProject: page,
    }) => {
      const docName = 'DragTestDoc';
      await setupProjectWithDocAndPlan(page, docName);

      // The tree element and the publish plan drop list should both be visible
      const treeItem = page.getByTestId(`element-${docName}`);
      await expect(treeItem).toBeVisible();

      const dropTarget = page.getByTestId('content-items-list');
      await expect(dropTarget).toBeVisible();

      // Drag the tree item onto the publish plan items list using CDK-compatible mouse events
      await cdkDragTo(page, treeItem, dropTarget);

      // Verify the document was added to the plan
      await expect(page.getByTestId('content-item-0')).toBeVisible();
      await expect(
        page.getByTestId('content-item-0').getByTestId('item-name')
      ).toContainText(docName);
    });

    test('should not allow dragging folder into publish plan', async ({
      localPageWithProject: page,
    }) => {
      // Open the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);

      // Create a folder
      await createFolderElement(page, 'TestFolder');

      // Navigate to publish plan
      await navigateToPublishingTab(page);
      await page.getByTestId('create-publish-plan-button').click();
      await expect(page.getByTestId('publish-plan-container')).toBeVisible();

      // Select Contents section so the drop target is visible
      await selectSection(page, 'contents');

      // Attempt to drag folder onto the plan
      const folderItem = page.getByTestId('element-TestFolder');
      const dropTarget = page.getByTestId('content-items-list');
      await cdkDragTo(page, folderItem, dropTarget);

      // Plan should still be empty — folder should be rejected
      await expect(page.getByTestId('empty-content-state')).toBeVisible();
    });

    test('should allow dragging multiple documents into publish plan', async ({
      localPageWithProject: page,
    }) => {
      // Open the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);

      // Create two document elements
      await createDocumentElement(page, 'Chapter1');
      await createDocumentElement(page, 'Chapter2');

      // Navigate to publish plan
      await navigateToPublishingTab(page);
      await page.getByTestId('create-publish-plan-button').click();
      await expect(page.getByTestId('publish-plan-container')).toBeVisible();

      // Select Contents section so the drop target is visible
      await selectSection(page, 'contents');

      const dropTarget = page.getByTestId('content-items-list');

      // Drag first document
      await cdkDragTo(page, page.getByTestId('element-Chapter1'), dropTarget);
      await expect(page.getByTestId('content-item-0')).toBeVisible();

      // Drag second document
      await cdkDragTo(page, page.getByTestId('element-Chapter2'), dropTarget);
      await expect(page.getByTestId('content-item-1')).toBeVisible();

      // Verify both items are in the list (order may vary based on drop position)
      const names = await page
        .locator('[data-testid="item-name"]')
        .allTextContents();
      expect(names).toContain('Chapter1');
      expect(names).toContain('Chapter2');
    });
  });
});
