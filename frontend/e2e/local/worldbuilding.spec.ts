import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

/**
 * Worldbuilding Template Tests - Local Mode
 *
 * These tests verify worldbuilding functionality in pure local mode.
 * Any API requests will cause the test to fail, ensuring the feature
 * works correctly without a server connection.
 */

test.describe('Worldbuilding Templates', () => {
  test('should create a new template from scratch via Create Template button', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a character element to initialize templates
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-character-v1').click();
    await page.getByTestId('element-name-input').fill('Test Character');
    await page.getByTestId('create-element-button').click();
    await expect(page.getByTestId('element-Test Character')).toBeVisible();

    // Navigate to Settings > Element Templates
    const settingsButton = page.getByTestId('sidebar-settings-button');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await page.waitForURL(/\/settings$/);
    await expect(page.getByTestId('settings-tab-content')).toBeVisible();
    await page.getByTestId('nav-templates').click();
    await expect(page.getByTestId('template-card').first()).toBeVisible();

    // Click the Create Template button
    await page.getByTestId('create-template-button').click();

    // Wait for inline template editor to appear
    await expect(page.getByTestId('template-editor-page')).toBeVisible();

    // Fill in template details using data-testid attributes
    const nameInput = page.getByTestId('template-name-input');
    await nameInput.clear();
    await nameInput.fill('Custom Event');

    // Icon is a mat-select, so we need to click it and select an option
    // Use 'star' which is one of the available icons
    const iconSelect = page.getByTestId('template-icon-input');
    await iconSelect.click();
    await page.getByRole('option', { name: /star/ }).click();

    // Fill in description
    const descriptionInput = page.getByTestId('template-description-input');
    await descriptionInput.fill('Template for story events');

    // Save the template
    await page.getByTestId('save-template-button').click();

    // Wait for inline editor to close (returns to list view)
    await expect(page.getByTestId('template-editor-page')).not.toBeVisible();

    // Verify the new template appears in the list
    await expect(
      page.getByTestId('template-card').filter({ hasText: 'Custom Event' })
    ).toBeVisible();
  });

  test('should create, clone and delete custom templates from Templates tab', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a character worldbuilding element to initialize templates
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-character-v1').click();
    await page.getByTestId('element-name-input').fill('Test Character');
    await page.getByTestId('create-element-button').click();

    // Verify character element was created
    await expect(page.getByTestId('element-Test Character')).toBeVisible();

    // Navigate to Settings via sidebar button (preserves SPA state unlike page.goto)
    const settingsButton = page.getByTestId('sidebar-settings-button');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await page.waitForURL(/\/settings$/);

    // Wait for settings content to load
    await expect(page.getByTestId('settings-tab-content')).toBeVisible();

    // Click the Element Templates inner tab
    await page.getByTestId('nav-templates').click();

    // Wait for templates to load (use specific data-testid and first() to avoid strict mode violation)
    await expect(page.getByTestId('template-card').first()).toBeVisible();

    // Find a template card and open its menu
    const templateCards = page
      .getByTestId('template-card')
      .filter({ hasText: 'Character' });
    await templateCards.getByTestId('clone-template-button').first().click();

    // Fill in the rename dialog (clone uses a simple rename dialog)
    await page.getByLabel(/name/i).fill('Hero Template');
    await page.getByRole('button', { name: 'Rename' }).click();

    // Verify new template was cloned (scope to templates-list to avoid snackbar text collision)
    await expect(
      page.getByTestId('templates-list').getByText('Hero Template')
    ).toBeVisible();

    // Test deleting the custom template
    const heroCard = page
      .getByTestId('template-card')
      .filter({ hasText: 'Hero Template' });
    await heroCard.getByTestId('delete-template-button').click();
    await page.getByRole('button', { name: 'Delete' }).click();

    // Wait for the dialog to disappear
    await expect(
      page.getByRole('button', { name: 'Delete' })
    ).not.toBeVisible();

    // Verify template was deleted (check specifically for the card, not general text)
    await expect(
      page.getByTestId('template-card').filter({ hasText: 'Hero Template' })
    ).not.toBeVisible();
  });

  test('should initialize worldbuilding elements with correct schemas', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();

    // Wait for project to fully load
    await page.waitForLoadState('domcontentloaded');

    // Create different types of worldbuilding elements
    const elementTypes = [
      {
        type: 'character-v1',
        name: 'Test Character',
        expectedTabKey: 'basic',
      },
      { type: 'location-v1', name: 'Test Location', expectedTabKey: 'basic' },
      { type: 'wb-item-v1', name: 'Test Item', expectedTabKey: 'basic' },
    ];

    for (const element of elementTypes) {
      // Check if there's already a dialog open
      const existingDialogs = await page
        .locator('mat-dialog-container')
        .count();

      if (existingDialogs > 0) {
        await page.keyboard.press('Escape');
        await expect(page.locator('mat-dialog-container')).not.toBeVisible();
      }

      // Ensure create-new-element is visible and clickable
      const addButton = page.getByTestId('create-new-element');
      await expect(addButton).toBeVisible();

      // Create element
      await addButton.click();

      // Wait for dialog content to appear (mat-dialog-title or the search field)
      await expect(
        page.locator('mat-form-field input[matInput]')
      ).toBeVisible();

      // Wait for worldbuilding options to load (async from schema library)
      // Give more time since schemas are loaded asynchronously
      try {
        await page.waitForSelector(
          `[data-testid="element-type-${element.type}"]`
        );
      } catch {
        // Debug: capture current state of dialog
        const dialogContent = await page
          .locator('mat-dialog-content')
          .textContent();
        throw new Error(
          `Timeout waiting for element-type-${element.type}. Dialog content: ${dialogContent}`
        );
      }

      await page.getByTestId(`element-type-${element.type}`).click();
      await page.getByTestId('element-name-input').fill(element.name);
      await page.getByTestId('create-element-button').click();

      // Wait for dialog to fully close before continuing
      await expect(page.locator('mat-dialog-container')).toBeHidden();

      // Open element and verify schema initialization
      await page.getByTestId(`element-${element.name}`).click();
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

      // Verify the expected schema tab is present in the sidenav or accordion
      const sidenavTab = page.getByTestId(`nav-${element.expectedTabKey}`);
      const accordionTab = page.getByTestId(
        `accordion-${element.expectedTabKey}`
      );
      await expect(sidenavTab.or(accordionTab)).toBeVisible();

      // Go back to project view
      await page.getByTestId('toolbar-home-button').click();

      // Wait for navigation to complete
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('should validate template editor form inputs', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a character first to ensure templates are initialized
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-character-v1').click();
    await page.getByTestId('element-name-input').fill('Validation Test');
    await page.getByTestId('create-element-button').click();
    await expect(page.getByTestId('element-Validation Test')).toBeVisible();

    // Navigate to Settings via sidebar button (preserves SPA state unlike page.goto)
    const settingsButton = page.getByTestId('sidebar-settings-button');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await page.waitForURL(/\/settings$/);

    // Wait for settings content to load
    await expect(page.getByTestId('settings-tab-content')).toBeVisible();

    // Click the Element Templates inner tab
    await page.getByTestId('nav-templates').click();
    await expect(page.getByTestId('template-card').first()).toBeVisible();

    // Clone Character template
    const templateCards = page
      .getByTestId('template-card')
      .filter({ hasText: 'Character' });
    await templateCards.getByTestId('clone-template-button').first().click();
    await page.getByLabel(/name/i).fill('Test Template');
    await page.getByRole('button', { name: 'Rename' }).click();
    await expect(
      page.getByRole('button', { name: 'Rename' })
    ).not.toBeVisible();

    // Now edit the custom template
    await page
      .getByTestId('template-card')
      .filter({ hasText: 'Test Template' })
      .getByTestId('edit-template-button')
      .click();
    await expect(page.getByTestId('template-editor-page')).toBeVisible();

    // Clear the required template name field by selecting all and deleting
    // This is more reliable than .clear() for Angular reactive forms
    const nameInput = page.getByTestId('template-name-input');
    await nameInput.click();
    await nameInput.fill('');

    // Tab away to trigger validation and blur event
    await page.keyboard.press('Tab');

    // Verify the save button is disabled due to validation (use global baseline timeout)
    await expect(page.getByTestId('save-template-button')).toBeDisabled();

    // Fix validation error
    await page.getByTestId('template-name-input').fill('Valid Name');

    // Now button should be enabled and save should work
    await expect(page.getByTestId('save-template-button')).toBeEnabled();
    await page.getByTestId('save-template-button').click();
    await expect(page.getByTestId('template-editor-page')).not.toBeVisible();
  });

  test('should expose Date as a template editor field type', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-character-v1').click();
    await page.getByTestId('element-name-input').fill('Date Type Init');
    await page.getByTestId('create-element-button').click();
    await expect(page.getByTestId('element-Date Type Init')).toBeVisible();

    await page.getByTestId('sidebar-settings-button').click();
    await page.waitForURL(/\/settings$/);
    await expect(page.getByTestId('settings-tab-content')).toBeVisible();
    await page.getByTestId('nav-templates').click();
    await expect(page.getByTestId('template-card').first()).toBeVisible();

    await page
      .getByTestId('template-card')
      .filter({ hasText: 'Character' })
      .getByTestId('edit-template-button')
      .first()
      .click();
    await expect(page.getByTestId('template-editor-page')).toBeVisible();

    await page.getByTestId('add-field-button').click();
    await page.getByTestId('field-expansion-header').last().click();
    await page.getByTestId('field-type-select').last().click();
    await expect(page.getByTestId('field-type-option-date')).toBeVisible();
  });

  test('should show demo character date of birth values from the template', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(
      page,
      'Demo Dates',
      'demo-dates',
      undefined,
      'worldbuilding-demo'
    );

    await expect(page.getByTestId('project-tree')).toBeVisible();
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await charactersFolder.locator('button').first().click();

    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible();
    await elaraElement.click();
    await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

    const backgroundTab = page
      .getByTestId('nav-background')
      .or(page.getByTestId('accordion-background'));
    await expect(backgroundTab).toBeVisible();
    await backgroundTab.click();

    const dateField = page.getByTestId('field-background.dateOfBirth');
    await expect(dateField).toBeVisible();
    await expect(dateField.locator('input')).toHaveValue('1198-5-12');
  });

  test('should handle icon display for custom templates', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to project (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a character first to ensure templates are initialized
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-character-v1').click();
    await page.getByTestId('element-name-input').fill('Init Character');
    await page.getByTestId('create-element-button').click();
    await expect(page.getByTestId('element-Init Character')).toBeVisible();

    // Navigate to Settings via sidebar button (preserves SPA state unlike page.goto)
    const settingsButton = page.getByTestId('sidebar-settings-button');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await page.waitForURL(/\/settings$/);

    // Wait for settings content to load
    await expect(page.getByTestId('settings-tab-content')).toBeVisible();

    // Click the Element Templates inner tab
    await page.getByTestId('nav-templates').click();
    await expect(page.getByTestId('template-card').first()).toBeVisible();

    // Find Character template and clone it
    const templateCards = page
      .getByTestId('template-card')
      .filter({ hasText: 'Character' });
    await templateCards.getByTestId('clone-template-button').first().click();

    // Fill in the rename dialog
    await page.getByLabel(/name/i).fill('Custom Hero');

    await page.getByRole('button', { name: 'Rename' }).click();

    // Wait for template to be created (dialog closes)
    await expect(
      page.getByRole('button', { name: 'Rename' })
    ).not.toBeVisible();

    // Go back to project home to create element
    await page.getByTestId('toolbar-home-button').click();
    await expect(page.getByTestId('create-new-element')).toBeVisible();

    // Create element using custom template
    await page.getByTestId('create-new-element').click();

    // Find the custom template option by its label "Custom Hero"
    const customHeroOption = page
      .locator('.type-card')
      .filter({ hasText: 'Custom Hero' });

    // Wait for the custom template option to appear (async from schema library)
    await expect(customHeroOption).toBeVisible();

    // Get the data-testid attribute to verify it has the expected format
    const testId = await customHeroOption.getAttribute('data-testid');
    expect(testId).toMatch(/^element-type-custom-\d+$/);

    await customHeroOption.click();
    await page.getByTestId('element-name-input').fill('My Hero');
    await page.getByTestId('create-element-button').click();

    // Verify icon is displayed in project tree (cloned from Character, so should be 'person' icon)
    const heroElement = page.getByTestId('element-My Hero');
    await expect(heroElement).toBeVisible();
    await expect(
      heroElement.locator('mat-icon', { hasText: 'person' })
    ).toBeVisible();

    // Verify schema loaded correctly by checking first tab is visible
    await heroElement.click();
    const sidenavTab = page.getByTestId('nav-basic');
    const accordionTab = page.getByTestId('accordion-basic');
    await expect(sidenavTab.or(accordionTab)).toBeVisible();
  });
});
