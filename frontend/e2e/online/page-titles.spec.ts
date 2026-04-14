/**
 * Page Title Tests - Online Mode
 *
 * Verifies that browser tab titles are correctly set across
 * public pages, authenticated pages, admin pages, and dynamic
 * project pages.
 */
import { expect, test } from './fixtures';

test.describe('Page Titles - Public', () => {
  test('should show correct title on home page', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Home');
  });

  test('should show correct title on about page', async ({
    anonymousPage: page,
  }) => {
    // Mock API calls to prevent 401-triggered redirect from AuthInterceptor
    // (UserMenuComponent calls loadUnreadCount() which returns 401 for anonymous users)
    await page.route('**/api/**', route =>
      route.fulfill({
        status: 200,
        body: '{}',
        contentType: 'application/json',
      })
    );
    await page.goto('/about');

    await expect(page).toHaveTitle('About Inkweld');
  });

  test('should show correct title on changelog page', async ({
    anonymousPage: page,
  }) => {
    await page.route('**/api/**', route =>
      route.fulfill({
        status: 200,
        body: '{}',
        contentType: 'application/json',
      })
    );
    await page.goto('/about/changelog');

    await expect(page).toHaveTitle('Changelog');
  });
});

test.describe('Page Titles - Authenticated', () => {
  test('should show correct title on create project page', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveTitle('Create New Project');
  });

  test('should show correct title on account settings page', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveTitle('Account Settings');
  });

  test('should show correct title on messages page', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/messages');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveTitle('Messages');
  });
});

test.describe('Page Titles - Admin', () => {
  test('should show correct title on admin users page', async ({
    adminPage: page,
  }) => {
    await page.goto('/admin/users');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveTitle('Admin - Users');
  });

  test('should show correct title on admin settings page', async ({
    adminPage: page,
  }) => {
    await page.goto('/admin/settings');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveTitle('Admin - Settings');
  });

  test('should show correct title on admin AI providers page', async ({
    adminPage: page,
  }) => {
    await page.goto('/admin/ai-providers');
    await page.waitForLoadState('domcontentloaded');

    await expect(page).toHaveTitle('Admin - AI Providers');
  });
});

test.describe('Page Titles - Project', () => {
  test('should show project name in title after creation', async ({
    authenticatedPage: page,
  }) => {
    // Create a project via the UI
    await page.goto('/create-project');

    // Step 1: Template selection (default 'empty' is already selected)
    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.waitFor();
    await nextButton.click();

    // Step 2: Fill in project details
    const uniqueSlug = `title-test-${Date.now()}`;
    await page.getByTestId('project-title-input').fill('My Novel');
    await page.getByTestId('project-slug-input').fill(uniqueSlug);

    // Submit the form
    await page.getByTestId('create-project-button').click();

    // Wait for redirect to the project page
    await expect(page).toHaveURL(new RegExp(uniqueSlug));

    // Project title should contain the project name (format: "Inkweld – My Novel")
    await expect(page).toHaveTitle(/My Novel/);
  });

  test('should reset title when navigating away from project', async ({
    authenticatedPage: page,
  }) => {
    // Create a project first
    await page.goto('/create-project');

    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.waitFor();
    await nextButton.click();

    const uniqueSlug = `title-nav-${Date.now()}`;
    await page.getByTestId('project-title-input').fill('Title Nav Test');
    await page.getByTestId('project-slug-input').fill(uniqueSlug);
    await page.getByTestId('create-project-button').click();

    await expect(page).toHaveURL(new RegExp(uniqueSlug));
    await expect(page).toHaveTitle(/Title Nav Test/);

    // Navigate away to home
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Title should reset to the home page title
    await expect(page).toHaveTitle('Home');
  });
});
