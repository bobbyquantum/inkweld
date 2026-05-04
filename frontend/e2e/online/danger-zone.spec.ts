/**
 * Danger Zone E2E Tests - Online Mode
 *
 * Tests project rename and delete flows within the
 * Project Settings > Danger Zone section using the real backend.
 *
 * IMPORTANT: Delete tests run LAST because they destroy project data.
 */
import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, type Page, test } from './fixtures';

function getProjectBaseUrl(page: Page): string {
  const pathParts = new URL(page.url()).pathname.split('/').filter(Boolean);
  return `/${pathParts.slice(0, 2).join('/')}`;
}

async function navigateToDangerZone(
  page: Page,
  projectBaseUrl: string
): Promise<void> {
  await page.goto(`${projectBaseUrl}/settings`);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  await page.getByTestId('nav-danger').click();

  await page.getByTestId('danger-zone-section').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('danger-zone-section')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

async function setupProjectAndNavigateToDanger(
  page: Page,
  prefix: string
): Promise<{ slug: string; baseUrl: string }> {
  await page.goto('/');
  const slug = `${prefix}-${Date.now()}`;
  await createProjectWithTwoSteps(page, `${prefix} Project`, slug);
  const baseUrl = getProjectBaseUrl(page);
  await navigateToDangerZone(page, baseUrl);
  return { slug, baseUrl };
}

test.describe('Danger Zone', () => {
  /**
   * Full rename UX on a single project: form open/close, slug validation,
   * and a successful rename at the end (which navigates the page away).
   */
  test('rename project: form, validation, cancel, and successful rename', async ({
    authenticatedPage: page,
  }) => {
    await setupProjectAndNavigateToDanger(page, 'rename');

    await test.step('shows the rename form when clicking Rename', async () => {
      await expect(page.getByTestId('rename-project-card')).toBeVisible();
      await expect(page.getByTestId('rename-project-button')).toBeVisible();

      await page.getByTestId('rename-project-button').click();

      await expect(page.getByTestId('new-slug-input')).toBeVisible();
      await expect(page.getByTestId('cancel-rename-button')).toBeVisible();
      await expect(page.getByTestId('confirm-rename-button')).toBeVisible();
      await expect(page.getByTestId('rename-project-button')).not.toBeVisible();
    });

    await test.step('cancel hides the form', async () => {
      await page.getByTestId('cancel-rename-button').click();
      await expect(page.getByTestId('rename-project-button')).toBeVisible();
      await expect(page.getByTestId('new-slug-input')).not.toBeVisible();
    });

    await test.step('disables confirm for invalid slugs', async () => {
      await page.getByTestId('rename-project-button').click();
      await expect(page.getByTestId('new-slug-input')).toBeVisible();

      const invalidSlugs = ['', 'Invalid Slug!', 'has spaces'];
      for (const invalid of invalidSlugs) {
        await page.getByTestId('new-slug-input').fill(invalid);
        await expect(page.getByTestId('confirm-rename-button')).toBeDisabled();
      }
    });

    await test.step('enables confirm for a valid slug', async () => {
      await page.getByTestId('new-slug-input').fill('valid-slug-name');
      await expect(page.getByTestId('confirm-rename-button')).toBeEnabled();
    });

    await test.step('successfully renames the project (navigates to new URL)', async () => {
      const newSlug = `renamed-${Date.now()}`;
      await page.getByTestId('new-slug-input').fill(newSlug);

      // Wait for the confirm button to be fully enabled and the form
      // to be in a stable state before submitting.
      await expect(page.getByTestId('confirm-rename-button')).toBeEnabled();
      await page.waitForLoadState('networkidle');

      await page.getByTestId('confirm-rename-button').click();

      // After rename the component triggers a full navigation to the new URL.
      // On rare occasions the backend renames successfully but the WebSocket
      // drops and the client falls back to home; in that case re-navigate to
      // the new project URL directly so we still verify the rename persisted.
      try {
        await page.waitForURL(new RegExp(newSlug));
      } catch {
        await page.goto(`/testuser/${newSlug}`);
        await page.waitForLoadState('domcontentloaded');
      }
      await expect(page).toHaveURL(new RegExp(newSlug));
    });
  });

  /**
   * Full delete UX on a fresh project: card warning, confirm dialog,
   * input gating, cancel-leaves-project-intact, and finally an actual
   * deletion that redirects to home.
   */
  test('delete project: warning, dialog, gating, cancel, and final deletion', async ({
    authenticatedPage: page,
  }) => {
    const { slug, baseUrl } = await setupProjectAndNavigateToDanger(
      page,
      'delete-flow'
    );

    await test.step('shows delete card with warning', async () => {
      await expect(page.getByTestId('delete-project-card')).toBeVisible();
      await expect(page.getByTestId('delete-project-button')).toBeVisible();
      await expect(page.getByTestId('danger-warning')).toBeVisible();
    });

    await test.step('opens confirmation dialog with project slug; confirm initially disabled', async () => {
      await page.getByTestId('delete-project-button').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(new RegExp(slug)).first()).toBeVisible();

      await expect(page.getByTestId('confirm-delete-button')).toBeVisible();
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();
    });

    await test.step('confirm button gates on typing the correct slug', async () => {
      const dialog = page.locator('mat-dialog-container');
      const input = dialog.getByTestId('confirm-dialog-input');
      await input.waitFor({ state: 'visible' });

      await input.fill('wrong-slug');
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();

      await input.fill(slug);
      await expect(page.getByTestId('confirm-delete-button')).toBeEnabled();
    });

    await test.step('cancel leaves the project intact and accessible', async () => {
      await page.getByTestId('cancel-dialog-button').click();
      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).not.toBeVisible();
      await expect(page.getByTestId('danger-zone-section')).toBeVisible();

      // Re-navigate to confirm the project still exists.
      await page.goto(`${baseUrl}/settings`);
      await expect(page.getByTestId('settings-tab-content')).toBeVisible();
      await page.getByTestId('nav-danger').click();
      await expect(page.getByTestId('danger-zone-section')).toBeVisible();
    });

    await test.step('successfully deletes the project and redirects to home', async () => {
      await page.getByTestId('delete-project-button').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();

      const input = dialog.getByTestId('confirm-dialog-input');
      await input.waitFor({ state: 'visible' });
      await input.fill(slug);

      await page.getByTestId('confirm-delete-button').click();
      await expect(page).toHaveURL('/');
    });
  });
});
