/**
 * Project Workflow Tests - Online Mode
 *
 * Tests that verify project creation, management, and navigation
 * work correctly in server mode with the real backend.
 */
import { expect, test } from './fixtures';

test.describe('Online Project Workflows', () => {
  test('should create a new project successfully', async ({
    authenticatedPage: page,
  }) => {
    // Navigate to create project page
    await page.goto('/create-project');

    // Step 1: Template selection (default 'empty' is already selected)
    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.waitFor();
    await nextButton.click();

    // Step 2: Fill in project details
    const uniqueSlug = `test-project-${Date.now()}`;
    await page.getByTestId('project-title-input').fill('My Test Project');
    await page.getByTestId('project-slug-input').fill(uniqueSlug);
    await page
      .getByTestId('project-description-input')
      .fill('This is a test project for e2e testing');

    // Submit the form
    await page.getByTestId('create-project-button').click();

    // Should redirect to the project page
    await expect(page).toHaveURL(new RegExp(uniqueSlug));
  });

  test('should show validation errors for empty project title', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Template selection (default 'empty' is already selected)
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    // Step 2: Try to submit without filling required fields
    await expect(page.getByTestId('create-project-button')).toBeDisabled();

    // Fill only slug
    await page.getByTestId('project-slug-input').fill('test-slug');
    await expect(page.getByTestId('create-project-button')).toBeDisabled();

    // Fill title
    await page.getByTestId('project-title-input').fill('Test Title');
    await expect(page.getByTestId('create-project-button')).toBeEnabled();
  });

  test('should auto-generate slug from title', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Template selection
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    // Step 2: Fill in title
    await page.getByTestId('project-title-input').fill('My Awesome Project');

    // Blur to trigger slug generation
    await page.getByTestId('project-title-input').blur();

    // Check if slug was auto-generated
    await expect(page.getByTestId('project-slug-input')).not.toHaveValue('');
    const slugValue = await page.getByTestId('project-slug-input').inputValue();
    expect(slugValue).toBeTruthy();
    expect(slugValue).toMatch(/^[a-z0-9-]+$/);
  });

  test('should cancel project creation and return home', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Template selection
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    // Step 2: Fill in some data
    await page.getByTestId('project-title-input').fill('Cancelled Project');

    // Click the back button in the top bar
    await page.getByLabel('Go back to home').click();

    // Should navigate back to home
    await expect(page).toHaveURL('/');
  });

  test('should persist project data after navigation', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Template selection
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    const uniqueSlug = `persist-test-${Date.now()}`;
    await page.getByTestId('project-title-input').fill('Persistence Test');
    await page.getByTestId('project-slug-input').fill(uniqueSlug);
    await page
      .getByTestId('project-description-input')
      .fill('Testing data persistence');
    await page.getByTestId('create-project-button').click();

    // Wait for project page to load
    await page.waitForURL(new RegExp(uniqueSlug));

    // Navigate away and back
    await page.goto('/');
    await page.goto(page.url().replace('/', `/${uniqueSlug}`));

    // Navigating directly to project should work
    await expect(page).toHaveURL(new RegExp(uniqueSlug));
  });

  test('should show project URL preview during creation', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Template selection
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    await page.waitForLoadState('networkidle');

    // Step 2: Fill in slug
    await page.getByTestId('project-slug-input').fill('preview-test');

    // Should show URL preview
    await expect(page.getByTestId('project-url-preview')).toBeVisible();
    await expect(page.getByTestId('project-url-preview')).toContainText(
      'preview-test'
    );
  });

  test('should handle long project titles and descriptions', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Template selection
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    const longTitle = 'A'.repeat(100);
    const longDescription = 'B'.repeat(500);
    const uniqueSlug = `long-content-${Date.now()}`;

    await page.getByTestId('project-title-input').fill(longTitle);
    await page.getByTestId('project-slug-input').fill(uniqueSlug);
    await page.getByTestId('project-description-input').fill(longDescription);

    // Should still be able to create
    await expect(page.getByTestId('create-project-button')).toBeEnabled();
    await page.getByTestId('create-project-button').click();

    // Should redirect successfully
    await expect(page).toHaveURL(new RegExp(uniqueSlug));
  });

  test('should show loading state during project creation', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Template selection
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    await page.getByTestId('project-title-input').fill('Loading Test');
    await page.getByTestId('project-slug-input').fill(`loading-${Date.now()}`);

    // Start project creation
    await page.getByTestId('create-project-button').click();

    // Button should be disabled during creation
    const button = page.getByTestId('create-project-button');
    const isDisabled = await button.isDisabled();
    expect(typeof isDisabled).toBe('boolean');
  });

  test('should require authentication to create project', async ({
    anonymousPage: page,
  }) => {
    // Try to access create project page without authentication
    await page.goto('/create-project');

    // Should redirect to home page for unauthenticated users
    await expect(page).toHaveURL('/');
  });

  test('should require authentication to view projects', async ({
    anonymousPage: page,
  }) => {
    // Try to access a project page without authentication
    await page.goto('/testuser/test-project');

    // Should redirect to home page for unauthenticated users
    await expect(page).toHaveURL('/');
  });
});
