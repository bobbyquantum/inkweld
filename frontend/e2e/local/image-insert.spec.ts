/**
 * Image Insert Feature Tests - Local Mode
 *
 * Tests that verify image insertion functionality works correctly,
 * including the toolbar button, paste functionality, and keyboard shortcut.
 */
import { expect, test } from './fixtures';

/**
 * Helper to create a test image blob in the browser
 * Returns the data URL of the created image
 */
async function createTestImageDataUrl(
  page: import('@playwright/test').Page,
  color = 'red',
  width = 200,
  height = 150
): Promise<string> {
  return page.evaluate(
    ({ color, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      return canvas.toDataURL('image/png');
    },
    { color, width, height }
  );
}

/**
 * Helper to create a document and get the editor ready
 */
async function createDocumentAndFocus(
  page: import('@playwright/test').Page,
  docName: string
): Promise<void> {
  // Open a project
  await page.getByTestId('project-card').first().click();
  await expect(page.getByTestId('project-tree')).toBeVisible();

  // Create a document
  const newDocButton = page.getByTestId('toolbar-new-document-button');
  await expect(newDocButton).toBeVisible();
  await newDocButton.click();

  // Select "Document" from the Choose Element Type dialog
  await page.getByRole('heading', { name: 'Document', level: 4 }).click();

  // The dialog proceeds to document name entry
  const dialogInput = page.getByLabel('Document Name');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(docName);
  await page.getByTestId('create-element-button').click();

  // Wait for the document to be created and editor to appear
  await expect(page.locator('ngx-editor')).toBeVisible();

  // Focus the editor
  const editor = page.locator('ngx-editor .ProseMirror');
  await editor.click();
}

test.describe('Image Insert', () => {
  test.describe('Toolbar Button', () => {
    test('should show image button in toolbar when editing', async ({
      localPageWithProject: page,
    }) => {
      await createDocumentAndFocus(page, 'Image Button Test');

      // Image button should be visible in toolbar
      const imageButton = page.getByTestId('toolbar-image');
      await expect(imageButton).toBeVisible();
    });

    test('should open insert image dialog when clicking toolbar button', async ({
      localPageWithProject: page,
    }) => {
      await createDocumentAndFocus(page, 'Image Dialog Test');

      // Click the image button
      const imageButton = page.getByTestId('toolbar-image');
      await imageButton.click();

      // Dialog should open
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Insert Image' })
      ).toBeVisible();

      // Should have upload button
      await expect(page.getByTestId('insert-image-upload')).toBeVisible();

      // Should have library button
      await expect(page.getByTestId('insert-image-library')).toBeVisible();
    });

    test('should close dialog on cancel', async ({
      localPageWithProject: page,
    }) => {
      await createDocumentAndFocus(page, 'Image Cancel Test');

      // Open dialog
      const imageButton = page.getByTestId('toolbar-image');
      await imageButton.click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Click cancel
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Dialog should close
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  });

  test.describe('File Upload Flow', () => {
    test('should upload file and show cropper', async ({
      localPageWithProject: page,
    }) => {
      await createDocumentAndFocus(page, 'Image Upload Test');

      // Open dialog
      const imageButton = page.getByTestId('toolbar-image');
      await imageButton.click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Create a test image file
      const dataUrl = await createTestImageDataUrl(page, 'blue', 300, 200);
      const base64Data = dataUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');

      // Set up file input
      const fileInput = page.getByTestId('insert-image-file-input');
      await fileInput.setInputFiles({
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer,
      });

      // Cropper should appear
      await expect(
        page.getByRole('heading', { name: 'Crop Image' })
      ).toBeVisible({ timeout: 5000 });

      // Insert button should be visible
      await expect(page.getByTestId('insert-image-apply')).toBeVisible();
    });

    test('should insert image after cropping', async ({
      localPageWithProject: page,
    }) => {
      await createDocumentAndFocus(page, 'Image Insert Test');

      // Open dialog
      const imageButton = page.getByTestId('toolbar-image');
      await imageButton.click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Create and upload a test image
      const dataUrl = await createTestImageDataUrl(page, 'green', 300, 200);
      const base64Data = dataUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');

      const fileInput = page.getByTestId('insert-image-file-input');
      await fileInput.setInputFiles({
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer,
      });

      // Wait for cropper
      await expect(
        page.getByRole('heading', { name: 'Crop Image' })
      ).toBeVisible({ timeout: 5000 });

      // Wait for insert button to be enabled (indicates cropper is ready)
      const insertButton = page.getByTestId('insert-image-apply');
      await expect(insertButton).toBeEnabled();

      // Click insert
      await insertButton.click();

      // Dialog should close
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

      // Image should be in the document (use .first() to handle ProseMirror separator image)
      const editorImage = page.locator(
        'ngx-editor .ProseMirror img[data-media-id]'
      );
      await expect(editorImage.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Image Paste', () => {
    // Note: Clipboard API paste tests are skipped due to browser permission restrictions
    // in Playwright. The image paste functionality is tested manually.
    test.skip('should insert image when pasting from clipboard', async ({
      localPageWithProject: page,
    }) => {
      await createDocumentAndFocus(page, 'Image Paste Test');

      // Create test image data in the browser
      const dataUrl = await createTestImageDataUrl(page, 'purple', 100, 100);

      // Use clipboard API to paste image
      await page.evaluate(async (imageDataUrl: string) => {
        // Convert data URL to blob
        const response = await fetch(imageDataUrl);
        const blob = await response.blob();

        // Create clipboard item
        const clipboardItem = new ClipboardItem({
          [blob.type]: blob,
        });

        // Write to clipboard
        await navigator.clipboard.write([clipboardItem]);
      }, dataUrl);

      // Focus editor and paste
      const editor = page.locator('ngx-editor .ProseMirror');
      await editor.click();
      await expect(editor).toBeFocused();

      await page.keyboard.press('Control+KeyV');

      // Image should be in the document with media: URL
      const editorImage = page.locator('ngx-editor .ProseMirror img');
      await expect(editorImage).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Keyboard Shortcut', () => {
    test('should open dialog with Ctrl/Cmd+Shift+I', async ({
      localPageWithProject: page,
    }) => {
      await createDocumentAndFocus(page, 'Image Shortcut Test');

      // Ensure editor has focus
      const editor = page.locator('ngx-editor .ProseMirror');
      await editor.click();
      await expect(editor).toBeFocused();

      // Press keyboard shortcut
      await page.keyboard.press('Control+Shift+KeyI');

      // Dialog should open
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Insert Image' })
      ).toBeVisible();
    });
  });

  test.describe('Image Persistence', () => {
    test('should persist image after page reload', async ({
      localPageWithProject: page,
    }) => {
      await createDocumentAndFocus(page, 'Image Persist Test');

      // Open dialog and insert image
      const imageButton = page.getByTestId('toolbar-image');
      await imageButton.click();

      const dataUrl = await createTestImageDataUrl(page, 'orange', 200, 150);
      const base64Data = dataUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');

      const fileInput = page.getByTestId('insert-image-file-input');
      await fileInput.setInputFiles({
        name: 'persist-test.png',
        mimeType: 'image/png',
        buffer,
      });

      await expect(
        page.getByRole('heading', { name: 'Crop Image' })
      ).toBeVisible({ timeout: 5000 });

      const insertButton = page.getByTestId('insert-image-apply');
      await expect(insertButton).toBeEnabled();
      await insertButton.click();

      // Wait for dialog to close and image to appear
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
      const editorImage = page.locator(
        'ngx-editor .ProseMirror img[data-media-id]'
      );
      await expect(editorImage.first()).toBeVisible({ timeout: 5000 });

      // Reload the page
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Navigate back to the project if needed
      if (!page.url().includes('test-project')) {
        await page.getByTestId('project-card').first().click();
        await expect(page.getByTestId('project-tree')).toBeVisible();
      }

      // Click on the document in the tree to open it
      const docTreeItem = page
        .locator('[data-testid="tree-item"]')
        .filter({ hasText: 'Image Persist Test' });
      if (await docTreeItem.isVisible()) {
        await docTreeItem.click();
      }

      // Wait for editor to load
      await expect(page.locator('ngx-editor')).toBeVisible({ timeout: 5000 });

      // Image should still be visible
      const reloadedImage = page.locator(
        'ngx-editor .ProseMirror img[data-media-id]'
      );
      await expect(reloadedImage.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Cropper Back Button', () => {
    test('should go back to main view when clicking Back in cropper', async ({
      localPageWithProject: page,
    }) => {
      await createDocumentAndFocus(page, 'Image Back Test');

      // Open dialog
      const imageButton = page.getByTestId('toolbar-image');
      await imageButton.click();

      // Upload image
      const dataUrl = await createTestImageDataUrl(page, 'cyan', 200, 150);
      const base64Data = dataUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');

      const fileInput = page.getByTestId('insert-image-file-input');
      await fileInput.setInputFiles({
        name: 'back-test.png',
        mimeType: 'image/png',
        buffer,
      });

      // Wait for cropper
      await expect(
        page.getByRole('heading', { name: 'Crop Image' })
      ).toBeVisible({ timeout: 5000 });

      // Click back button
      await page.getByRole('button', { name: 'Back' }).click();

      // Should return to main view
      await expect(
        page.getByRole('heading', { name: 'Insert Image' })
      ).toBeVisible();
      await expect(page.getByTestId('insert-image-upload')).toBeVisible();
    });
  });
});
