/**
 * Project Workflow Tests - Local Mode
 *
 * Tests that verify project creation, management, and navigation
 * work correctly in pure local mode without any server connection.
 */
import { expect, test } from './fixtures';

test.describe('Local Project Workflows', () => {
  test('should create a new project successfully', async ({
    localPageWithProject: page,
  }) => {
    // The fixture already creates a project, verify it exists
    await expect(page.getByTestId('project-card').first()).toBeVisible();

    // Navigate to create another project
    await page.goto('/create-project');

    // Step 1: Template selection - default template is pre-selected
    // Click Next to proceed to step 2
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Fill in project details
    await page.getByTestId('project-title-input').fill('My Second Project');
    await page.getByTestId('project-slug-input').fill('my-second-project');
    await page
      .getByTestId('project-description-input')
      .fill('A second test project');

    // Submit the form
    await page.getByTestId('create-project-button').click();

    // Should redirect to the project page
    await expect(page).toHaveURL(/\/.*\/my-second-project/);
  });

  test('should show validation errors for empty project title', async ({
    localPageWithProject: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Click Next to proceed to step 2
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Now on project details form
    // Create button should be disabled without required fields
    await expect(page.getByTestId('create-project-button')).toBeDisabled();

    // Fill only slug
    await page.getByTestId('project-slug-input').fill('test-slug');
    await expect(page.getByTestId('create-project-button')).toBeDisabled();

    // Fill title - now it should be enabled
    await page.getByTestId('project-title-input').fill('Test Title');
    await expect(page.getByTestId('create-project-button')).toBeEnabled();
  });

  test('should auto-generate slug from title', async ({
    localPageWithProject: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Click Next to proceed to step 2
    await page.getByRole('button', { name: /next/i }).click();

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

  test('should list projects on home page', async ({
    localPageWithProject: page,
  }) => {
    // The fixture creates a project, should be visible
    await expect(page.getByTestId('project-card').first()).toBeVisible();
  });

  test('should open existing project', async ({
    localPageWithProject: page,
  }) => {
    // Click on the project card
    await page.getByTestId('project-card').first().click();

    // Should navigate to project page
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Project tree should be visible
    await expect(page.getByTestId('project-tree')).toBeVisible();
  });

  test('should cancel project creation and return home', async ({
    localPageWithProject: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Click Next to proceed to step 2
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Fill in some data
    await page.getByTestId('project-title-input').fill('Cancelled Project');

    // Click the back button in the top bar (arrow_back icon)
    await page.getByLabel('Go back to home').click();

    // Should navigate back to home
    await expect(page).toHaveURL('/');
  });

  test('should persist project data in localStorage', async ({
    localPageWithProject: page,
  }) => {
    // Get current projects from localStorage (uses prefixed key in local mode)
    const projectsBefore = await page.evaluate(() => {
      return localStorage.getItem('local:inkweld-local-projects');
    });
    expect(projectsBefore).not.toBeNull();

    // Create a new project
    await page.goto('/create-project');

    // Step 1: Click Next to proceed to step 2
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Fill in project details
    const uniqueSlug = `persist-test-${Date.now()}`;
    await page.getByTestId('project-title-input').fill('Persistence Test');
    await page.getByTestId('project-slug-input').fill(uniqueSlug);
    await page.getByTestId('create-project-button').click();

    // Wait for navigation
    await page.waitForURL(new RegExp(uniqueSlug));

    // Verify project was added to localStorage (uses prefixed key)
    const projectsAfter = await page.evaluate(() => {
      return localStorage.getItem('local:inkweld-local-projects');
    });
    expect(projectsAfter).toContain(uniqueSlug);
  });

  test('should handle long project titles and descriptions', async ({
    localPageWithProject: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Click Next to proceed to step 2
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Fill in long content
    const longTitle = 'A'.repeat(100);
    const longDescription = 'B'.repeat(500);

    await page.getByTestId('project-title-input').fill(longTitle);
    await page.getByTestId('project-slug-input').fill('long-content-test');
    await page.getByTestId('project-description-input').fill(longDescription);

    // Should still be able to create
    await expect(page.getByTestId('create-project-button')).toBeEnabled();
    await page.getByTestId('create-project-button').click();

    // Should redirect successfully
    await expect(page).toHaveURL(/\/.*\/long-content-test/);
  });

  test('should show project URL preview during creation', async ({
    localPageWithProject: page,
  }) => {
    await page.goto('/create-project');

    // Step 1: Click Next to proceed to step 2
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Fill in slug
    await page.getByTestId('project-slug-input').fill('preview-test');

    // Should show URL preview
    await expect(page.getByTestId('project-url-preview')).toBeVisible();
    await expect(page.getByTestId('project-url-preview')).toContainText(
      'preview-test'
    );
  });
});
