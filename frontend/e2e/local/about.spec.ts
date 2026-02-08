/**
 * About Page Tests - Local Mode
 *
 * Tests that verify the About page renders correctly and
 * navigation works in pure local mode without any server connection.
 */
import { expect, test } from './fixtures';

test.describe('About Page', () => {
  test('should navigate to about page and display version card', async ({
    localPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Version card should be visible
    await expect(page.getByTestId('version-card')).toBeVisible();

    // Should display app name
    await expect(page.locator('h1')).toContainText('Inkweld');
  });

  test('should display key libraries card with library entries', async ({
    localPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Libraries card should be visible
    await expect(page.getByTestId('libraries-card')).toBeVisible();

    // Should list Angular as a key library
    await expect(page.getByTestId('libraries-card')).toContainText('Angular');

    // Should list Yjs as a key library
    await expect(page.getByTestId('libraries-card')).toContainText('Yjs');

    // Should list ProseMirror
    await expect(page.getByTestId('libraries-card')).toContainText(
      'ProseMirror'
    );
  });

  test('should display licenses card with view button', async ({
    localPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Licenses card should be visible
    await expect(page.getByTestId('licenses-card')).toBeVisible();

    // View licenses button should be visible
    await expect(page.getByTestId('view-licenses-button')).toBeVisible();
  });

  test('should display links card with GitHub links', async ({
    localPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Links card should be visible
    await expect(page.getByTestId('links-card')).toBeVisible();

    // Should show source code link
    await expect(page.getByTestId('links-card')).toContainText('Source Code');

    // Should show report issues link
    await expect(page.getByTestId('links-card')).toContainText('Report Issues');
  });

  test('should navigate back to home when back button is clicked', async ({
    localPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Click the back button
    await page.getByTestId('about-back-button').click();

    // Should navigate to home
    await expect(page).toHaveURL('/');
  });

  test('should display copyright with current year', async ({
    localPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    const currentYear = new Date().getFullYear().toString();

    // Copyright should contain current year
    await expect(page.getByTestId('version-card')).toContainText(currentYear);
  });

  test('should have changelog button in version card', async ({
    localPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Changelog button should be visible (it's a <button> with routerLink, not <a>)
    const changelogButton = page.getByRole('button', {
      name: /view changelog/i,
    });
    await expect(changelogButton).toBeVisible();
  });

  test('should display version number in version card subtitle', async ({
    localPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Version card should display a version string (e.g. "Version X.Y.Z")
    await expect(page.getByTestId('version-card')).toContainText(/Version \d/);
  });
});
