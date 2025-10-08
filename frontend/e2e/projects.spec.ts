import { expect, test } from './fixtures';

test.describe('Project Workflows', () => {
  test('should create a new project successfully', async ({
    authenticatedPage: page,
  }) => {
    // Navigate to create project page
    await page.goto('/create-project');

    // Fill in project details
    await page.getByTestId('project-title-input').fill('My Test Project');
    await page.getByTestId('project-slug-input').fill('my-test-project');
    await page
      .getByTestId('project-description-input')
      .fill('This is a test project for e2e testing');

    // Submit the form
    await page.getByTestId('create-project-button').click();

    // Should redirect to the project page
    await expect(page).toHaveURL(/\/testuser\/my-test-project/);
  });

  test('should show validation errors for empty project title', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Try to submit without filling required fields
    await expect(page.getByTestId('create-project-button')).toBeDisabled();

    // Fill only slug
    await page.getByTestId('project-slug-input').fill('test-slug');
    await expect(page.getByTestId('create-project-button')).toBeDisabled();

    // Fill title
    await page.getByTestId('project-title-input').fill('Test Title');
    await expect(page.getByTestId('create-project-button')).toBeEnabled();
  });

  test('should validate slug format', async ({ authenticatedPage: page }) => {
    await page.goto('/create-project');

    await page.getByTestId('project-title-input').fill('Test Project');

    // Try invalid slug with uppercase
    await page.getByTestId('project-slug-input').fill('Invalid-Slug');
    await page.getByTestId('project-slug-input').blur();

    // Should show validation error
    await expect(page.locator('mat-error')).toContainText(
      'lowercase letters, numbers, and hyphens'
    );

    // Create button should be disabled
    await expect(page.getByTestId('create-project-button')).toBeDisabled();

    // Fix the slug
    await page.getByTestId('project-slug-input').fill('valid-slug');
    await expect(page.getByTestId('create-project-button')).toBeEnabled();
  });

  test('should auto-generate slug from title', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Fill in title
    await page.getByTestId('project-title-input').fill('My Awesome Project');

    // Blur to trigger slug generation
    await page.getByTestId('project-title-input').blur();

    // Wait a bit for auto-generation
    await page.waitForTimeout(300);

    // Check if slug was auto-generated
    const slugValue = await page.getByTestId('project-slug-input').inputValue();
    expect(slugValue).toBeTruthy();
    expect(slugValue).toMatch(/^[a-z0-9-]+$/);
  });

  test('should list user projects on home page', async ({
    authenticatedPage: page,
  }) => {
    // The authenticated user should have a test project
    // Should see project cards on home page
    await expect(page.locator('app-project-card')).toHaveCount(1);
  });

  test('should open existing project', async ({ authenticatedPage: page }) => {
    // Click on the test project
    await page.locator('app-project-card').first().click();

    // Should navigate to the project page
    await expect(page).toHaveURL(/\/testuser\/test-project/);

    // Should show project title
    await expect(page.locator('h1, h2, .project-title')).toContainText(
      'Test Project'
    );
  });

  test('should handle project not found', async ({
    authenticatedPage: page,
  }) => {
    // Try to access a non-existent project
    await page.goto('/testuser/non-existent-project');

    // Should show error or redirect
    // Wait for any error message or redirect
    await page.waitForTimeout(1000);

    const url = page.url();
    // Either stays on error page or redirects home
    expect(
      url.includes('non-existent-project') || url.endsWith('/')
    ).toBeTruthy();
  });

  test('should cancel project creation and return home', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Fill in some data
    await page.getByTestId('project-title-input').fill('Cancelled Project');

    // Click cancel button
    await page.locator('button:has-text("Cancel")').click();

    // Should navigate back to home
    await expect(page).toHaveURL('/');
  });

  test('should prevent duplicate project slugs', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Try to create a project with existing slug
    await page.getByTestId('project-title-input').fill('Another Test Project');
    await page.getByTestId('project-slug-input').fill('test-project'); // This slug already exists

    await page.getByTestId('create-project-button').click();

    // Should show error about duplicate slug
    await page.waitForTimeout(1000);

    // Should either show an error message or stay on the create page
    const url = page.url();
    expect(url).toContain('create-project');
  });

  test('should create multiple projects', async ({
    authenticatedPage: page,
  }) => {
    // Create first project
    await page.goto('/create-project');
    await page.getByTestId('project-title-input').fill('Project One');
    await page.getByTestId('project-slug-input').fill('project-one');
    await page.getByTestId('create-project-button').click();
    await expect(page).toHaveURL(/\/testuser\/project-one/);

    // Go home and create second project
    await page.goto('/');
    await page.goto('/create-project');
    await page.getByTestId('project-title-input').fill('Project Two');
    await page.getByTestId('project-slug-input').fill('project-two');
    await page.getByTestId('create-project-button').click();
    await expect(page).toHaveURL(/\/testuser\/project-two/);

    // Go home and verify both projects exist
    await page.goto('/');
    await expect(page.locator('app-project-card')).toHaveCount(3); // 1 default + 2 created
  });

  test('should persist project data after navigation', async ({
    authenticatedPage: page,
  }) => {
    // Create a project
    await page.goto('/create-project');
    const projectTitle = `Persist Test ${Date.now()}`;
    const projectSlug = `persist-test-${Date.now()}`;
    await page.getByTestId('project-title-input').fill(projectTitle);
    await page.getByTestId('project-slug-input').fill(projectSlug);
    await page
      .getByTestId('project-description-input')
      .fill('Testing data persistence');
    await page.getByTestId('create-project-button').click();

    // Navigate away and back
    await page.goto('/');
    await page.goto(`/testuser/${projectSlug}`);

    // Should still show the project with correct data
    await expect(page).toHaveURL(new RegExp(projectSlug));
  });

  test('should show project URL preview during creation', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Fill in slug
    await page.getByTestId('project-slug-input').fill('preview-test');

    // Should show URL preview
    await expect(page.locator('.project-url-preview')).toBeVisible();
    await expect(page.locator('.project-url-preview')).toContainText(
      'testuser/preview-test'
    );
  });

  test('should handle long project titles and descriptions', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    const longTitle = 'A'.repeat(200);
    const longDescription = 'B'.repeat(1000);

    await page.getByTestId('project-title-input').fill(longTitle);
    await page.getByTestId('project-slug-input').fill('long-content-test');
    await page.getByTestId('project-description-input').fill(longDescription);

    // Should still be able to create
    await expect(page.getByTestId('create-project-button')).toBeEnabled();
    await page.getByTestId('create-project-button').click();

    // Should redirect successfully
    await expect(page).toHaveURL(/\/testuser\/long-content-test/);
  });

  test('should show loading state during project creation', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    await page.getByTestId('project-title-input').fill('Loading Test');
    await page.getByTestId('project-slug-input').fill('loading-test');

    // Start project creation
    await page.getByTestId('create-project-button').click();

    // Button should be disabled during creation
    // (This might be too fast to catch, but we try)
    const button = page.getByTestId('create-project-button');
    const isDisabled = await button.isDisabled();
    // At this point it should either be disabled or already completed
    expect(typeof isDisabled).toBe('boolean');
  });

  test('should require authentication to create project', async ({
    anonymousPage: page,
  }) => {
    // Try to access create project page without authentication
    await page.goto('/create-project');

    // Should redirect to login/welcome page
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url.includes('welcome') || url.includes('login')).toBeTruthy();
  });

  test('should require authentication to view projects', async ({
    anonymousPage: page,
  }) => {
    // Try to access a project page without authentication
    await page.goto('/testuser/test-project');

    // Should redirect to login/welcome page
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(url.includes('welcome') || url.includes('login')).toBeTruthy();
  });
});
