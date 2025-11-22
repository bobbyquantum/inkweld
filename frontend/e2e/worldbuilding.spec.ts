import { expect, test } from './fixtures';

// Note: Using offlinePage instead of authenticatedPage due to server mode issues:
// - Projects API calls are timing-dependent and inconsistent
// - Schema library doesn't initialize properly
// - Worldbuilding features are local-first (Yjs) and work perfectly offline
// TODO: Fix server mode project/schema loading to enable testing against real backend

test.describe('Worldbuilding Templates', () => {
  test('should create, edit, and delete custom templates', async ({
    offlinePage: page,
  }) => {
    // Navigate to project (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    // Create a character worldbuilding element
    await page.getByTestId('add-element-button').click();
    await page.getByTestId('element-type-character').click();
    await page.getByTestId('element-name-input').fill('Test Character');
    await page.getByTestId('create-element-button').click();

    // Verify character element was created
    await expect(page.getByTestId('element-Test Character')).toBeVisible();

    // Open the character element
    await page.getByTestId('element-Test Character').click();

    // Wait for worldbuilding editor to load
    await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

    // Test template editing functionality
    await page.getByTestId('edit-template-button').click();

    // Verify template editor dialog opened
    await expect(page.getByTestId('template-editor-dialog')).toBeVisible();

    // Add a new tab
    await page.getByTestId('add-tab-button').click();
    await page.getByTestId('tab-label-input').last().fill('Appearance');

    // Add a field to the new tab
    await page.getByTestId('add-field-button').last().click();
    await page.getByTestId('field-label-input').last().fill('Height');
    await page.getByTestId('field-key-input').last().fill('height');

    // Save the template changes
    await page.getByTestId('save-template-button').click();

    // Verify dialog closed and form updated
    await expect(page.getByTestId('template-editor-dialog')).not.toBeVisible();
    await expect(page.getByRole('tab', { name: 'Appearance' })).toBeVisible();

    // Test cloning a template
    await page.getByTestId('clone-template-button').click();
    await page.getByTestId('template-name-input').fill('Hero Template');
    await page
      .getByTestId('template-description-input')
      .fill('A hero character template');
    await page.getByTestId('clone-template-confirm-button').click();

    // Verify new template was cloned
    await expect(page.getByText('Hero Template')).toBeVisible();

    // Test deleting the custom template
    await page.getByTestId('delete-template-button').click();
    await page.getByTestId('confirm-delete-button').click();

    // Verify template was deleted
    await expect(page.getByText('Hero Template')).not.toBeVisible();
  });

  test('should initialize worldbuilding elements with correct schemas', async ({
    offlinePage: page,
  }) => {
    // Navigate to project (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();

    // Create different types of worldbuilding elements
    const elementTypes = [
      { type: 'character', name: 'Test Character', expectedTab: 'Basic Info' },
      { type: 'location', name: 'Test Location', expectedTab: 'Overview' },
      { type: 'wb-item', name: 'Test Item', expectedTab: 'Properties' },
    ];

    for (const element of elementTypes) {
      // Create element
      await page.getByTestId('add-element-button').click();
      await page.getByTestId(`element-type-${element.type}`).click();
      await page.getByTestId('element-name-input').fill(element.name);
      await page.getByTestId('create-element-button').click();

      // Open element and verify schema initialization
      await page.getByTestId(`element-${element.name}`).click();
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
      await expect(
        page.getByRole('tab', { name: element.expectedTab })
      ).toBeVisible();

      // Go back to project view
      await page.getByTestId('back-to-project-button').click();
    }
  });

  test('should handle embedded template editing workflow', async ({
    offlinePage: page,
  }) => {
    // Navigate to project and create a character (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();
    await page.getByTestId('add-element-button').click();
    await page.getByTestId('element-type-character').click();
    await page.getByTestId('element-name-input').fill('Hero Character');
    await page.getByTestId('create-element-button').click();

    // Open the character
    await page.getByTestId('element-Hero Character').click();
    await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

    // Edit embedded template
    await page.getByTestId('edit-template-button').click();
    await expect(page.getByTestId('template-editor-dialog')).toBeVisible();

    // Modify the template
    await page
      .getByTestId('template-description-input')
      .fill('Updated character template');

    // Add a new field
    await page.getByTestId('add-field-button').first().click();
    await page.getByTestId('field-label-input').last().fill('Backstory');
    await page.getByTestId('field-key-input').last().fill('backstory');
    await page.getByTestId('field-type-select').last().selectOption('textarea');

    // Save changes
    await page.getByTestId('save-template-button').click();

    // Verify the form updated with new field
    await expect(page.getByTestId('template-editor-dialog')).not.toBeVisible();
    await expect(page.getByTestId('field-backstory')).toBeVisible();

    // Test that changes are persisted
    await page.reload();
    await expect(page.getByTestId('field-backstory')).toBeVisible();
  });

  test('should sync template changes across multiple clients', async ({
    offlinePage: page1,
    offlineContext: context,
  }) => {
    // Create second offline page
    const page2 = await context.newPage();
    await page2.goto('/');

    // Open same project in both clients (fixtures have already waited for projects to load and cards to be visible)
    await page1.getByTestId('project-card').first().click();
    // Wait for page2's project cards (page2 needs its own wait since it's a separate context)
    await page2.waitForSelector('[data-testid="project-card"]', {
      state: 'visible',
      timeout: 10000,
    });
    await page2.getByTestId('project-card').first().click();

    // Create character in first client
    await page1.getByTestId('add-element-button').click();
    await page1.getByTestId('element-type-character').click();
    await page1.getByTestId('element-name-input').fill('Sync Test Character');
    await page1.getByTestId('create-element-button').click();

    // Verify character appears in second client
    await expect(
      page2.getByTestId('element-Sync Test Character')
    ).toBeVisible();

    // Open character in first client and edit template
    await page1.getByTestId('element-Sync Test Character').click();
    await page1.getByTestId('edit-template-button').click();
    await page1.getByTestId('add-field-button').first().click();
    await page1.getByTestId('field-label-input').last().fill('Sync Field');
    await page1.getByTestId('field-key-input').last().fill('syncField');
    await page1.getByTestId('save-template-button').click();

    // Open character in second client and verify changes synced
    await page2.getByTestId('element-Sync Test Character').click();
    await expect(page2.getByTestId('field-syncField')).toBeVisible();
  });

  test('should validate template editor form inputs', async ({
    offlinePage: page,
  }) => {
    // Navigate to project and create a character (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();
    await page.getByTestId('add-element-button').click();
    await page.getByTestId('element-type-character').click();
    await page.getByTestId('element-name-input').fill('Validation Test');
    await page.getByTestId('create-element-button').click();

    // Open character and edit template
    await page.getByTestId('element-Validation Test').click();
    await page.getByTestId('edit-template-button').click();

    // Try to clear required fields
    await page.getByTestId('template-name-input').clear();
    await page.getByTestId('template-icon-input').clear();

    // Try to save - should fail validation
    await page.getByTestId('save-template-button').click();

    // Dialog should still be open due to validation errors
    await expect(page.getByTestId('template-editor-dialog')).toBeVisible();
    await expect(page.getByText('Template name is required')).toBeVisible();
    await expect(page.getByText('Icon is required')).toBeVisible();

    // Fix validation errors
    await page.getByTestId('template-name-input').fill('Valid Name');
    await page.getByTestId('template-icon-input').fill('person');

    // Now save should work
    await page.getByTestId('save-template-button').click();
    await expect(page.getByTestId('template-editor-dialog')).not.toBeVisible();
  });

  test('should handle icon display for custom templates', async ({
    offlinePage: page,
  }) => {
    // Navigate to project (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();

    // Create a custom template
    await page.getByTestId('template-library-button').click();
    await page.getByTestId('clone-template-button').click();
    await page.getByTestId('source-template-select').selectOption('character');
    await page.getByTestId('template-name-input').fill('Custom Hero');
    await page.getByTestId('template-icon-input').fill('star');
    await page.getByTestId('clone-template-confirm-button').click();

    // Create element using custom template
    await page.getByTestId('add-element-button').click();
    await page.getByTestId('element-type-CUSTOM_hero').click();
    await page.getByTestId('element-name-input').fill('My Hero');
    await page.getByTestId('create-element-button').click();

    // Verify custom icon is displayed in project tree
    const heroElement = page.getByTestId('element-My Hero');
    await expect(heroElement).toBeVisible();
    await expect(heroElement.locator('[data-icon="star"]')).toBeVisible();

    // Verify icon in tab when element is opened
    await heroElement.click();
    const tab = page.getByTestId('tab-My Hero');
    await expect(tab.locator('[data-icon="star"]')).toBeVisible();
  });
});
