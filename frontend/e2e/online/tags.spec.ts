/**
 * Tags CRUD E2E Tests - Online Mode
 *
 * Tests tag creation, editing, deletion, dialog interactions, and persistence
 * within the Project Settings > Tags tab using the real backend.
 *
 * NOTE: All scenarios are exercised against a single project created once via
 * the `authenticatedPage` fixture. Each scenario lives in `test.step()` so it
 * is independently reported by Playwright while sharing the (expensive) auth +
 * project-creation setup. Steps are ordered so each one leaves the tag list in
 * a known clean state before the next runs.
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
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Find the tag row by name and return its locator */
function tagRowByName(page: Page, name: string) {
  return page
    .locator('[data-testid^="tag-row-"]')
    .filter({ hasText: name })
    .first();
}

/** Create a tag inline and assert it appears. Returns the name used. */
async function createTag(page: Page, prefix: string): Promise<string> {
  const tagName = uniqueName(prefix);
  await openTagDialog(page);
  await fillTagDialog(page, tagName, 0, 0);
  await page.getByTestId('tag-dialog-save').click();
  await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();
  await expect(tagRowByName(page, tagName)).toBeVisible();
  return tagName;
}

/** Delete a tag by name and assert it's gone. */
async function deleteTag(page: Page, name: string): Promise<void> {
  await tagRowByName(page, name)
    .locator('[data-testid="delete-tag-button"]')
    .click();
  await expect(page.getByTestId('confirm-delete-button')).toBeVisible();
  await page.getByTestId('confirm-delete-button').click();
  await expect(tagRowByName(page, name)).not.toBeVisible();
}

test.describe('Tags Tab', () => {
  test('tag CRUD lifecycle and persistence', async ({
    authenticatedPage: page,
  }) => {
    // ---- One-time setup: project + navigation to tags tab --------------------
    await page.goto('/');
    const slug = `tags-test-${Date.now()}`;
    await createProjectWithTwoSteps(page, 'Tags Test Project', slug);
    const projectBaseUrl = getProjectBaseUrl(page);
    await navigateToTagsTab(page, projectBaseUrl);

    // ---- Page rendering -----------------------------------------------------
    await test.step('renders the tags UI', async () => {
      await expect(page.getByTestId('tags-tab')).toBeVisible();
      await expect(page.getByTestId('new-tag-button')).toBeVisible();
    });

    // ---- Create -------------------------------------------------------------
    let createdTag = '';
    await test.step('creates a new tag and shows it in the list', async () => {
      createdTag = await createTag(page, 'MyTag');
      await expect(page.getByTestId('tags-list')).toBeVisible();
    });

    await test.step('cancels tag creation without adding a tag', async () => {
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

    // ---- Edit ---------------------------------------------------------------
    let editedName = '';
    await test.step('edits an existing tag name', async () => {
      const originalName = createdTag;
      await tagRowByName(page, originalName)
        .locator('[data-testid="edit-tag-button"]')
        .click();
      await expect(page.getByTestId('tag-dialog-content')).toBeVisible();

      editedName = uniqueName('RevisedName');
      const nameInput = page.getByTestId('tag-name-input');
      await nameInput.click({ force: true });
      await nameInput.fill(editedName);
      await expect(nameInput).toHaveValue(editedName);
      await expect(page.getByTestId('tag-dialog-save')).toBeEnabled();
      await page.getByTestId('tag-dialog-save').click();

      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();
      await expect(tagRowByName(page, editedName)).toBeVisible();
      await expect(tagRowByName(page, originalName)).not.toBeVisible();
    });

    await test.step('cancels editing without applying changes', async () => {
      await tagRowByName(page, editedName)
        .locator('[data-testid="edit-tag-button"]')
        .click();
      await expect(page.getByTestId('tag-dialog-content')).toBeVisible();

      await page.getByTestId('tag-name-input').fill(uniqueName('ChangedName'));
      await page.getByTestId('tag-dialog-cancel').click();

      await expect(page.getByTestId('tag-dialog-content')).not.toBeVisible();
      await expect(tagRowByName(page, editedName)).toBeVisible();
    });

    // ---- Delete -------------------------------------------------------------
    await test.step('cancels deletion when cancel is clicked', async () => {
      const tagName = await createTag(page, 'KeepMe');

      await tagRowByName(page, tagName)
        .locator('[data-testid="delete-tag-button"]')
        .click();
      await expect(page.getByTestId('confirm-delete-button')).toBeVisible();

      await page.getByTestId('cancel-dialog-button').click();
      await expect(page.getByTestId('confirm-delete-button')).not.toBeVisible();
      await expect(tagRowByName(page, tagName)).toBeVisible();

      // Cleanup so subsequent steps see a stable count.
      await deleteTag(page, tagName);
    });

    await test.step('deletes a tag after confirmation', async () => {
      const tagName = await createTag(page, 'Deletable');
      const tagCountBefore = await page
        .locator('[data-testid^="tag-row-"]')
        .count();
      await deleteTag(page, tagName);
      const tagCountAfter = await page
        .locator('[data-testid^="tag-row-"]')
        .count();
      expect(tagCountAfter).toBe(tagCountBefore - 1);
    });

    // ---- Persistence --------------------------------------------------------
    await test.step('persists tags after navigating away and back', async () => {
      const tagName = await createTag(page, 'Persistent');
      await navigateToTagsTab(page, projectBaseUrl);
      await expect(page.getByTestId('tags-list')).toBeVisible();
      await expect(tagRowByName(page, tagName)).toBeVisible();
    });
  });
});
