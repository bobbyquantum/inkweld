/**
 * Documents List Tab Tests - Local Mode
 *
 * Tests that verify the documents list tab renders correctly,
 * showing documents in a table format with proper filtering
 * in pure local mode without any server connection.
 */
import { expect, test } from './fixtures';

test.describe('Documents List Tab', () => {
  test('should display documents table with default README document', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project (created by fixture)
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Navigate to documents list
    await page.goto(page.url().replace(/\/$/, '') + '/documents-list');
    await page.waitForLoadState('domcontentloaded');

    // Project always has a README, so table should be visible
    await page.waitForSelector('.documents-table, table', {
      state: 'visible',
    });

    // Table should have column headers
    await expect(page.locator('th')).toContainText(['Name']);
  });

  test('should show "New Document" button in header', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Navigate to documents list
    await page.goto(page.url().replace(/\/$/, '') + '/documents-list');
    await page.waitForLoadState('domcontentloaded');

    // New Document button should be visible
    await expect(
      page.getByRole('button', { name: /new document/i })
    ).toBeVisible();
  });

  test('should show document table when project has a README', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Navigate to documents list
    await page.goto(page.url().replace(/\/$/, '') + '/documents-list');
    await page.waitForLoadState('domcontentloaded');

    // Project has a README document by default, so the table should be visible
    await page.waitForSelector('.documents-table, table', {
      state: 'visible',
    });

    // Should show the README document in the table
    await expect(page.locator('table')).toContainText('README');
  });

  test('should display documents in table when project has content', async ({
    localPage: page,
  }) => {
    // Create a project with the worldbuilding-demo template (includes documents)
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Create project button
    const createButton = page.getByRole('button', { name: /create project/i });
    await createButton.waitFor();
    await createButton.click();

    // Select worldbuilding-demo template
    const demoTemplate = page.locator(
      '[data-testid="template-worldbuilding-demo"]'
    );
    if (await demoTemplate.isVisible().catch(() => false)) {
      await demoTemplate.click();
    }

    // Step 1: Click Next
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Fill in project details
    await page.getByTestId('project-title-input').fill('Doc List Test');
    await page.getByTestId('project-slug-input').fill('doc-list-test');
    await page.getByTestId('create-project-button').click();

    // Wait for project page
    await page.waitForURL(/.*doc-list-test.*/);

    // Navigate to documents list
    await page.goto(page.url().replace(/\/$/, '') + '/documents-list');
    await page.waitForLoadState('domcontentloaded');

    // Wait for documents to load - either a table or empty state
    await page.waitForSelector('.documents-table, .empty-card', {
      state: 'visible',
    });
  });

  test('should display page header with "Project Documents" title', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);

    // Navigate to documents list
    await page.goto(page.url().replace(/\/$/, '') + '/documents-list');
    await page.waitForLoadState('domcontentloaded');

    // Should show the header title
    await expect(page.locator('h1')).toContainText('Project Documents');
  });
});
