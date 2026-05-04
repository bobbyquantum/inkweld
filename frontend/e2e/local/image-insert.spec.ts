/**
 * Image Insert Feature Tests - Local Mode
 *
 * Tests that verify image insertion functionality works correctly,
 * including the toolbar button, paste functionality, and keyboard shortcut.
 *
 * Consolidated from 8 individual tests (one skipped) into 3 grouped tests
 * using `test.step()`. Document creation is shared per group.
 */
import { type Page } from '@playwright/test';

import { pressShortcut } from '../common';
import { expect, test } from './fixtures';

/**
 * Create a deterministic test PNG image entirely in the browser and return
 * its data URL. Used to feed file inputs without shipping fixtures.
 */
async function createTestImageDataUrl(
  page: Page,
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
 * Open a project, create a fresh document, and leave the editor focused.
 */
async function createDocumentAndFocus(
  page: Page,
  docName: string
): Promise<void> {
  await page.getByTestId('project-card').first().click();
  await expect(page.getByTestId('project-tree')).toBeVisible();

  const newDocButton = page.getByTestId('create-new-element');
  await expect(newDocButton).toBeVisible();
  await newDocButton.click();

  await page.getByRole('heading', { name: 'Document', level: 4 }).click();

  const dialogInput = page.getByLabel('Document Name');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(docName);
  await page.getByTestId('create-element-button').click();

  await expect(page.locator('ngx-editor')).toBeVisible();
  await page.locator('ngx-editor .ProseMirror').click();
}

/**
 * Convert a generated data URL into the file payload Playwright's
 * `setInputFiles({ buffer })` expects.
 */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64Data = dataUrl.split(',')[1];
  return Buffer.from(base64Data, 'base64');
}

test.describe('Image Insert', () => {
  test('dialog UX: toolbar button, dialog open/cancel, keyboard shortcut', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Image Dialog UX Test');

    const imageButton = page.getByTestId('toolbar-image');

    await test.step('image button is visible in the editor toolbar', async () => {
      await expect(imageButton).toBeVisible();
    });

    await test.step('clicking the toolbar button opens the Insert Image dialog', async () => {
      await imageButton.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Insert Image' })
      ).toBeVisible();
      await expect(page.getByTestId('insert-image-upload')).toBeVisible();
      await expect(page.getByTestId('insert-image-library')).toBeVisible();
    });

    await test.step('cancel closes the dialog', async () => {
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });

    await test.step('Cmd/Ctrl+Shift+I shortcut also opens the dialog', async () => {
      const editor = page.locator('ngx-editor .ProseMirror');
      await editor.click();
      await expect(editor).toBeFocused();

      await pressShortcut(page, 'Shift+KeyI');
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Insert Image' })
      ).toBeVisible();
    });
  });

  test('upload + crop flow: shows cropper, Back returns to main, Insert places image, persists after reload', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Image Persist Test');

    const fileInput = page.getByTestId('insert-image-file-input');
    const insertButton = page.getByTestId('insert-image-apply');

    await test.step('uploading a file shows the cropper view', async () => {
      await page.getByTestId('toolbar-image').click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const buffer = dataUrlToBuffer(
        await createTestImageDataUrl(page, 'blue', 300, 200)
      );
      await fileInput.setInputFiles({
        name: 'cropper-test.png',
        mimeType: 'image/png',
        buffer,
      });

      await expect(
        page.getByRole('heading', { name: 'Crop Image' })
      ).toBeVisible();
      await expect(insertButton).toBeVisible();
    });

    await test.step('Back returns to the main Insert Image view', async () => {
      await page.getByRole('button', { name: 'Back' }).click();
      await expect(
        page.getByRole('heading', { name: 'Insert Image' })
      ).toBeVisible();
      await expect(page.getByTestId('insert-image-upload')).toBeVisible();
    });

    await test.step('uploading + Insert places the image into the document', async () => {
      const buffer = dataUrlToBuffer(
        await createTestImageDataUrl(page, 'orange', 200, 150)
      );
      await fileInput.setInputFiles({
        name: 'persist-test.png',
        mimeType: 'image/png',
        buffer,
      });

      await expect(
        page.getByRole('heading', { name: 'Crop Image' })
      ).toBeVisible();
      await expect(insertButton).toBeEnabled();
      await insertButton.click();

      await expect(page.getByRole('dialog')).not.toBeVisible();

      const editorImage = page.locator(
        'ngx-editor .ProseMirror img[data-media-id]'
      );
      await expect(editorImage.first()).toBeVisible();
    });

    await test.step('image persists after a full page reload', async () => {
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Navigate back into the project if reload landed us on the home page.
      if (!page.url().includes('test-project')) {
        await page.getByTestId('project-card').first().click();
        await expect(page.getByTestId('project-tree')).toBeVisible();
      }

      const docTreeItem = page
        .locator('[data-testid="tree-item"]')
        .filter({ hasText: 'Image Persist Test' });
      if (await docTreeItem.isVisible()) {
        await docTreeItem.click();
      }

      await expect(page.locator('ngx-editor')).toBeVisible();

      const reloadedImage = page.locator(
        'ngx-editor .ProseMirror img[data-media-id]'
      );
      await expect(reloadedImage.first()).toBeVisible();
    });
  });

  // Clipboard API paste tests are skipped due to browser permission restrictions
  // in Playwright. The image paste functionality is tested manually.
  test.skip('clipboard paste inserts an image', async ({
    localPageWithProject: page,
  }) => {
    await createDocumentAndFocus(page, 'Image Paste Test');

    const dataUrl = await createTestImageDataUrl(page, 'purple', 100, 100);

    await page.evaluate(async (imageDataUrl: string) => {
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      const clipboardItem = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([clipboardItem]);
    }, dataUrl);

    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.click();
    await expect(editor).toBeFocused();
    await page.keyboard.press('Control+KeyV');

    await expect(page.locator('ngx-editor .ProseMirror img')).toBeVisible();
  });
});
