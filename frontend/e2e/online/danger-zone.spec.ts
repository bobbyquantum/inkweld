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

  // Scroll into view to ensure the danger zone is rendered
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
  test.describe('Rename Project', () => {
    test('should show the rename form when clicking Rename button', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigateToDanger(page, 'rename-show');

      await expect(page.getByTestId('rename-project-card')).toBeVisible();
      await expect(page.getByTestId('rename-project-button')).toBeVisible();

      // Click Rename to show the form
      await page.getByTestId('rename-project-button').click();

      // Form should appear
      await expect(page.getByTestId('new-slug-input')).toBeVisible();
      await expect(page.getByTestId('cancel-rename-button')).toBeVisible();
      await expect(page.getByTestId('confirm-rename-button')).toBeVisible();
      await expect(page.getByTestId('rename-project-button')).not.toBeVisible();
    });

    test('should cancel rename and hide the form', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigateToDanger(page, 'rename-cancel');

      // Open the form
      await page.getByTestId('rename-project-button').click();
      await expect(page.getByTestId('new-slug-input')).toBeVisible();

      // Cancel
      await page.getByTestId('cancel-rename-button').click();

      // Form should hide, button should reappear
      await expect(page.getByTestId('rename-project-button')).toBeVisible();
      await expect(page.getByTestId('new-slug-input')).not.toBeVisible();
    });

    test('should disable confirm button for invalid slug', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigateToDanger(page, 'rename-invalid');

      await page.getByTestId('rename-project-button').click();
      await expect(page.getByTestId('new-slug-input')).toBeVisible();

      // Invalid slugs
      const invalidSlugs = ['', 'Invalid Slug!', 'has spaces'];
      for (const invalid of invalidSlugs) {
        await page.getByTestId('new-slug-input').fill(invalid);
        // The confirm button should be disabled for invalid slugs
        await expect(page.getByTestId('confirm-rename-button')).toBeDisabled();
      }
    });

    test('should enable confirm button for valid slug', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigateToDanger(page, 'rename-valid');

      await page.getByTestId('rename-project-button').click();
      await expect(page.getByTestId('new-slug-input')).toBeVisible();

      await page.getByTestId('new-slug-input').fill('valid-slug-name');
      await expect(page.getByTestId('confirm-rename-button')).toBeEnabled();
    });

    test('should successfully rename a project', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigateToDanger(page, 'rename-success');

      await page.getByTestId('rename-project-button').click();
      await expect(page.getByTestId('new-slug-input')).toBeVisible();

      const newSlug = `renamed-${Date.now()}`;
      await page.getByTestId('new-slug-input').fill(newSlug);
      await page.getByTestId('confirm-rename-button').click();

      // After rename, the page should navigate to the new URL
      // The component uses `globalThis.location.href` which triggers a full navigation
      // We just need to wait for the new URL to appear
      await page.waitForURL(new RegExp(newSlug), { timeout: 10_000 });
      await expect(page).toHaveURL(new RegExp(newSlug));
    });
  });

  test.describe('Delete Project', () => {
    test('should show delete card with warning', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigateToDanger(page, 'delete-show');

      await expect(page.getByTestId('delete-project-card')).toBeVisible();
      await expect(page.getByTestId('delete-project-button')).toBeVisible();
      await expect(
        page.getByText('This action cannot be undone')
      ).toBeVisible();
    });

    test('should open confirmation dialog when delete is clicked', async ({
      authenticatedPage: page,
    }) => {
      const { slug } = await setupProjectAndNavigateToDanger(
        page,
        'delete-confirm'
      );

      await page.getByTestId('delete-project-button').click();

      // Confirmation dialog should be visible
      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();

      // Confirmation text should contain the project slug (avoid strict mode due to multiple matches)
      await expect(dialog.getByText(new RegExp(slug)).first()).toBeVisible();

      // Confirm button should be visible but disabled (need to type slug)
      await expect(page.getByTestId('confirm-delete-button')).toBeVisible();
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();
    });

    test('should enable delete button after typing correct slug', async ({
      authenticatedPage: page,
    }) => {
      const { slug } = await setupProjectAndNavigateToDanger(
        page,
        'delete-enable'
      );

      await page.getByTestId('delete-project-button').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();

      // Type incorrect slug - button should remain disabled
      const input = dialog.locator('input[placeholder="Type to confirm"]');
      await input.waitFor({ state: 'visible' });
      await input.fill('wrong-slug');
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();

      // Type correct slug - button should enable
      await input.fill(slug);
      await expect(page.getByTestId('confirm-delete-button')).toBeEnabled();
    });

    test('should cancel deletion and leave project intact', async ({
      authenticatedPage: page,
    }) => {
      const { baseUrl } = await setupProjectAndNavigateToDanger(
        page,
        'delete-cancel'
      );

      await page.getByTestId('delete-project-button').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();

      // Cancel the dialog
      await dialog.getByRole('button', { name: /cancel/i }).click();
      await expect(dialog).not.toBeVisible();

      // Should still be on the danger zone page — project NOT deleted
      await expect(page.getByTestId('danger-zone-section')).toBeVisible();

      // Navigate to settings and back to danger zone — project still accessible
      await page.goto(`${baseUrl}/settings`);
      await expect(page.getByTestId('settings-tab-content')).toBeVisible();
      await page.getByTestId('nav-danger').click();
      await expect(page.getByTestId('danger-zone-section')).toBeVisible();
    });

    test('should successfully delete a project and redirect to home', async ({
      authenticatedPage: page,
    }) => {
      const { slug } = await setupProjectAndNavigateToDanger(
        page,
        'delete-final'
      );

      await page.getByTestId('delete-project-button').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();

      // Type the slug to confirm
      const input = dialog.locator('input[placeholder="Type to confirm"]');
      await input.waitFor({ state: 'visible' });
      await input.fill(slug);

      // Click confirm delete
      await page.getByTestId('confirm-delete-button').click();

      // Should navigate to home after deletion
      await expect(page).toHaveURL('/', { timeout: 10_000 });
    });
  });
});
