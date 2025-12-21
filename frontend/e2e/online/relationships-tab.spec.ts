/**
 * Relationships Tab E2E Tests - Online Mode
 *
 * Tests that verify the relationship types management tab
 * works correctly in server mode with the real backend.
 */
import { expect, test } from './fixtures';

test.describe('Relationships Tab', () => {
  test.describe('View Relationship Types', () => {
    test('should navigate to relationships tab and see built-in types', async ({
      authenticatedPage: page,
    }) => {
      // First create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-test-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Relationships Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();

      // Wait for project to load
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab
      await page.goto(
        `/${page.url().split('/').slice(3, 5).join('/')}/relationships-list`
      );

      // Wait for the tab to load
      await page.waitForSelector('.relationships-tab-container', {
        state: 'visible',
        timeout: 10000,
      });

      // Should see the header
      await expect(
        page.locator('h2:has-text("Relationship Types")')
      ).toBeVisible();

      // Should see default types section
      await expect(
        page.locator('.section-title:has-text("Default Types")')
      ).toBeVisible();

      // Should see relationship type cards
      const typeCards = page.locator('[data-testid="relationship-type-card"]');
      await expect(typeCards.first()).toBeVisible();

      // Should have multiple built-in types
      const cardCount = await typeCards.count();
      expect(cardCount).toBeGreaterThan(0);
    });

    test('should show type details on cards', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-details-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Type Details Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab
      await page.goto(
        `/${page.url().split('/').slice(3, 5).join('/')}/relationships-list`
      );
      await page.waitForSelector('.relationships-tab-container', {
        state: 'visible',
      });

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
    test.skip('should create a new custom relationship type', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-create-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Create Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab
      await page.goto(
        `/${page.url().split('/').slice(3, 5).join('/')}/relationships-list`
      );
      await page.waitForSelector('.relationships-tab-container', {
        state: 'visible',
      });

      // Click "New Type" button
      await page.getByTestId('create-type-button').click();

      // Wait for rename dialog
      await page.waitForSelector('app-rename-dialog', { state: 'visible' });

      // Enter the type name
      const nameInput = page.locator('app-rename-dialog input');
      await nameInput.fill('Nemesis of');
      await page.locator('app-rename-dialog button:has-text("Rename")').click();

      // Wait for inverse label dialog
      await page.waitForSelector('app-rename-dialog', { state: 'visible' });

      // Enter the inverse label
      await nameInput.fill('Hunted by');
      await page.locator('app-rename-dialog button:has-text("Rename")').click();

      // Should see success snackbar
      await expect(page.locator('.mat-mdc-snack-bar-container')).toContainText(
        'Created relationship type'
      );

      // Should see the new custom type in the Custom Types section
      await expect(
        page.locator('.section-title:has-text("Custom Types")')
      ).toBeVisible();
      await expect(
        page.locator('mat-card-title:has-text("Nemesis of")')
      ).toBeVisible();
    });

    test('should cancel creating a type when clicking cancel', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-cancel-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Cancel Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab
      await page.goto(
        `/${page.url().split('/').slice(3, 5).join('/')}/relationships-list`
      );
      await page.waitForSelector('.relationships-tab-container', {
        state: 'visible',
      });

      // Get initial count of custom types (may be 0)
      const customSection = page.locator(
        '.section:has(.section-title:has-text("Custom Types"))'
      );
      const hasCustomSection = await customSection
        .isVisible()
        .catch(() => false);

      // Click "New Type" button
      await page.getByTestId('create-type-button').click();

      // Wait for rename dialog
      await page.waitForSelector('app-rename-dialog', { state: 'visible' });

      // Click cancel
      await page.locator('app-rename-dialog button:has-text("Cancel")').click();

      // Dialog should close
      await expect(page.locator('app-rename-dialog')).not.toBeVisible();

      // Custom types section should not appear if it wasn't there
      if (!hasCustomSection) {
        await expect(customSection).not.toBeVisible();
      }
    });
  });

  test.describe('Edit Custom Type', () => {
    // TODO: These tests require backend API support for custom relationship types
    test.skip('should edit a custom relationship type name', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-edit-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Edit Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab
      await page.goto(
        `/${page.url().split('/').slice(3, 5).join('/')}/relationships-list`
      );
      await page.waitForSelector('.relationships-tab-container', {
        state: 'visible',
      });

      // First create a custom type
      await page.getByTestId('create-type-button').click();
      await page.waitForSelector('app-rename-dialog', { state: 'visible' });
      await page.locator('app-rename-dialog input').fill('Original Name');
      await page.locator('app-rename-dialog button:has-text("Rename")').click();
      await page.waitForSelector('app-rename-dialog', { state: 'visible' });
      await page.locator('app-rename-dialog input').fill('Original Inverse');
      await page.locator('app-rename-dialog button:has-text("Rename")').click();

      // Wait for snackbar to disappear
      await page.waitForTimeout(500);

      // Find the custom type card and open its menu
      const customCard = page.locator('.type-card.custom').first();
      await customCard.locator('[data-testid="type-menu-button"]').click();

      // Click Edit
      await page.locator('button:has-text("Edit")').click();

      // Edit the name
      await page.waitForSelector('app-rename-dialog', { state: 'visible' });
      await page.locator('app-rename-dialog input').fill('Updated Name');
      await page.locator('app-rename-dialog button:has-text("Rename")').click();

      // Should see success snackbar
      await expect(page.locator('.mat-mdc-snack-bar-container')).toContainText(
        'Updated relationship type'
      );

      // Should see the updated name
      await expect(
        page.locator('mat-card-title:has-text("Updated Name")')
      ).toBeVisible();
    });

    test('should allow editing built-in types (now per-project)', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-builtin-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Built-in Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab
      await page.goto(
        `/${page.url().split('/').slice(3, 5).join('/')}/relationships-list`
      );
      await page.waitForSelector('.relationships-tab-container', {
        state: 'visible',
      });

      // Find a built-in type card and open its menu
      const builtInCard = page.locator('.type-card.built-in').first();
      await builtInCard.locator('button[mat-icon-button]').click();

      // Wait for the menu to be visible (in CDK overlay)
      await page.waitForSelector('.mat-mdc-menu-panel', { state: 'visible' });

      // Should see Edit option (built-in types are now editable per-project)
      await expect(
        page.locator('.mat-mdc-menu-panel button:has-text("Edit")')
      ).toBeVisible();

      // Should also see Clone and Delete options
      await expect(
        page.locator('.mat-mdc-menu-panel button:has-text("Clone")')
      ).toBeVisible();
      await expect(
        page.locator('.mat-mdc-menu-panel button:has-text("Delete")')
      ).toBeVisible();
    });
  });

  test.describe('Delete Custom Type', () => {
    // TODO: These tests require backend API support for custom relationship types
    test.skip('should delete a custom relationship type', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-delete-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Delete Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab
      await page.goto(
        `/${page.url().split('/').slice(3, 5).join('/')}/relationships-list`
      );
      await page.waitForSelector('.relationships-tab-container', {
        state: 'visible',
      });

      // First create a custom type
      await page.getByTestId('create-type-button').click();
      await page.waitForSelector('app-rename-dialog', { state: 'visible' });
      await page.locator('app-rename-dialog input').fill('Type to Delete');
      await page.locator('app-rename-dialog button:has-text("Rename")').click();
      await page.waitForSelector('app-rename-dialog', { state: 'visible' });
      await page.locator('app-rename-dialog input').fill('Delete Inverse');
      await page.locator('app-rename-dialog button:has-text("Rename")').click();

      // Wait for creation to complete
      await expect(
        page.locator('mat-card-title:has-text("Type to Delete")')
      ).toBeVisible();

      // Open the menu and click Delete
      const customCard = page.locator('.type-card.custom').first();
      await customCard.locator('[data-testid="type-menu-button"]').click();
      await page.locator('[data-testid="delete-type-button"]').click();

      // Confirm deletion in dialog
      await page.waitForSelector('app-confirmation-dialog', {
        state: 'visible',
      });
      await page
        .locator('app-confirmation-dialog button:has-text("Delete")')
        .click();

      // Should see success snackbar
      await expect(page.locator('.mat-mdc-snack-bar-container')).toContainText(
        'Deleted relationship type'
      );

      // Type should be gone
      await expect(
        page.locator('mat-card-title:has-text("Type to Delete")')
      ).not.toBeVisible();
    });
  });

  test.describe('Clone Type', () => {
    test('should clone a built-in type as custom', async ({
      authenticatedPage: page,
    }) => {
      // Create a project
      await page.goto('/create-project');
      const uniqueSlug = `rel-clone-${Date.now()}`;
      await page.getByTestId('project-title-input').fill('Clone Type Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab
      await page.goto(
        `/${page.url().split('/').slice(3, 5).join('/')}/relationships-list`
      );
      await page.waitForSelector('.relationships-tab-container', {
        state: 'visible',
      });

      // Find a built-in type card and open its menu
      const builtInCard = page.locator('.type-card.built-in').first();
      await builtInCard.locator('button[mat-icon-button]').click();

      // Click "Clone as Custom"
      await page.locator('[data-testid="clone-type-button"]').click();

      // Enter new name for the clone
      await page.waitForSelector('app-rename-dialog', { state: 'visible' });
      await page.locator('app-rename-dialog input').fill('My Custom Clone');
      await page.locator('app-rename-dialog button:has-text("Rename")').click();

      // Should see success snackbar
      await expect(page.locator('.mat-mdc-snack-bar-container')).toContainText(
        'Cloned relationship type'
      );

      // Should see Custom Types section with the clone
      await expect(
        page.locator('.section-title:has-text("Custom Types")')
      ).toBeVisible();
      await expect(
        page.locator('mat-card-title:has-text("My Custom Clone")')
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
      await page.getByTestId('project-title-input').fill('Refresh Test');
      await page.getByTestId('project-slug-input').fill(uniqueSlug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(uniqueSlug));

      // Navigate to relationships tab
      await page.goto(
        `/${page.url().split('/').slice(3, 5).join('/')}/relationships-list`
      );
      await page.waitForSelector('.relationships-tab-container', {
        state: 'visible',
      });

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
