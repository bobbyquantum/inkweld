/**
 * Edit Project Dialog — Cover Image Tests (Local Mode)
 *
 * Regression coverage for "Select from Library" in the edit project dialog,
 * which silently failed for two compounding reasons:
 *
 * 1. The cover buttons inside the dialog's <form> had no `type` attribute,
 *    so they defaulted to type="submit" — clicking one submitted the form,
 *    onSave() closed the dialog ("Project updated successfully") before the
 *    crop flow could even start.
 * 2. The app runs zoneless change detection, and the library-select flow
 *    assigned cropper state (plain properties) from an async continuation,
 *    which never scheduled change detection — the crop view never rendered.
 *
 * This test drives the real UI end-to-end: pick an image from the media
 * library and the crop view MUST render while the dialog stays open.
 */
import { DEMO_ASSETS, storeRealMediaInIndexedDB } from '../common/test-helpers';
import { expect, test } from './fixtures';

test.describe('Edit Project Dialog - select cover from library', () => {
  test('selecting a library image opens the crop view and applies the cover', async ({
    localPageWithProject: page,
  }) => {
    // The media selector dialog always checks the server for extra items,
    // even in local mode (MediaSyncService.checkSyncStatus). Fulfill that one
    // endpoint with an empty list so the fixture's "no API calls in local
    // mode" guard is not tripped. Routes registered here take precedence over
    // the fixture's catch-all abort route.
    await page.route('**/api/v1/media/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await test.step('seed a real image into the project media library', async () => {
      await storeRealMediaInIndexedDB(
        page,
        'testuser/test-project',
        'library-cover',
        DEMO_ASSETS.covers.demo1,
        'library-cover.png'
      );
    });

    await test.step('open the edit project dialog from the project home tab', async () => {
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      await page.getByTestId('project-cover-edit').click();
      await expect(page.getByTestId('edit-project-dialog')).toBeVisible();
    });

    const editDialog = page.getByTestId('edit-project-dialog');

    await test.step('choose the image via Select from Library', async () => {
      await editDialog
        .getByRole('button', { name: 'Select from Library' })
        .click();

      const mediaDialog = page.getByTestId('media-selector-dialog');
      await expect(mediaDialog).toBeVisible();

      await mediaDialog
        .getByRole('button', { name: /library-cover\.png/ })
        .click();
      await mediaDialog
        .getByRole('button', { name: 'Select', exact: true })
        .click();

      await expect(mediaDialog).not.toBeVisible();

      // The edit dialog must still be open — a form submit here used to
      // close it ("Project updated successfully" snackbar) before the crop
      // view could ever appear.
      await expect(editDialog).toBeVisible();
    });

    await test.step('REGRESSION: the crop view renders after library selection', async () => {
      await expect(
        editDialog.getByRole('heading', { name: 'Crop Cover Image' })
      ).toBeVisible();
      await expect(editDialog.getByTestId('cover-cropper')).toBeVisible();
    });

    await test.step('apply the crop and see the cover preview', async () => {
      const applyButton = editDialog.getByRole('button', {
        name: 'Apply',
        exact: true,
      });
      // The apply button enables once the cropper emits its first crop event.
      await expect(applyButton).toBeEnabled();
      await applyButton.click();

      await expect(editDialog.getByTestId('cover-preview')).toBeVisible();
    });
  });
});
