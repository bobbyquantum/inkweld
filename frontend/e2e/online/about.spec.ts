/**
 * About Page Tests - Online Mode
 *
 * Tests that verify the About page is accessible in server mode
 * and that navigation between about and changelog works.
 */
import { expect, test } from './fixtures';

test.describe('About Page - Online', () => {
  test('should be accessible to authenticated users', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Should display the about page
    await expect(page.getByTestId('version-card')).toBeVisible();
  });

  test('should be accessible to anonymous users', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // About page should be accessible without authentication
    await expect(page.locator('h1')).toContainText('Inkweld');
  });

  test('should navigate to changelog page', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    // Click the View Changelog button (it's a <button> with routerLink, not an <a>)
    const changelogButton = page.getByRole('button', {
      name: /view changelog/i,
    });
    await changelogButton.click();

    // Should navigate to changelog route
    await expect(page).toHaveURL(/\/about\/changelog/);
  });

  test('should display changelog page content', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/about/changelog');
    await page.waitForLoadState('domcontentloaded');

    // Should display changelog heading
    await expect(page.locator('h1')).toContainText('Changelog');

    // Should show either loading state, versions, or empty message
    const content = page.locator('mat-accordion, .loading-state, .error-state');
    await expect(content.first()).toBeVisible();
  });

  test('should navigate back from changelog to about', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/about/changelog');
    await page.waitForLoadState('domcontentloaded');

    // Click the back button
    const backButton = page.locator(
      'button[aria-label="Back"], button:has(mat-icon:text("arrow_back"))'
    );
    await backButton.first().click();

    // Should navigate back (to about or home depending on history)
    await page.waitForTimeout(500);
    const url = page.url();
    expect(url).not.toMatch(/\/about\/changelog/);
  });
});
