/**
 * Relationships Tab E2E Tests - Online Mode
 *
 * Tests that verify the relationship types management tab
 * works correctly in server mode with the real backend.
 *
 * Note: Relationship Types is now a sub-tab within Project Settings.
 * New projects start with default relationship types seeded from templates.
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

  // Click on the "Relationship Types" tab within the mat-tab-group
  const tab = page.getByRole('tab', { name: 'Relationship Types' });
  await expect(tab).toBeVisible();
  await tab.click();

  // Wait for the relationships tab container to be visible and have content
  await expect(page.locator('.relationships-tab-container')).toBeVisible();

  // Ensure the page is settled
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to create a custom relationship type from the empty state.
 * Returns after the type is created and visible.
 */
async function createCustomRelationshipType(
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
      // Should see the Custom Types section with relationship type cards
      await expect(page.locator('h3:has-text("Custom Types")')).toBeVisible();

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
      await createCustomRelationshipType(page, 'Test Parent', 'Test Child');

      // Get the first card
      const firstCard = page
        .locator('[data-testid="relationship-type-card"]')
        .first();
      await expect(firstCard).toBeVisible();

      // Should show forward label
      await expect(
        firstCard.locator('.detail-row:has-text("Forward:")')
      ).toBeVisible();

      // Should show inverse label
      await expect(
        firstCard.locator('.detail-row:has-text("Inverse:")')
      ).toBeVisible();

      // Should show source constraints
      await expect(
        firstCard.locator('.detail-row:has-text("Source:")')
      ).toBeVisible();

      // Should show target constraints
      await expect(
        firstCard.locator('.detail-row:has-text("Target:")')
      ).toBeVisible();
    });
  });

  test.describe('Create Custom Type', () => {
    // TODO: These tests require backend API support for custom relationship types
    // Skip until backend endpoints are implemented
    test('should create a new custom relationship type', async ({
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
      await createCustomRelationshipType(page, 'Nemesis of', 'Hunted by');

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
      await createCustomRelationshipType(page, 'Test Type', 'Test Inverse');

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

  test.describe('Edit Custom Type', () => {
    // TODO: These tests require backend API support for custom relationship types
    test('should edit a custom relationship type name', async ({
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

      // First create a custom type
      const originalName = `Original Name ${Date.now()}`;
      const updatedName = `Updated Name ${Date.now()}`;
      await createCustomRelationshipType(
        page,
        originalName,
        'Original Inverse'
      );

      // Find the custom type card and open its menu
      const customCard = page
        .locator('.type-card.custom')
        .filter({ hasText: originalName })
        .first();
      await customCard.locator('[data-testid="type-menu-button"]').click();

      // Click Edit
      await page.locator('button:has-text("Edit")').click();

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
      await createCustomRelationshipType(page, typeName, 'Editable Inverse');

      // Find the specific card and open its menu
      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: typeName });
      await expect(typeCard).toBeVisible();
      await typeCard.getByTestId('type-menu-button').click();

      // Wait for the menu to be visible (in CDK overlay)
      const menu = page.locator('.mat-mdc-menu-panel');
      await expect(menu).toBeVisible();

      // Should see Edit option (all types are now editable per-project)
      await expect(menu.locator('button:has-text("Edit")')).toBeVisible();

      // Should also see Clone and Delete options
      await expect(menu.locator('button:has-text("Clone")')).toBeVisible();
      await expect(menu.locator('button:has-text("Delete")')).toBeVisible();
    });
  });

  test.describe('Delete Custom Type', () => {
    // TODO: These tests require backend API support for custom relationship types
    test('should delete a custom relationship type', async ({
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

      // First create a custom type
      const deleteName = `Type to Delete ${Date.now()}`;
      await createCustomRelationshipType(page, deleteName, 'Delete Inverse');

      // Open the menu and click Delete
      const customCard = page
        .locator('.type-card.custom')
        .filter({ hasText: deleteName })
        .first();
      await customCard.locator('[data-testid="type-menu-button"]').click();
      await page.locator('[data-testid="delete-type-button"]').click();

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

  test.describe('Clone Type', () => {
    test('should clone a type', async ({ authenticatedPage: page }) => {
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
      const cloneName = 'My Custom Clone';

      await createCustomRelationshipType(
        page,
        originalName,
        'Original Inverse'
      );

      // Find the specific card we created instead of .first()
      const typeCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: originalName });
      await expect(typeCard).toBeVisible();

      // Open its menu using the data-testid I added
      await typeCard.getByTestId('type-menu-button').click();

      // Wait for the menu to be visible (in CDK overlay)
      const menu = page.locator('.mat-mdc-menu-panel');
      await expect(menu).toBeVisible();

      // Click "Clone" - it's a menu item, not a testid button
      await menu.locator('button:has-text("Clone")').click();

      // Should see Rename dialog with title "Clone Relationship Type"
      await expect(
        page.locator('app-rename-dialog h2:has-text("Clone Relationship Type")')
      ).toBeVisible();

      // Enter new name for the clone using data-testid from RenameDialog
      const input = page.getByTestId('rename-input');
      await input.clear();
      await input.fill(cloneName);
      await page.getByTestId('rename-confirm-button').click();

      // Wait for dialog to close
      await expect(page.locator('app-rename-dialog')).not.toBeVisible();

      // Should see success snackbar for cloning
      await expect(
        page.locator('simple-snack-bar').filter({
          hasText: `Cloned relationship type: ${cloneName}`,
        })
      ).toBeVisible();

      // Should see the cloned type in the list
      await expect(
        page
          .getByTestId('relationship-type-title')
          .filter({ hasText: new RegExp(`^${cloneName}$`) })
      ).toBeVisible();
    });
  });

  test.describe('Refresh', () => {
    test('should refresh the relationship types list', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-refresh-${Date.now()}`;

      // Step 1: Click Next to proceed to step 2
      await page.getByRole('button', { name: /next/i }).click();

      // Step 2: Fill in project details
      await page.getByTestId('project-title-input').fill('Refresh Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab (now within settings)
      const projectBaseUrl = `/${page.url().split('/').slice(3, 5).join('/')}`;
      await navigateToRelationshipsTab(page, projectBaseUrl);

      // Create a relationship type first (new projects start empty)
      await createCustomRelationshipType(
        page,
        'Refresh Type',
        'Refresh Inverse'
      );

      // Click refresh button
      await page
        .locator('button[mattooltip="Refresh relationship types"]')
        .click();

      // Should still see relationship types
      await expect(
        page.locator('[data-testid="relationship-type-card"]').first()
      ).toBeVisible();
    });
  });
});
