/**
 * Relationships Tab E2E Tests - Online Mode
 *
 * Tests that verify the relationship types management tab
 * works correctly in server mode with the real backend.
 *
 * Note: Relationship Types is now a sub-tab within Project Settings.
 * All relationship types are per-project, stored in Yjs (no backend API needed).
 */
import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, type Page, test } from './fixtures';

/**
 * Helper function to navigate to the Relationships Types tab within Settings.
 * This handles the new structure where relationships is a sub-tab of settings.
 */
async function navigateToRelationshipsTab(page: Page, projectBaseUrl: string) {
  // Navigate to settings
  await page.goto(`${projectBaseUrl}/settings`);

  // Wait for settings tab content to load
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();

  // Click on the "Relationship Types" section in the sidenav
  await page.getByTestId('nav-relationships').click();

  // Wait for the relationships tab container to be visible and have content
  await expect(page.getByTestId('relationships-tab')).toBeVisible();

  // Ensure the page is settled
  await page.waitForLoadState('networkidle');
}

function getProjectBaseUrl(page: Page): string {
  const pathParts = new URL(page.url()).pathname.split('/').filter(Boolean);
  return `/${pathParts.slice(0, 2).join('/')}`;
}

async function createProjectAndOpenRelationships(
  page: Page,
  slugPrefix: string,
  title: string
): Promise<string> {
  await page.goto('/');

  const uniqueSlug = `${slugPrefix}-${Date.now()}`;
  await createProjectWithTwoSteps(page, title, uniqueSlug);

  const projectBaseUrl = getProjectBaseUrl(page);
  await navigateToRelationshipsTab(page, projectBaseUrl);
  return projectBaseUrl;
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
  await page.getByTestId('rel-name-input').fill(name);
  await page.getByTestId('rel-inverse-input').fill(inverseName);

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
  // Wait for the "New Type" button to be visible and stable
  const createButton = page.getByRole('button', { name: /new type/i });
  await expect(createButton).toBeVisible();
  await createButton.click();

  // Wait for the full editor dialog
  await expect(
    page.getByTestId('edit-relationship-type-dialog-content')
  ).toBeVisible();

  // Fill in the dialog
  await fillRelationshipTypeDialog(page, name, inverseName, options);

  // Click Create
  await page.getByTestId('rel-dialog-save').click();

  // Wait for dialog to close
  await expect(
    page.getByTestId('edit-relationship-type-dialog-content')
  ).not.toBeVisible();

  // Wait for the type card to appear
  await expect(
    page
      .getByTestId('relationship-type-title')
      .filter({ hasText: new RegExp(`^${name}$`) })
  ).toBeVisible();
}

