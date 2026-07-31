/**
 * Project Cover Tests - Online Mode
 *
 * Covers the full set-cover flow through the edit-project dialog (upload →
 * crop → save), persistence across reload, resilience when the server has
 * lost the project record (404s on the project endpoints — the cover is a
 * media blob + Yjs meta and must survive), and the mobile stacked layout.
 */
import { generateUniqueSlug } from '../common';
import { expect, test } from './fixtures';

/**
 * Generate a 400x640 PNG in the page (the cropper enforces a 1:1.6 cover
 * aspect ratio and needs a real-sized image to produce a crop — a 1x1 pixel
 * leaves the Apply button permanently disabled).
 */
async function makeCoverPng(
  page: import('@playwright/test').Page
): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 640;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#365f8c';
    ctx.fillRect(0, 0, 400, 640);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function createProject(
  page: import('@playwright/test').Page,
  title: string,
  slug: string
): Promise<void> {
  await page.goto('/create-project');
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByTestId('project-title-input').fill(title);
  await page.getByTestId('project-slug-input').fill(slug);
  await page.getByTestId('create-project-button').click();
  await page.waitForURL(new RegExp(slug));
  await page.waitForLoadState('networkidle');
}

/** Open the edit-project dialog from the home tab cover area. */
async function openEditProjectDialog(
  page: import('@playwright/test').Page
): Promise<void> {
  const coverWrapper = page.locator('.cover-image-wrapper').first();
  await expect(coverWrapper).toBeVisible();
  await coverWrapper.click();
  await expect(page.locator('mat-dialog-container')).toBeVisible();
}

/** Upload a generated cover through the dialog's hidden file input and crop it. */
async function uploadAndCropCover(
  page: import('@playwright/test').Page
): Promise<void> {
  const png = await makeCoverPng(page);
  await page.locator('mat-dialog-container input[type="file"]').setInputFiles({
    name: 'e2e-cover.png',
    mimeType: 'image/png',
    buffer: png,
  });
  const applyButton = page.getByRole('button', { name: /^apply$/i });
  // Enabled only once the cropper has produced a cropped blob.
  await expect(applyButton).toBeEnabled();
  await applyButton.click();
}

test.describe('Project Cover', () => {
  test('sets a cover via upload + crop and persists it across reload', async ({
    authenticatedPage: page,
  }) => {
    const slug = generateUniqueSlug('cover-upload');
    await createProject(page, 'Cover Upload', slug);

    await openEditProjectDialog(page);
    await uploadAndCropCover(page);
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByText('Project updated successfully')).toBeVisible();
    await expect(page.locator('mat-dialog-container')).not.toBeVisible();

    // Cover renders on the home tab...
    await expect(
      page.locator('.cover-image-wrapper img').first()
    ).toBeVisible();

    // ...and survives a full reload (blob in IndexedDB + coverMediaId in
    // Yjs project meta).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('.cover-image-wrapper img').first()
    ).toBeVisible();
  });

  // Route interception is bypassed by the Angular service worker in prod
  // builds (E2E_MODE=prod in CI): SW-mediated fetches never reach
  // page.route, so the 404 simulation silently doesn't apply and the test
  // asserts against a healthy server. Blocking service workers restores
  // interception in both dev and prod modes.
  test.use({ serviceWorkers: 'block' });

  test('keeps the cover and warns softly when the server has lost the project record', async ({
    authenticatedPage: page,
  }) => {
    const slug = generateUniqueSlug('cover-rowless');
    await createProject(page, 'Cover Rowless', slug);

    // Simulate the "server lost the project record" incident: every project
    // record endpoint (including the cover upload) starts returning 404,
    // exactly as if the row vanished from the database while local data and
    // Yjs sync live on.
    await page.route(`**/api/v1/projects/*/${slug}`, route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Project not found' }),
      })
    );
    await page.route(`**/api/v1/projects/*/${slug}/cover`, route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Project not found' }),
      })
    );

    await openEditProjectDialog(page);
    await uploadAndCropCover(page);
    await page.getByRole('button', { name: /^save$/i }).click();

    // The record update failure is surfaced softly — never a silent failure
    // and never a discarded cover.
    await expect(page.getByText(/saved locally/i)).toBeVisible();
    await expect(page.locator('mat-dialog-container')).not.toBeVisible();

    // Still on the project page (no silent bounce to home) with the cover
    // applied from local storage.
    expect(page.url()).toContain(slug);
    await expect(
      page.locator('.cover-image-wrapper img').first()
    ).toBeVisible();
  });
});

test.describe('Project Cover (mobile)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('edit-project dialog stacks and stays usable on a phone viewport', async ({
    authenticatedPage: page,
  }) => {
    const slug = generateUniqueSlug('cover-mobile');
    await createProject(page, 'Cover Mobile', slug);

    await openEditProjectDialog(page);

    const dialog = page.locator('mat-dialog-container');
    // The two-column layout stacks on phones.
    await expect(dialog.locator('.dialog-layout')).toHaveCSS(
      'flex-direction',
      'column'
    );
    // No horizontal overflow and the actions are reachable.
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(375);
    await expect(page.getByRole('button', { name: /^save$/i })).toBeVisible();

    // The cropper also fits after choosing an image.
    await uploadAndCropCover(page);
    await expect(page.getByRole('button', { name: /^save$/i })).toBeVisible();
  });
});
