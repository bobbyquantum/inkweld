/**
 * Relationships Tab E2E Tests - Online Mode
 *
 * Tests that verify the relationship types management tab
 * works correctly in server mode with the real backend.
 *
 * Note: Relationship Types is now a sub-tab within Project Settings.
 * All relationship types are per-project, stored in Yjs (no backend API needed).
 */
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
  await expect(page.locator('.relationships-tab')).toBeVisible();

  // Ensure the page is settled
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to create a relationship type.
 * Returns after the type is created and visible.
 */
async function createRelationshipType(
  page: Page,
  name: string,
  inverseName: string
) {
  // Wait for the "New Type" button to be visible and stable
  const createButton = page.getByRole('button', { name: /new type/i });
  await expect(createButton).toBeVisible();
  await createButton.click();

  // Wait for the first dialog (Create Relationship Type)
  await expect(
    page.locator('app-rename-dialog h2:has-text("Create Relationship Type")')
  ).toBeVisible();

  // Fill in the forward name
  const input = page.locator('app-rename-dialog input');
  await input.clear();
  await input.fill(name);
  await page.locator('app-rename-dialog button:has-text("Rename")').click();

  // Wait for first dialog to close and second to open
  await expect(
    page.locator('app-rename-dialog h2:has-text("Inverse Label")')
  ).toBeVisible();

  // Fill in the inverse name (it's pre-filled with "name (inverse)")
  await input.clear();
  await input.fill(inverseName);
  await page.locator('app-rename-dialog button:has-text("Rename")').click();

  // Wait for dialogs to completely close
  await expect(page.locator('app-rename-dialog')).not.toBeVisible();

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
      // First create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-test-${Date.now()}`;

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Relationships Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();

      // Wait for project to load
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab (now within settings)
      const projectBaseUrl = `/${page.url().split('/').slice(3, 5).join('/')}`;
      await navigateToRelationshipsTab(page, projectBaseUrl);

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
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-details-${Date.now()}`;

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Type Details Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab (now within settings)
      const projectBaseUrl = `/${page.url().split('/').slice(3, 5).join('/')}`;
      await navigateToRelationshipsTab(page, projectBaseUrl);

      // Create a new relationship type (new projects have default types)
      await createRelationshipType(page, 'Test Parent', 'Test Child');

      // Get the first card
      const firstCard = page
        .locator('[data-testid="relationship-type-card"]')
        .first();
      await expect(firstCard).toBeVisible();

      // Should show category badge and inverse label in the compact row layout
      await expect(firstCard.locator('.type-badge')).toBeVisible();
      await expect(firstCard.locator('.type-meta')).toContainText('↔');
    });
  });

  test.describe('Create Type', () => {
    test('should create a new relationship type', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-create-${Date.now()}`;

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Create Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab (now within settings)
      const projectBaseUrl = `/${page.url().split('/').slice(3, 5).join('/')}`;
      await navigateToRelationshipsTab(page, projectBaseUrl);

      // Use helper for robust type creation
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

    test('should cancel creating a type when clicking cancel', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-cancel-${Date.now()}`;

      // Step 1: Click Next to proceed to step 2 (use default template)
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Cancel Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab (now within settings)
      const projectBaseUrl = `/${page.url().split('/').slice(3, 5).join('/')}`;
      await navigateToRelationshipsTab(page, projectBaseUrl);

      // Create a relationship type first (new projects start empty)
      await createRelationshipType(page, 'Test Type', 'Test Inverse');

      // Wait for relationship types to load and get initial count
      const typeCards = page.getByTestId('relationship-type-card');
      await typeCards.first().waitFor({ state: 'visible' });
      const initialCount = await typeCards.count();

      // Click "New Type" button
      await page.getByTestId('create-type-button').click();

      // Wait for rename dialog
      await expect(page.locator('app-rename-dialog')).toBeVisible();

      // Click cancel
      await page.locator('app-rename-dialog button:has-text("Cancel")').click();

      // Dialog should close
      await expect(page.locator('app-rename-dialog')).not.toBeVisible();

      // Type count should remain the same
      const finalCount = await typeCards.count();
      expect(finalCount).toBe(initialCount);
    });
  });

  test.describe('Edit Type', () => {
    test('should edit a relationship type name', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-edit-${Date.now()}`;

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Edit Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab (now within settings)
      const projectBaseUrl = `/${page.url().split('/').slice(3, 5).join('/')}`;
      await navigateToRelationshipsTab(page, projectBaseUrl);

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

      // Edit the name
      await expect(page.locator('app-rename-dialog')).toBeVisible();
      const renameInput = page.getByTestId('rename-input');
      await renameInput.click();
      await renameInput.fill(updatedName);
      await page.getByTestId('rename-confirm-button').click();

      // Wait for dialog to close
      await expect(page.locator('app-rename-dialog')).not.toBeVisible();

      // Should see success snackbar
      await expect(
        page.locator('.mat-mdc-snack-bar-container').filter({
          hasText: 'Updated relationship type',
        })
      ).toBeVisible();

      // Should no longer see original name in the title (using exact regex to be safe)
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: new RegExp(`^${originalName}$`) })
      ).toHaveCount(0);

      // Should see the updated name in the title
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: new RegExp(`^${updatedName}$`) })
      ).toBeVisible();
    });

    test('should allow editing types (all types are per-project)', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-builtin-${Date.now()}`;

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Built-in Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab (now within settings)
      const projectBaseUrl = `/${page.url().split('/').slice(3, 5).join('/')}`;
      await navigateToRelationshipsTab(page, projectBaseUrl);

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
  });

  test.describe('Delete Type', () => {
    test('should delete a relationship type', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-delete-${Date.now()}`;

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Delete Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab (now within settings)
      const projectBaseUrl = `/${page.url().split('/').slice(3, 5).join('/')}`;
      await navigateToRelationshipsTab(page, projectBaseUrl);

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
    test('should duplicate a type', async ({ authenticatedPage: page }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-clone-${Date.now()}`;

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Clone Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab (now within settings)
      const projectBaseUrl = `/${page.url().split('/').slice(3, 5).join('/')}`;
      await navigateToRelationshipsTab(page, projectBaseUrl);

      // Create a relationship type first (new projects start empty)
      const originalName = `Original Type ${Date.now()}`;
      const duplicateName = 'My Duplicate Type';

      await createRelationshipType(page, originalName, 'Original Inverse');

      // Find the specific card we created instead of .first()
      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: originalName });
      await expect(typeCard).toBeVisible();

      // Click duplicate directly from the row actions
      await typeCard.getByTestId('clone-type-button').click();

      // Should see Rename dialog with title "Duplicate Relationship Type"
      await expect(
        page.locator(
          'app-rename-dialog h2:has-text("Duplicate Relationship Type")'
        )
      ).toBeVisible();

      // Enter new name for the duplicate using data-testid from RenameDialog
      const input = page.getByTestId('rename-input');
      await input.clear();
      await input.fill(duplicateName);
      await page.getByTestId('rename-confirm-button').click();

      // Wait for dialog to close
      await expect(page.locator('app-rename-dialog')).not.toBeVisible();

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
});