test.describe('Relationships Tab', () => {
  test.describe('View Relationship Types', () => {
    test('should navigate to relationships tab and show default types for new project', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-test',
        'Relationships Test'
      );

      // New projects now start with default relationship types seeded from templates
      // Should see at least one relationship type card
      await expect(
        page.getByTestId('relationship-type-card').first()
      ).toBeVisible();

      // Should see the New Type button for creating additional types
      await expect(
        page.getByRole('button', { name: /new type/i })
      ).toBeVisible();
    });

    test('should show type details on cards after creating a type', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-details',
        'Type Details Test'
      );

      // Create a new relationship type (new projects have default types)
      await createRelationshipType(page, 'Test Parent', 'Test Child');

      // Get the first card
      const firstCard = page
        .locator('[data-testid="relationship-type-card"]')
        .first();
      await expect(firstCard).toBeVisible();

      // Should show category badge and inverse label in the compact row layout
      await expect(firstCard.getByTestId('type-category-badge')).toBeVisible();
      await expect(firstCard.getByTestId('type-inverse-meta')).toContainText(
        '↔'
      );
    });
  });

  test.describe('Create Type', () => {
    test('should create a new relationship type', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-create',
        'Create Type Test'
      );

      await createRelationshipType(page, 'Nemesis of', 'Hunted by');

      // Should see success snackbar
      await expect(
        page.locator('.mat-mdc-snack-bar-container').filter({
          hasText: 'Created relationship type',
        })
      ).toBeVisible();

      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: 'Nemesis of' })
      ).toBeVisible();
    });

    test('should create a type with a custom icon and color', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-icon-color',
        'Icon Color Test'
      );

      // iconIndex=2 (group), colorIndex=0 (Crimson)
      await createRelationshipType(page, 'Allied with', 'Allied by', {
        iconIndex: 2,
        colorIndex: 0,
      });

      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: 'Allied with' })
      ).toBeVisible();
    });

    test('should cancel creating a type when clicking cancel', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-cancel',
        'Cancel Type Test'
      );

      // Create a relationship type first so we have a baseline count
      await createRelationshipType(page, 'Test Type', 'Test Inverse');

      // Wait for relationship types to load and get initial count
      const typeCards = page.getByTestId('relationship-type-card');
      await typeCards.first().waitFor({ state: 'visible' });
      const initialCount = await typeCards.count();

      // Click "New Type" button
      await page.getByTestId('create-type-button').click();

      // Wait for the editor dialog
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();

      // Click cancel
      await page.getByTestId('rel-dialog-cancel').click();

      // Dialog should close
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();

      // Type count should remain the same
      const finalCount = await typeCards.count();
      expect(finalCount).toBe(initialCount);
    });

    test('should disable the save button when name is empty', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-validation',
        'Validation Test'
      );

      await page.getByTestId('create-type-button').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();

      // Save button should be disabled (name and inverse empty)
      await expect(page.getByTestId('rel-dialog-save')).toBeDisabled();

      // Fill name only — still disabled (inverse label empty)
      await page.getByTestId('rel-name-input').fill('Friend');
      await expect(page.getByTestId('rel-dialog-save')).toBeDisabled();

      // Fill inverse too — now enabled
      await page.getByTestId('rel-inverse-input').fill('Friend of');
      await expect(page.getByTestId('rel-dialog-save')).toBeEnabled();

      await page.getByTestId('rel-dialog-cancel').click();
    });
  });

  test.describe('Edit Type', () => {
    test('should edit all fields of a relationship type', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-edit',
        'Edit Type Test'
      );

      // First create a type
      const originalName = `Original Name ${Date.now()}`;
      const updatedName = `Updated Name ${Date.now()}`;
      await createRelationshipType(page, originalName, 'Original Inverse');

      // Find the type card and click edit
      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: originalName })
        .first();
      await typeCard.getByTestId('edit-type-button').click();

      // Full editor dialog should open, pre-filled with the existing type data
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();

      // Verify the name is pre-filled
      await expect(page.getByTestId('rel-name-input')).toHaveValue(
        originalName
      );

      // Change the name
      await page.getByTestId('rel-name-input').fill(updatedName);
      await page.getByTestId('rel-dialog-save').click();

      // Wait for dialog to close
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();

      // Should see success snackbar
      await expect(
        page.locator('.mat-mdc-snack-bar-container').filter({
          hasText: 'Updated relationship type',
        })
      ).toBeVisible();

      // Should see the updated name
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: new RegExp(`^${updatedName}$`) })
      ).toBeVisible();
    });

    test('should allow editing types (all types are per-project)', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-builtin',
        'Built-in Test'
      );

      // Create a relationship type first (new projects start empty)
      const typeName = `Editable Type ${Date.now()}`;
      await createRelationshipType(page, typeName, 'Editable Inverse');

      // Find the specific card and verify direct row action buttons
      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: typeName });
      await expect(typeCard).toBeVisible();
      await expect(typeCard.getByTestId('edit-type-button')).toBeVisible();
      await expect(typeCard.getByTestId('clone-type-button')).toBeVisible();
      await expect(typeCard.getByTestId('delete-type-button')).toBeVisible();
    });

    test('should cancel editing without changes', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-edit-cancel',
        'Edit Cancel Test'
      );

      const typeName = `Cancel Edit Type ${Date.now()}`;
      await createRelationshipType(page, typeName, 'Edit Inverse');

      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: typeName });
      await typeCard.getByTestId('edit-type-button').click();

      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();

      // Change the name but then cancel
      await page.getByTestId('rel-name-input').fill('Should Not Save');
      await page.getByTestId('rel-dialog-cancel').click();

      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();

      // Original name should still be visible
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: typeName })
      ).toBeVisible();
    });
  });

  test.describe('Delete Type', () => {
    test('should delete a relationship type', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-delete',
        'Delete Type Test'
      );

      // First create a type
      const deleteName = `Type to Delete ${Date.now()}`;
      await createRelationshipType(page, deleteName, 'Delete Inverse');

      // Click delete on the row
      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: deleteName })
        .first();
      await typeCard.getByTestId('delete-type-button').click();

      // Confirm deletion in dialog
      await expect(page.locator('app-confirmation-dialog')).toBeVisible();
      await page
        .locator('app-confirmation-dialog button:has-text("Delete")')
        .click();

      // Wait for dialog to close
      await expect(page.locator('app-confirmation-dialog')).not.toBeVisible();

      // Should see success snackbar
      await expect(
        page.locator('.mat-mdc-snack-bar-container').filter({
          hasText: 'Deleted relationship type',
        })
      ).toBeVisible();

      // Type should be gone
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: deleteName })
      ).not.toBeVisible();
    });
  });

  test.describe('Duplicate Type', () => {
    test('should duplicate a type via the full editor', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-clone',
        'Clone Type Test'
      );

      const originalName = `Original Type ${Date.now()}`;
      const duplicateName = 'My Duplicate Type';

      await createRelationshipType(page, originalName, 'Original Inverse');

      // Find the specific card we created
      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: originalName });
      await expect(typeCard).toBeVisible();

      // Click duplicate directly from the row actions
      await typeCard.getByTestId('clone-type-button').click();

      // Full editor dialog should open in create mode, pre-filled with "(Copy)" name
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();
      await expect(page.getByTestId('rel-name-input')).toHaveValue(
        `${originalName} (Copy)`
      );

      // Enter a new name for the duplicate
      await page.getByTestId('rel-name-input').fill(duplicateName);
      await page.getByTestId('rel-dialog-save').click();

      // Wait for dialog to close
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).not.toBeVisible();

      // Should see success snackbar for duplicating
      await expect(
        page.locator('.mat-mdc-snack-bar-container').filter({
          hasText: `Duplicated relationship type: ${duplicateName}`,
        })
      ).toBeVisible();

      // Should see the duplicated type in the list
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: new RegExp(`^${duplicateName}$`) })
      ).toBeVisible();
    });
  });

  test.describe('Endpoint schema constraints', () => {
    test('should allow selecting source/target schema constraints', async ({
      authenticatedPage: page,
    }) => {
      await createProjectAndOpenRelationships(
        page,
        'rel-schemas',
        'Schema Constraint Test'
      );

      await page.getByTestId('create-type-button').click();
      await expect(
        page.getByTestId('edit-relationship-type-dialog-content')
      ).toBeVisible();

      // Source endpoint section should be visible
      await expect(page.getByTestId('source-endpoint-section')).toBeVisible();

      // Target endpoint section should be visible
      await expect(page.getByTestId('target-endpoint-section')).toBeVisible();

      // "Any element type" toggles should be on by default
      await expect(page.getByTestId('source-any-type-toggle')).toBeVisible();
      await expect(page.getByTestId('target-any-type-toggle')).toBeVisible();

      await page.getByTestId('rel-dialog-cancel').click();
    });
  });
});
