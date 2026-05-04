/**
 * Relationships Tab E2E Tests - Online Mode
 *
 * Tests that verify the relationship types management tab
 * works correctly in server mode with the real backend.
 *
 * Note: Relationship Types is now a sub-tab within Project Settings.
 * All relationship types are per-project, stored in Yjs (no backend API needed).
 *
 * NOTE: All scenarios share a single project + auth setup. Each scenario lives
 * in `test.step()` for independent reporting. Steps are ordered so types
 * created earlier remain available for later steps unless explicitly removed.
 */
import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, type Page, test } from './fixtures';

/**
 * Helper function to navigate to the Relationships Types tab within Settings.
 * This handles the new structure where relationships is a sub-tab of settings.
 */
async function navigateToRelationshipsTab(page: Page, projectBaseUrl: string) {
  await page.goto(`${projectBaseUrl}/settings`);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  await page.getByTestId('nav-relationships').click();
  await expect(page.getByTestId('relationships-tab')).toBeVisible();
  await page.waitForLoadState('networkidle');
}

function getProjectBaseUrl(page: Page): string {
  const pathParts = new URL(page.url()).pathname.split('/').filter(Boolean);
  return `/${pathParts.slice(0, 2).join('/')}`;
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Helper to fill the new full relationship type editor dialog.
 * Opens from the "New Type" button and fills in name + inverse label.
 * Optional: iconIndex (0-based) and colorIndex (0-based) select icon/color.
 */
async function fillRelationshipTypeDialog(
  page: Page,
  name: string,
  inverseName: string,
  options?: { iconIndex?: number; colorIndex?: number }
) {
  const nameInput = page.getByTestId('rel-name-input');
  await nameInput.focus();
  await nameInput.fill(name);
  await expect(nameInput).toHaveValue(name);

  const inverseInput = page.getByTestId('rel-inverse-input');
  await inverseInput.focus();
  await inverseInput.fill(inverseName);
  await expect(inverseInput).toHaveValue(inverseName);

  if (options?.iconIndex !== undefined) {
    await page.getByTestId(`rel-icon-option-${options.iconIndex}`).click();
  }
  if (options?.colorIndex !== undefined) {
    await page.getByTestId(`rel-color-option-${options.colorIndex}`).click();
  }
}

/**
 * Helper to create a relationship type using the full editor dialog.
 * Returns after the type is created and visible.
 */
async function createRelationshipType(
  page: Page,
  name: string,
  inverseName: string,
  options?: { iconIndex?: number; colorIndex?: number }
) {
  const createButton = page.getByRole('button', { name: /new type/i });
  await expect(createButton).toBeVisible();
  await createButton.click();

  await expect(
    page.getByTestId('edit-relationship-type-dialog-content')
  ).toBeVisible();

  await fillRelationshipTypeDialog(page, name, inverseName, options);

  const saveButton = page.getByTestId('rel-dialog-save');
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect(
    page.getByTestId('edit-relationship-type-dialog-content')
  ).not.toBeVisible();

  await expect(
    page
      .getByTestId('relationship-type-title')
      .filter({ hasText: new RegExp(`^${name}$`) })
  ).toBeVisible();
}

test.describe('Relationships Tab', () => {
  test('relationship types CRUD lifecycle, validation, and constraints', async ({
    authenticatedPage: page,
  }) => {
    // ---- One-time setup: project + navigation -------------------------------
    await page.goto('/');
    const slug = `rel-test-${Date.now()}`;
    await createProjectWithTwoSteps(page, 'Relationships Test', slug);
    const projectBaseUrl = getProjectBaseUrl(page);
    await navigateToRelationshipsTab(page, projectBaseUrl);

    // ---- View ---------------------------------------------------------------
    await test.step('renders default types and the New Type button for a new project', async () => {
      await expect(
        page.getByTestId('relationship-type-card').first()
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /new type/i })
      ).toBeVisible();
    });

    // ---- Create -------------------------------------------------------------
    const createdName = uniqueName('Nemesis of');
    await test.step('creates a new relationship type and shows snackbar', async () => {
      await createRelationshipType(page, createdName, 'Hunted by');
      await expect(
        page
          .locator('.mat-mdc-snack-bar-container')
          .filter({ hasText: 'Created relationship type' })
      ).toBeVisible();
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: new RegExp(`^${createdName}$`) })
      ).toBeVisible();
    });

    await test.step('shows type details (category badge + inverse meta) on cards', async () => {
      const card = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: createdName })
        .first();
      await expect(card).toBeVisible();
      await expect(card.getByTestId('type-category-badge')).toBeVisible();
      await expect(card.getByTestId('type-inverse-meta')).toContainText('↔');
    });

    await test.step('creates a type with a custom icon and color', async () => {
      const name = uniqueName('Allied with');
      // iconIndex=2 (group), colorIndex=0 (Crimson)
      await createRelationshipType(page, name, 'Allied by', {
        iconIndex: 2,
        colorIndex: 0,
      });
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: new RegExp(`^${name}$`) })
      ).toBeVisible();
    });

    await test.step('cancels creating a type when clicking cancel', async () => {
      const typeCards = page.getByTestId('relationship-type-card');
      await typeCards.first().waitFor({ state: 'visible' });
      const initialCount = await typeCards.count();

      await page.getByTestId('create-type-button').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();

      await page.getByTestId('rel-dialog-cancel').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();

      const finalCount = await typeCards.count();
      expect(finalCount).toBe(initialCount);
    });

    await test.step('disables save button when name or inverse is empty', async () => {
      await page.getByTestId('create-type-button').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();

      await expect(page.getByTestId('rel-dialog-save')).toBeDisabled();

      const nameInput = page.getByTestId('rel-name-input');
      await nameInput.focus();
      await nameInput.fill('Friend');
      await expect(nameInput).toHaveValue('Friend');
      await expect(page.getByTestId('rel-dialog-save')).toBeDisabled();

      const inverseInput = page.getByTestId('rel-inverse-input');
      await inverseInput.focus();
      await inverseInput.fill('Friend of');
      await expect(inverseInput).toHaveValue('Friend of');
      await expect(page.getByTestId('rel-dialog-save')).toBeEnabled();

      await page.getByTestId('rel-dialog-cancel').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();
    });

    // ---- Edit ---------------------------------------------------------------
    await test.step('edits all fields of a relationship type', async () => {
      const originalName = uniqueName('Original Name');
      const updatedName = uniqueName('Updated Name');
      await createRelationshipType(page, originalName, 'Original Inverse');

      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: originalName })
        .first();
      await typeCard.getByTestId('edit-type-button').click();

      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();
      await expect(page.getByTestId('rel-name-input')).toHaveValue(
        originalName
      );

      const nameInput = page.getByTestId('rel-name-input');
      await nameInput.focus();
      await nameInput.fill(updatedName);
      await expect(nameInput).toHaveValue(updatedName);
      const saveButton = page.getByTestId('rel-dialog-save');
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();
      await expect(
        page
          .locator('.mat-mdc-snack-bar-container')
          .filter({ hasText: 'Updated relationship type' })
      ).toBeVisible();
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: new RegExp(`^${updatedName}$`) })
      ).toBeVisible();
    });

    await test.step('exposes per-project edit/clone/delete actions on each type', async () => {
      const typeName = uniqueName('Editable Type');
      await createRelationshipType(page, typeName, 'Editable Inverse');

      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: typeName });
      await expect(typeCard).toBeVisible();
      await expect(typeCard.getByTestId('edit-type-button')).toBeVisible();
      await expect(typeCard.getByTestId('clone-type-button')).toBeVisible();
      await expect(typeCard.getByTestId('delete-type-button')).toBeVisible();
    });

    await test.step('cancels editing without applying changes', async () => {
      const typeName = uniqueName('Cancel Edit Type');
      await createRelationshipType(page, typeName, 'Edit Inverse');

      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: typeName });
      await typeCard.getByTestId('edit-type-button').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();

      await page.getByTestId('rel-name-input').fill('Should Not Save');
      await page.getByTestId('rel-dialog-cancel').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();

      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: typeName })
      ).toBeVisible();
    });

    // ---- Duplicate ----------------------------------------------------------
    await test.step('duplicates a type via the full editor', async () => {
      const originalName = uniqueName('Original Type');
      const duplicateName = uniqueName('My Duplicate Type');

      await createRelationshipType(page, originalName, 'Original Inverse');

      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: originalName });
      await expect(typeCard).toBeVisible();
      await typeCard.getByTestId('clone-type-button').click();

      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();
      await expect(page.getByTestId('rel-name-input')).toHaveValue(
        `${originalName} (Copy)`
      );

      const nameInput = page.getByTestId('rel-name-input');
      await nameInput.focus();
      await nameInput.fill(duplicateName);
      await expect(nameInput).toHaveValue(duplicateName);
      const saveButton = page.getByTestId('rel-dialog-save');
      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();
      await expect(
        page
          .locator('.mat-mdc-snack-bar-container')
          .filter({ hasText: `Duplicated relationship type: ${duplicateName}` })
      ).toBeVisible();
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: new RegExp(`^${duplicateName}$`) })
      ).toBeVisible();
    });

    // ---- Endpoint schema constraints ---------------------------------------
    await test.step('shows source/target schema constraint sections in editor', async () => {
      await page.getByTestId('create-type-button').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();

      await expect(page.getByTestId('source-endpoint-section')).toBeVisible();
      await expect(page.getByTestId('target-endpoint-section')).toBeVisible();
      await expect(page.getByTestId('source-any-type-toggle')).toBeVisible();
      await expect(page.getByTestId('target-any-type-toggle')).toBeVisible();

      await page.getByTestId('rel-dialog-cancel').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();
    });

    // ---- Delete (last, since it removes a type) -----------------------------
    await test.step('deletes a relationship type', async () => {
      const deleteName = uniqueName('Type to Delete');
      await createRelationshipType(page, deleteName, 'Delete Inverse');

      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: deleteName })
        .first();
      await typeCard.getByTestId('delete-type-button').click();

      await expect(page.locator('app-confirmation-dialog')).toBeVisible();
      await page
        .locator('app-confirmation-dialog button:has-text("Delete")')
        .click();
      await expect(page.locator('app-confirmation-dialog')).not.toBeVisible();

      await expect(
        page
          .locator('.mat-mdc-snack-bar-container')
          .filter({ hasText: 'Deleted relationship type' })
      ).toBeVisible();
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: deleteName })
      ).not.toBeVisible();
    });
  });
});
