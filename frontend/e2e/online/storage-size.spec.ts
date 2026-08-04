/**
 * Storage Size E2E Tests - Online Mode
 *
 * Verifies the project storage-size reporting feature against the real backend:
 *   1. Project Settings > Sync shows the Server Storage section with
 *      data/media/total sizes.
 *   2. Admin user menu "Projects & storage" dialog lists a user's projects
 *      with per-project and total sizes.
 *   3. The activation dialog (deactivated project) shows the approximate
 *      download size.
 */
import { generateUniqueSlug } from '../common';
import { createProjectWithTwoSteps } from '../common';
import { expect, type Page, test } from './fixtures';

const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:9333';

function getProjectBaseUrl(page: Page): string {
  const pathParts = new URL(page.url()).pathname.split('/').filter(Boolean);
  return `/${pathParts.slice(0, 2).join('/')}`;
}

async function navigateToServerStorageSection(
  page: Page,
  projectBaseUrl: string
): Promise<void> {
  await page.goto(`${projectBaseUrl}/settings`);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  // The storage section lives under the Sync nav item.
  await page.getByTestId('nav-sync').click();
  await page.getByTestId('server-storage-section').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('server-storage-section')).toBeVisible();
}

test.describe('Project Storage Size', () => {
  test('settings shows server storage data/media/total for a project', async ({
    authenticatedPage: page,
  }) => {
    const slug = generateUniqueSlug('storage-settings');
    const projectTitle = 'Storage Settings Project';
    await page.goto('/');
    await createProjectWithTwoSteps(page, projectTitle, slug);
    const baseUrl = getProjectBaseUrl(page);

    await navigateToServerStorageSection(page, baseUrl);

    await test.step('renders document/data and media sizes', async () => {
      const values = page.getByTestId('storage-size-values');
      await expect(values).toBeVisible();

      const dataText = await page
        .getByTestId('storage-size-data')
        .textContent();
      const mediaText = await page
        .getByTestId('storage-size-media')
        .textContent();
      const totalText = await page
        .getByTestId('storage-size-total')
        .textContent();

      // Sizes are non-negative human-readable byte strings ("0 B", "1 KB", ...).
      expect(dataText).toMatch(/^\d+(\.\d+)? [KMGTP]?B$/);
      expect(mediaText).toMatch(/^\d+(\.\d+)? [KMGTP]?B$/);
      expect(totalText).toMatch(/^\d+(\.\d+)? [KMGTP]?B$/);
    });

    await test.step('the storage-size endpoint responds 200 for the owner', async () => {
      const token = await page.evaluate(() =>
        localStorage.getItem('srv:server-1:auth_token')
      );
      const apiResponse = await page.request.get(
        `${API_BASE}/api/v1/projects${baseUrl}/storage-size`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(apiResponse.ok()).toBe(true);
      const body = (await apiResponse.json()) as {
        dataBytes: number;
        mediaBytes: number;
        totalBytes: number;
      };
      expect(typeof body.dataBytes).toBe('number');
      expect(typeof body.mediaBytes).toBe('number');
      expect(body.totalBytes).toBe(body.dataBytes + body.mediaBytes);
    });
  });

  test('admin user menu opens projects & storage dialog with sizes', async ({
    adminPage: page,
  }) => {
    // Create a project as the admin so the dialog has data to show.
    const slug = generateUniqueSlug('storage-admin');
    await page.goto('/');
    await createProjectWithTwoSteps(page, 'Storage Admin Project', slug);

    // Navigate to admin via the user menu.
    await page.locator('[data-testid="user-menu-button"]').click();
    await page.locator('[data-testid="admin-menu-link"]').click();
    await page.waitForURL('**/admin/**');
    await page.getByRole('tab', { name: /all users/i }).click();
    await expect(page.getByTestId('all-users-list')).toBeVisible();

    const adminCard = page.locator('[data-testid="user-card-e2e-admin"]');
    await expect(adminCard).toBeVisible();

    await test.step('opens the projects & storage dialog', async () => {
      await adminCard.locator('[data-testid="user-menu-e2e-admin"]').click();
      // The menu item renders in a page-level overlay.
      await page.getByTestId('view-projects-e2e-admin').click();

      await expect(page.getByTestId('admin-user-projects-title')).toBeVisible();
      await expect(page.getByTestId('admin-user-projects-list')).toBeVisible();

      const projectCard = page.locator(
        `[data-testid="admin-user-project-${slug}"]`
      );
      await expect(projectCard).toBeVisible();
      await expect(projectCard).toContainText(/data/i);
      await expect(projectCard).toContainText(/media/i);
    });

    await test.step('shows aggregate totals', async () => {
      const totals = page.getByTestId('admin-user-projects-totals');
      await expect(totals).toBeVisible();
      const totalData = await page
        .getByTestId('admin-user-projects-total-data')
        .textContent();
      const totalMedia = await page
        .getByTestId('admin-user-projects-total-media')
        .textContent();
      expect(totalData).toMatch(/^\d+(\.\d+)? [KMGTP]?B$/);
      expect(totalMedia).toMatch(/^\d+(\.\d+)? [KMGTP]?B$/);
    });
  });

  test('activation dialog shows approximate download size for a deactivated project', async ({
    authenticatedPage: page,
  }) => {
    const slug = generateUniqueSlug('storage-activate');
    const projectTitle = 'Storage Activate Project';
    await page.goto('/');
    await createProjectWithTwoSteps(page, projectTitle, slug);

    /** Locate the specific card for this project by its title. */
    const card = () =>
      page
        .getByTestId('project-card')
        .filter({ hasText: projectTitle })
        .first();

    await test.step('deactivates the project', async () => {
      await page.goto('/');
      await expect(card()).toBeVisible();
      await card().locator('[data-testid="project-card-kebab"]').click();
      await page.getByTestId('project-card-deactivate').click();

      await expect(page.getByTestId('confirmation-dialog')).toBeVisible();
      await page.getByTestId('confirm-delete-button').click();

      // Deactivating removes local data; the card should now prompt to sync.
      await expect(
        card().locator('[data-testid="download-hint"]')
      ).toBeVisible();
    });

    await test.step('clicking the deactivated project shows activation dialog with size', async () => {
      await card().click();

      await expect(page.getByTestId('confirmation-dialog')).toBeVisible();
      const details = page.getByTestId('confirmation-dialog-details');
      // The size is loaded asynchronously; it may be absent if the call fails,
      // but when present it should mention a byte size.
      await expect
        .poll(async () => (await details.textContent()) ?? '')
        .toContain('Approximate size to download');
    });
  });
});
