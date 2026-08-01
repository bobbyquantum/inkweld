/**
 * Project Delete from Cover Menu - Online Mode
 *
 * Verifies the "Delete project" option on the home/project list kebab menu:
 * - The delete menu item appears on owned project covers
 * - The confirmation dialog requires typing the project slug
 * - Cancelling leaves the project intact
 * - Confirming deletes the project and removes its card from the list
 *
 * IMPORTANT: These tests destroy project data, so each test creates its
 * own throwaway project and deletes it within the same test.
 */
import { generateUniqueSlug } from '../common';
import { expect, test } from './fixtures';

test.describe('Delete project from cover kebab menu', () => {
  test('delete flow: dialog, slug gating, cancel, and final deletion', async ({
    authenticatedPage: page,
  }) => {
    const slug = generateUniqueSlug('cover-delete');

    await test.step('create a throwaway project and return to home', async () => {
      await page.goto('/create-project');
      await page.getByRole('button', { name: /next/i }).click();
      await page.getByTestId('project-title-input').fill('Cover Delete Test');
      await page.getByTestId('project-slug-input').fill(slug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(slug));
      await page.waitForLoadState('networkidle');

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('project-card').first()).toBeVisible();
    });

    await test.step('kebab menu exposes a Delete option', async () => {
      // Open the kebab menu on the first project card.
      await page.locator('[data-testid="project-card-kebab"]').first().click();
      await expect(page.getByTestId('project-card-delete')).toBeVisible();
    });

    await test.step('clicking Delete opens a confirmation dialog gated on the slug', async () => {
      await page.getByTestId('project-card-delete').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      // The slug the user must type to confirm should be shown.
      await expect(dialog.getByText(new RegExp(slug)).first()).toBeVisible();

      // Confirm is disabled until the exact slug is typed.
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();

      const input = dialog.getByTestId('confirm-dialog-input');
      await input.waitFor({ state: 'visible' });
      await input.fill('wrong-slug');
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();

      await input.fill(slug);
      await expect(page.getByTestId('confirm-delete-button')).toBeEnabled();
    });

    await test.step('cancel keeps the project card on the home screen', async () => {
      await page.getByTestId('cancel-dialog-button').click();
      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).not.toBeVisible();

      // Reload to confirm the project still exists on the server.
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const cards = page.getByTestId('project-card');
      await expect(cards.first()).toBeVisible();
      const beforeCount = await cards.count();
      expect(beforeCount).toBeGreaterThan(0);
    });

    await test.step('confirming deletes the project and removes its card', async () => {
      // Re-open the kebab menu and confirm the deletion this time.
      await page.locator('[data-testid="project-card-kebab"]').first().click();
      await page.getByTestId('project-card-delete').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      const input = dialog.getByTestId('confirm-dialog-input');
      await input.waitFor({ state: 'visible' });
      await input.fill(slug);

      const beforeCount = await page.getByTestId('project-card').count();

      await page.getByTestId('confirm-delete-button').click();
      await page.waitForLoadState('networkidle');

      // The deleted project's card should no longer be present.
      await expect(page.getByTestId('project-card')).toHaveCount(
        beforeCount - 1
      );
      await expect(page.getByText('Cover Delete Test')).not.toBeVisible();
    });
  });

  test('delete option is hidden on shared (collaborated) project covers', async ({
    authenticatedPage: page,
  }) => {
    // Ensure home is loaded; collaborated projects (if any) should not expose
    // a Delete option in their kebab menu since the user does not own them.
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const cardCount = await page.getByTestId('project-card').count();
    // If there are no projects at all there is nothing to assert on; skip.
    test.skip(cardCount === 0, 'no project cards present to inspect');

    // For each card, verify that either the delete item is absent OR
    // (if present) it is an owned project. Shared cards have a shared badge.
    for (let i = 0; i < cardCount; i++) {
      const card = page.getByTestId('project-card').nth(i);
      const isShared = await card
        .locator('.shared-badge')
        .count()
        .then(c => c > 0);

      await card.locator('[data-testid="project-card-kebab"]').click();
      const deleteVisible = await page
        .getByTestId('project-card-delete')
        .isVisible()
        .catch(() => false);

      if (isShared) {
        expect(deleteVisible).toBe(false);
      }
      // Close the menu before iterating to the next card.
      await page.keyboard.press('Escape').catch(() => {});
    }
  });
});
