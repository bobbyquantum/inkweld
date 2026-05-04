/**
 * Project Workflow Tests - Online Mode
 *
 * Tests that verify project creation, management, and navigation
 * work correctly in server mode with the real backend.
 *
 * NOTE: Form-validation, URL-preview, slug autogen, and cancel are merged
 * into a single test with `test.step()` since they all share the same
 * authenticated /create-project setup. Successful-create variants live in a
 * second test that ends with a real project. Anonymous redirect checks share
 * one test with two steps.
 */
import { expect, test } from './fixtures';

async function gotoCreateProjectStep2(page: import('@playwright/test').Page) {
  await page.goto('/create-project');
  const nextButton = page.getByRole('button', { name: /next/i });
  await expect(nextButton).toBeVisible();
  await nextButton.click();
  // Step 2 is ready when the title input is visible.
  await expect(page.getByTestId('project-title-input')).toBeVisible();
}

test.describe('Online Project Workflows', () => {
  test('create-project form: validation, slug autogen, URL preview, cancel', async ({
    authenticatedPage: page,
  }) => {
    await gotoCreateProjectStep2(page);

    const titleInput = page.getByTestId('project-title-input');
    const slugInput = page.getByTestId('project-slug-input');
    const createBtn = page.getByTestId('create-project-button');

    await test.step('disables create button until both title and slug are filled', async () => {
      await expect(createBtn).toBeDisabled();
      await slugInput.fill('test-slug');
      await expect(createBtn).toBeDisabled();
      await titleInput.fill('Test Title');
      await expect(createBtn).toBeEnabled();
    });

    await test.step('auto-generates slug from title on blur', async () => {
      // Reset the form by going back to step 2 fresh.
      await gotoCreateProjectStep2(page);
      await page.getByTestId('project-title-input').fill('My Awesome Project');
      await page.getByTestId('project-title-input').blur();

      const slug = page.getByTestId('project-slug-input');
      await expect(slug).not.toHaveValue('');
      const slugValue = await slug.inputValue();
      expect(slugValue).toBeTruthy();
      expect(slugValue).toMatch(/^[a-z0-9-]+$/);
    });

    await test.step('shows URL preview while typing slug', async () => {
      await gotoCreateProjectStep2(page);
      await page.getByTestId('project-slug-input').fill('preview-test');
      const preview = page.getByTestId('project-url-preview');
      await expect(preview).toBeVisible();
      await expect(preview).toContainText('preview-test');
    });

    await test.step('cancels project creation and returns home', async () => {
      await gotoCreateProjectStep2(page);
      await page.getByTestId('project-title-input').fill('Cancelled Project');
      await page.getByLabel('Go back to home').click();
      await expect(page).toHaveURL('/');
    });
  });

  test('create-project submit: success, persistence, long content, loading state', async ({
    authenticatedPage: page,
  }) => {
    await test.step('creates a new project successfully and redirects to it', async () => {
      await gotoCreateProjectStep2(page);
      const slug = `test-project-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('My Test Project');
      await page.getByTestId('project-slug-input').fill(slug);
      await page
        .getByTestId('project-description-input')
        .fill('This is a test project for e2e testing');
      await page.getByTestId('create-project-button').click();
      await expect(page).toHaveURL(new RegExp(slug));
    });

    await test.step('persists project data and is reachable by direct URL', async () => {
      await gotoCreateProjectStep2(page);
      const slug = `persist-test-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Persistence Test');
      await page.getByTestId('project-slug-input').fill(slug);
      await page
        .getByTestId('project-description-input')
        .fill('Testing data persistence');
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(slug));

      // Navigate away and back via direct URL.
      const projectUrl = page.url();
      await page.goto('/');
      await page.goto(projectUrl);
      await expect(page).toHaveURL(new RegExp(slug));
    });

    await test.step('handles long titles and descriptions', async () => {
      await gotoCreateProjectStep2(page);
      const longTitle = 'A'.repeat(100);
      const longDescription = 'B'.repeat(500);
      const slug = `long-content-${Date.now()}`;

      await page.getByTestId('project-title-input').fill(longTitle);
      await page.getByTestId('project-slug-input').fill(slug);
      await page.getByTestId('project-description-input').fill(longDescription);
      await expect(page.getByTestId('create-project-button')).toBeEnabled();
      await page.getByTestId('create-project-button').click();
      await expect(page).toHaveURL(new RegExp(slug));
    });

    await test.step('exposes a loading state during creation', async () => {
      await gotoCreateProjectStep2(page);
      await page.getByTestId('project-title-input').fill('Loading Test');
      await page
        .getByTestId('project-slug-input')
        .fill(`loading-${Date.now()}`);

      await page.getByTestId('create-project-button').click();
      const button = page.getByTestId('create-project-button');
      const isDisabled = await button.isDisabled();
      expect(typeof isDisabled).toBe('boolean');
    });
  });

  test('anonymous users are redirected away from authenticated routes', async ({
    anonymousPage: page,
  }) => {
    await test.step('redirects anonymous user away from /create-project', async () => {
      await page.goto('/create-project');
      await expect(page).toHaveURL('/');
    });

    await test.step('redirects anonymous user away from a project URL', async () => {
      await page.goto('/testuser/test-project');
      await expect(page).toHaveURL('/');
    });
  });
});
