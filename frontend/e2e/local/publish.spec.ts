/**
 * Publishing Workflow Tests - Local Mode
 *
 * Tests that verify publishing documents to PDF, EPUB, Markdown, and HTML
 * work correctly in pure local mode without any server connection.
 *
 * NOTE: Tests are consolidated into three `test()` blocks using `test.step()`,
 * so the project + plan setup cost is paid once per group rather than once
 * per individual test case.
 *
 * - Test A: plan creation, metadata, format selection, empty states (no content)
 * - Test B: add content → generate → download → remove content → auto-save reload
 * - Test C: drag-and-drop scenarios (folder rejection + two document drags)
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

test.describe('Local Publishing Workflow', () => {
  /**
   * Helper to navigate to the Publishing tab via sidenav
   */
  async function navigateToPublishingTab(page: Page): Promise<void> {
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
  async function selectSection(page: Page, section: string): Promise<void> {
    await page.getByTestId(`nav-${section}`).click();
  }

  /**
   * Helper to create a document element in the project tree
   */
  async function createDocumentElement(
    page: Page,
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
   * Helper to create a folder element in the project tree.
   */
  async function createFolderElement(page: Page, name: string): Promise<void> {
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
    page: Page,
    source: import('@playwright/test').Locator,
    target: import('@playwright/test').Locator
  ): Promise<void> {
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

    await page.mouse.move(srcX, srcY);
    await page.waitForTimeout(200);

    await page.mouse.down();
    await page.waitForTimeout(200);

    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(srcX + i * 4, srcY, { steps: 2 });
      await page.waitForTimeout(50);
    }

    await page.waitForTimeout(300);

    await page.mouse.move(tgtX, tgtY, { steps: 30 });

    await page.waitForTimeout(500);

    await page.mouse.up();
    await page.waitForTimeout(200);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Test A: plan creation + metadata + format selection + empty states
  // ───────────────────────────────────────────────────────────────────────────

  test('plan creation, metadata, format selection, and empty states', async ({
    localPageWithProject: page,
  }) => {
    // Open project and navigate to Publishing tab
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);
    await navigateToPublishingTab(page);

    await test.step('publishing tab shows the create button', async () => {
      await expect(
        page.getByTestId('create-publish-plan-button')
      ).toBeVisible();
    });

    // Create a publish plan to use for the rest of this test
    await page.getByTestId('create-publish-plan-button').click();
    await expect(page.getByTestId('publish-plan-container')).toBeVisible();

    await test.step('plan opens with default values (name input visible)', async () => {
      await expect(page.getByTestId('plan-name-input')).toBeVisible();
    });

    await test.step('update plan metadata (book title + author)', async () => {
      const titleInput = page.getByTestId('book-title-input');
      await titleInput.fill('My Awesome Book');

      const authorInput = page.getByTestId('author-input');
      await authorInput.fill('Test Author');
    });

    await test.step('format select dropdown shows all 4 formats; pick EPUB', async () => {
      const formatSelect = page.getByTestId('format-select');
      await formatSelect.click();

      const options = page.getByRole('option');
      await expect(options).toHaveCount(4);

      await page.getByRole('option', { name: 'EPUB (E-Book)' }).click();

      await selectSection(page, 'publish');
      await expect(page.getByTestId('generate-button')).toContainText('EPUB');
    });

    await test.step('empty content state + disabled generate button', async () => {
      await selectSection(page, 'contents');
      await expect(page.getByTestId('empty-content-state')).toBeVisible();

      await selectSection(page, 'publish');
      await expect(page.getByTestId('generate-button')).toBeDisabled();
      await expect(page.getByTestId('generate-hint')).toBeVisible();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test B: add content → generate → download → remove → auto-save reload
  // ───────────────────────────────────────────────────────────────────────────

  test('add content, generate, download, remove, auto-save reload', async ({
    localPageWithProject: page,
  }) => {
    // Capture console errors for the generation step
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Open project, create a doc, and open a publish plan
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);
    await createDocumentElement(page, 'TestDoc');
    await navigateToPublishingTab(page);
    await page.getByTestId('create-publish-plan-button').click();
    await expect(page.getByTestId('publish-plan-container')).toBeVisible();

    await test.step('add everything fills the content list', async () => {
      await selectSection(page, 'contents');
      await page.getByTestId('add-everything-button').click();

      await expect(page.getByTestId('content-items-list')).toBeVisible();
      await expect(page.getByTestId('content-item-0')).toBeVisible();
    });

    await test.step('generate publication shows complete dialog with file info', async () => {
      await selectSection(page, 'publish');
      await page.getByTestId('generate-button').click();

      // Generate button may go disabled OR hidden — either is fine.
      await page
        .getByTestId('generate-button')
        .waitFor({ state: 'attached' })
        .catch(() => {
          /* may detach */
        });

      const dialogOrError = await Promise.race([
        page
          .getByTestId('publish-complete-dialog-title')
          .waitFor({ timeout: 60000 })
          .then(() => 'dialog' as const),
        page
          .locator('.mat-mdc-snack-bar-label')
          .filter({ hasText: /error/i })
          .waitFor({ timeout: 60000 })
          .then(() => 'error' as const),
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

      await expect(page.getByTestId('filename')).toBeVisible();
      await expect(page.getByTestId('format-name')).toBeVisible();
      await expect(page.getByTestId('file-size')).toBeVisible();
      await expect(page.getByTestId('local-notice')).toBeVisible();
    });

    await test.step('download button triggers a .epub download', async () => {
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-button').click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('.epub');

      // Close the publish-complete dialog so the backdrop doesn't block
      // subsequent interactions.
      const doneButton = page.getByTestId('done-button');
      if (await doneButton.isVisible()) {
        await doneButton.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(
        page.getByTestId('publish-complete-dialog-title')
      ).not.toBeVisible();
    });

    await test.step('remove all content items returns plan to empty state', async () => {
      await selectSection(page, 'contents');
      await expect(page.getByTestId('content-items-list')).toBeVisible();

      const MAX_REMOVALS = 50;
      let removals = 0;
      while (
        removals < MAX_REMOVALS &&
        (await page.getByTestId('remove-item-button').first().isVisible())
      ) {
        await page.getByTestId('remove-item-button').first().click();
        await page.waitForTimeout(300);
        removals++;
      }

      await expect(page.getByTestId('empty-content-state')).toBeVisible();
    });

    await test.step('book title auto-saves and persists across reload', async () => {
      // Book title lives in the metadata (default) section.
      await selectSection(page, 'metadata');
      await page.getByTestId('book-title-input').fill('Updated Book Title');

      // Auto-save debounce
      await page.waitForTimeout(1000);

      await page.reload();

      await expect(page.getByTestId('publish-plan-container')).toBeVisible();
      await expect(page.getByTestId('book-title-input')).toHaveValue(
        'Updated Book Title'
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Test C: drag-and-drop from project tree (folder reject + two docs)
  // ───────────────────────────────────────────────────────────────────────────

  test('drag from project tree: folders rejected, multiple documents accepted', async ({
    localPageWithProject: page,
  }) => {
    // Open project and create a folder + two documents
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    await createFolderElement(page, 'TestFolder');
    await createDocumentElement(page, 'Chapter1');
    await createDocumentElement(page, 'Chapter2');

    // Navigate to publish plan
    await navigateToPublishingTab(page);
    await page.getByTestId('create-publish-plan-button').click();
    await expect(page.getByTestId('publish-plan-container')).toBeVisible();

    await selectSection(page, 'contents');

    const dropTarget = page.getByTestId('content-items-list');
    await expect(dropTarget).toBeVisible();

    await test.step('dragging a folder is rejected (plan stays empty)', async () => {
      const folderItem = page.getByTestId('element-TestFolder');
      await cdkDragTo(page, folderItem, dropTarget);

      await expect(page.getByTestId('empty-content-state')).toBeVisible();
    });

    await test.step('drag Chapter1 onto plan adds first content item', async () => {
      await cdkDragTo(page, page.getByTestId('element-Chapter1'), dropTarget);

      await expect(page.getByTestId('content-item-0')).toBeVisible();
      await expect(
        page.getByTestId('content-item-0').getByTestId('item-name')
      ).toContainText('Chapter1');
    });

    await test.step('drag Chapter2 onto plan adds a second content item', async () => {
      await cdkDragTo(page, page.getByTestId('element-Chapter2'), dropTarget);

      await expect(page.getByTestId('content-item-1')).toBeVisible();

      const names = await page
        .locator('[data-testid="item-name"]')
        .allTextContents();
      expect(names).toContain('Chapter1');
      expect(names).toContain('Chapter2');
    });
  });
});
