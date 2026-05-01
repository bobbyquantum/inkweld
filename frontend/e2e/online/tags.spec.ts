/**
 * Tags CRUD E2E Tests - Online Mode
 *
 * Tests tag creation, editing, deletion, dialog interactions, and persistence
 * within the Project Settings > Tags tab using the real backend.
 */
import {
  createProjectWithTwoSteps,
  fillTagDialog,
  openTagDialog,
} from '../common/test-helpers';
import { expect, type Page, test } from './fixtures';

function getProjectBaseUrl(page: Page): string {
  const pathParts = new URL(page.url()).pathname.split('/').filter(Boolean);
  return `/${pathParts.slice(0, 2).join('/')}`;
}

async function navigateToTagsTab(
  page: Page,
  projectBaseUrl: string
): Promise<void> {
  await page.goto(`${projectBaseUrl}/settings`);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  await page.getByTestId('nav-tags').click();
  await expect(page.getByTestId('tags-tab')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

/** Find the tag row by name and return its locator */
function tagRowByName(page: Page, name: string) {
  return page
    .locator('[data-testid^="tag-row-"]')
    .filter({ hasText: name })
    .first();
}

async function setupProjectAndNavigate(page: Page): Promise<string> {
  await page.goto('/');
  const uniqueSlug = `tags-test-${Date.now()}`;
  await createProjectWithTwoSteps(page, 'Tags Test Project', uniqueSlug);
  const projectBaseUrl = getProjectBaseUrl(page);
  await navigateToTagsTab(page, projectBaseUrl);
  return projectBaseUrl;
}

test.describe('Tags Tab', () => {
  test.describe('Page Rendering', () => {
    test('should navigate to tags tab and show the tags UI', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigate(page);
      await expect(page.getByTestId('tags-tab')).toBeVisible();
      await expect(page.getByTestId('new-tag-button')).toBeVisible();
    });
  });

  test.describe('Create Tag', () => {
    test('should create a new tag and show it in the list', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigate(page);

      const tagName = uniqueName('MyTag');

      await openTagDialog(page);
      await fillTagDialog(page, tagName, 0, 2);
      await page.getByTestId('tag-dialog-save').click();

      // Dialog should close
      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();

      // Tag should appear in the list
      await expect(page.getByTestId('tags-list')).toBeVisible();
      await expect(tagRowByName(page, tagName)).toBeVisible();
    });

    test('should cancel tag creation without adding a tag', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigate(page);

      const initialCount = await page
        .locator('[data-testid^="tag-row-"]')
        .count();

      await openTagDialog(page);
      await fillTagDialog(page, uniqueName('CancelledTag'), 1, 3);
      await page.getByTestId('tag-dialog-cancel').click();

      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();
      const finalCount = await page
        .locator('[data-testid^="tag-row-"]')
        .count();
      expect(finalCount).toBe(initialCount);
    });
  });

  test.describe('Edit Tag', () => {
    test('should edit an existing tag name', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigate(page);

      const originalName = uniqueName('OriginalName');
      await openTagDialog(page);
      await fillTagDialog(page, originalName, 0, 0);
      await page.getByTestId('tag-dialog-save').click();
      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();

      // Find and click edit on the tag we just created
      await tagRowByName(page, originalName)
        .locator('[data-testid="edit-tag-button"]')
        .click();
      await expect(page.getByTestId('tag-dialog-content')).toBeVisible();

      const newName = uniqueName('RevisedName');
      const nameInput = page.getByTestId('tag-name-input');
      await nameInput.click();
      await nameInput.fill('');
      await nameInput.fill(newName);
      // Wait for Angular to process the model change
      await page.waitForTimeout(300);
      await page.getByTestId('tag-dialog-save').click();

      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();
      await expect(tagRowByName(page, newName)).toBeVisible();
      await expect(tagRowByName(page, originalName)).not.toBeVisible();
    });

    test('should cancel editing without applying changes', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigate(page);

      const originalName = uniqueName('KeepName');
      await openTagDialog(page);
      await fillTagDialog(page, originalName, 0, 0);
      await page.getByTestId('tag-dialog-save').click();
      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();

      await tagRowByName(page, originalName)
        .locator('[data-testid="edit-tag-button"]')
        .click();
      await expect(page.getByTestId('tag-dialog-content')).toBeVisible();

      await page.getByTestId('tag-name-input').fill(uniqueName('ChangedName'));
      await page.getByTestId('tag-dialog-cancel').click();

      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();
      await expect(tagRowByName(page, originalName)).toBeVisible();
    });
  });

  test.describe('Delete Tag', () => {
    test('should delete a tag after confirmation', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigate(page);

      const tagName = uniqueName('Deletable');
      await openTagDialog(page);
      await fillTagDialog(page, tagName, 0, 0);
      await page.getByTestId('tag-dialog-save').click();
      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();
      await expect(tagRowByName(page, tagName)).toBeVisible();

      const tagCountBefore = await page
        .locator('[data-testid^="tag-row-"]')
        .count();

      await tagRowByName(page, tagName)
        .locator('[data-testid="delete-tag-button"]')
        .click();

      await expect(page.getByTestId('confirm-delete-button')).toBeVisible();
      await page.getByTestId('confirm-delete-button').click();

      await expect(tagRowByName(page, tagName)).not.toBeVisible();
      const tagCountAfter = await page
        .locator('[data-testid^="tag-row-"]')
        .count();
      expect(tagCountAfter).toBe(tagCountBefore - 1);
    });

    test('should cancel deletion when cancel is clicked', async ({
      authenticatedPage: page,
    }) => {
      await setupProjectAndNavigate(page);

      const tagName = uniqueName('KeepMe');
      await openTagDialog(page);
      await fillTagDialog(page, tagName, 0, 0);
      await page.getByTestId('tag-dialog-save').click();
      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();

      await tagRowByName(page, tagName)
        .locator('[data-testid="delete-tag-button"]')
        .click();

      await expect(page.getByTestId('confirm-delete-button')).toBeVisible();

      const dialog = page.locator('mat-dialog-container');
      await dialog.getByRole('button', { name: /cancel/i }).click();

      await expect(tagRowByName(page, tagName)).toBeVisible();
    });
  });

  test.describe('Persistence', () => {
    test('should persist tags after page reload', async ({
      authenticatedPage: page,
    }) => {
      const projectBaseUrl = await setupProjectAndNavigate(page);

      const tagName = uniqueName('Persistent');
      await openTagDialog(page);
      await fillTagDialog(page, tagName, 0, 0);
      await page.getByTestId('tag-dialog-save').click();
      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();
      await expect(tagRowByName(page, tagName)).toBeVisible();

      // Reload and navigate back to tags
      await navigateToTagsTab(page, projectBaseUrl);

      await expect(page.getByTestId('tags-list')).toBeVisible();
      await expect(tagRowByName(page, tagName)).toBeVisible();
    });
  });
});
