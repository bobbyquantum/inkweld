/**
 * Project Workflow Tests - Local Mode
 *
 * Tests that verify project creation, management, and navigation
 * work correctly in pure local mode without any server connection.
 *
 * Consolidated from 9 individual tests into 3 grouped tests using
 * `test.step()` to reduce repeated fixture setup. Steps that can
 * share a single visit to /create-project are grouped together.
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Navigate to /create-project and advance past the template-selection step
 * to the project-details form.
 */
async function gotoProjectDetailsForm(page: Page): Promise<void> {
  await page.goto('/create-project');
  // Step 1: template selection — default is pre-selected, just hit Next.
  await page.getByRole('button', { name: /next/i }).click();
}

test.describe('Local Project Workflows', () => {
  test('create-project form: validation, slug auto-gen, URL preview, long content acceptance', async ({
    localPageWithProject: page,
  }) => {
    await test.step('create button disabled until required fields populated', async () => {
      await gotoProjectDetailsForm(page);
      await expect(page.getByTestId('create-project-button')).toBeDisabled();

      await page.getByTestId('project-slug-input').fill('test-slug');
      await expect(page.getByTestId('create-project-button')).toBeDisabled();

      await page.getByTestId('project-title-input').fill('Test Title');
      await expect(page.getByTestId('create-project-button')).toBeEnabled();
    });

    await test.step('slug auto-generates from title on blur', async () => {
      // Re-enter the form so we can test slug auto-gen with empty slug.
      await gotoProjectDetailsForm(page);
      await page.getByTestId('project-title-input').fill('My Awesome Project');
      await page.getByTestId('project-title-input').blur();

      await expect(page.getByTestId('project-slug-input')).not.toHaveValue('');
      const slugValue = await page
        .getByTestId('project-slug-input')
        .inputValue();
      expect(slugValue).toBeTruthy();
      expect(slugValue).toMatch(/^[a-z0-9-]+$/);
    });

    await test.step('URL preview displays current slug', async () => {
      await page.getByTestId('project-slug-input').fill('preview-test');
      await expect(page.getByTestId('project-url-preview')).toBeVisible();
      await expect(page.getByTestId('project-url-preview')).toContainText(
        'preview-test'
      );
    });

    await test.step('long titles and descriptions are accepted', async () => {
      // Stay on the same form; just refill with long content.
      const longTitle = 'A'.repeat(100);
      const longDescription = 'B'.repeat(500);

      await page.getByTestId('project-title-input').fill(longTitle);
      await page.getByTestId('project-slug-input').fill('long-content-test');
      await page.getByTestId('project-description-input').fill(longDescription);

      await expect(page.getByTestId('create-project-button')).toBeEnabled();
      await page.getByTestId('create-project-button').click();
      await expect(page).toHaveURL(/\/.*\/long-content-test/);
    });
  });

  test('successful creation flows: create + persist in localStorage + cancel back to home', async ({
    localPageWithProject: page,
  }) => {
    await test.step('create a second project and redirect to its page', async () => {
      await gotoProjectDetailsForm(page);
      await page.getByTestId('project-title-input').fill('My Second Project');
      await page.getByTestId('project-slug-input').fill('my-second-project');
      await page
        .getByTestId('project-description-input')
        .fill('A second test project');

      await page.getByTestId('create-project-button').click();
      await expect(page).toHaveURL(/\/.*\/my-second-project/);
    });

    await test.step('new project persists to localStorage', async () => {
      // Initial fixture project is already in localStorage; verify the new
      // unique slug we create here also lands there.
      const projectsBefore = await page.evaluate(() =>
        localStorage.getItem('local:inkweld-local-projects')
      );
      expect(projectsBefore).not.toBeNull();

      await gotoProjectDetailsForm(page);

      const uniqueSlug = `persist-test-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Persistence Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      const projectsAfter = await page.evaluate(() =>
        localStorage.getItem('local:inkweld-local-projects')
      );
      expect(projectsAfter).toContain(uniqueSlug);
    });

    await test.step('cancel via back button returns to home', async () => {
      await gotoProjectDetailsForm(page);
      await page.getByTestId('project-title-input').fill('Cancelled Project');
      await page.getByLabel('Go back to home').click();
      await expect(page).toHaveURL('/');
    });
  });

  test('list and open existing project from home page', async ({
    localPageWithProject: page,
  }) => {
    await test.step('fixture-created project appears on home page', async () => {
      await expect(page.getByTestId('project-card').first()).toBeVisible();
    });

    await test.step('clicking a project card opens it with its tree', async () => {
      await page.getByTestId('project-card').first().click();
      await expect(page).toHaveURL(/\/.+\/.+/);
      await expect(page.getByTestId('project-tree')).toBeVisible();
    });
  });
});
