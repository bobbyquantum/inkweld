import { expect, test } from './fixtures';

/**
 * Worldbuilding Template Tests - Offline Mode
 *
 * These tests verify worldbuilding functionality in pure offline mode.
 * Any API requests will cause the test to fail, ensuring the feature
 * works correctly without a server connection.
 */

test.describe('Worldbuilding Templates', () => {
  test('should create, clone and delete custom templates from Templates tab', async ({
    offlinePageWithProject: page,
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

    // Navigate to Templates tab to access clone functionality
    await page.getByTestId('toolbar-home-button').click();
    await page.getByTestId('sidebar-templates-button').click();

    // Wait for templates to load
    await page.waitForTimeout(500);

    // Find a template card and open its menu
    const templateCards = page
      .locator('mat-card')
      .filter({ hasText: 'Character' });
    await templateCards
      .locator('button[aria-label="Template actions"]')
      .first()
      .click();

    // Click clone from the menu
    await page.getByTestId('clone-template-button').click();

    // Fill in the rename dialog (clone uses a simple rename dialog)
    await page.getByLabel(/name/i).fill('Hero Template');
    await page.getByRole('button', { name: 'Rename' }).click();

    // Verify new template was cloned
    await expect(page.getByText('Hero Template')).toBeVisible();

    // Test deleting the custom template
    const heroCard = page
      .locator('mat-card')
      .filter({ hasText: 'Hero Template' });
    await heroCard.locator('button[aria-label="Template actions"]').click();
    await page.getByTestId('delete-template-button').click();
    await page.getByRole('button', { name: 'Delete' }).click();

    // Wait for the dialog and snackbar to disappear
    await page.waitForTimeout(500);

    // Verify template was deleted (check specifically for the card, not general text)
    await expect(
      page.locator('mat-card').filter({ hasText: 'Hero Template' })
    ).not.toBeVisible();
  });

  test('should initialize worldbuilding elements with correct schemas', async ({
    offlinePageWithProject: page,
  }) => {
    // Navigate to project (fixture has already waited for projects to load and cards to be visible)
    await page.getByTestId('project-card').first().click();

    // Wait for project to fully load
    await page.waitForLoadState('networkidle');

    // Create different types of worldbuilding elements
    const elementTypes = [
      {
        type: 'character-v1',
        name: 'Test Character',
        expectedTab: 'Basic Info',
      },
      { type: 'location-v1', name: 'Test Location', expectedTab: 'Overview' },
      { type: 'wb-item-v1', name: 'Test Item', expectedTab: 'Properties' },
    ];

    for (const element of elementTypes) {
      console.log(`Creating element of type: ${element.type}`);

      // Check if there's already a dialog open
      const existingDialogs = await page
        .locator('mat-dialog-container')
        .count();
      console.log(`Existing dialogs: ${existingDialogs}`);
      if (existingDialogs > 0) {
        console.log('Closing existing dialog...');
        await page.keyboard.press('Escape');
        await page.waitForSelector('mat-dialog-container', {
          state: 'detached',
          timeout: 5000,
        });
      }

      // Ensure create-new-element is visible and clickable
      const addButton = page.getByTestId('create-new-element');
      await addButton.waitFor({ state: 'visible', timeout: 5000 });
      console.log('Add button is visible, clicking...');

      // Create element
      await addButton.click();
      console.log('Add button clicked');

      // Wait a moment for any async operations
      await page.waitForTimeout(500);

      // Check dialog count after click
      const dialogCountAfterClick = await page
        .locator('mat-dialog-container')
        .count();
      console.log(`Dialogs after click: ${dialogCountAfterClick}`);

      // Wait for dialog content to appear (mat-dialog-title or the search field)
      try {
        await page.waitForSelector('mat-form-field input[matInput]', {
          state: 'visible',
          timeout: 10000,
        });
        console.log('Dialog search field is visible');
      } catch {
        // Take screenshot on failure
        await page.screenshot({
          path: `test-results/worldbuilding-dialog-failure-${element.type}.png`,
        });

        // Check console errors
        const consoleErrors = await page.evaluate(() => {
          return (
            (window as unknown as { consoleErrors?: string[] }).consoleErrors ??
            []
          );
        });
        console.log('Console errors:', consoleErrors);

        throw new Error(
          `Dialog did not open for ${element.type}. Dialogs present: ${dialogCountAfterClick}`
        );
      }

      // Wait for worldbuilding options to load (async from schema library)
      // Give more time since schemas are loaded asynchronously
      try {
        await page.waitForSelector(
          `[data-testid="element-type-${element.type}"]`,
          { state: 'visible', timeout: 15000 }
        );
      } catch {
        // Debug: capture current state of dialog
        const dialogContent = await page
          .locator('mat-dialog-content')
          .textContent();
        console.error(
          `Dialog content when waiting for ${element.type}:`,
          dialogContent
        );
        throw new Error(
          `Timeout waiting for element-type-${element.type}. Dialog content: ${dialogContent}`
        );
      }

      await page.getByTestId(`element-type-${element.type}`).click();
      await page.getByTestId('element-name-input').fill(element.name);
      await page.getByTestId('create-element-button').click();

      // Wait for dialog to fully close before continuing
      await page.waitForSelector('mat-dialog-container', {
        state: 'detached',
        timeout: 5000,
      });

      // Open element and verify schema initialization
      await page.getByTestId(`element-${element.name}`).click();
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
      await expect(
        page.getByRole('tab', { name: element.expectedTab })
      ).toBeVisible();

      // Go back to project view
      await page.getByTestId('toolbar-home-button').click();

      // Wait for navigation to complete
      await page.waitForLoadState('networkidle');
    }
  });

  test('should validate template editor form inputs', async ({
    offlinePageWithProject: page,
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

    // Navigate to Templates to create a custom template
    await page.getByTestId('toolbar-home-button').click();
    await page.getByTestId('sidebar-templates-button').click();
    await expect(page).toHaveURL(/.*templates-list.*/);
    await page.waitForSelector('mat-card', {
      state: 'visible',
      timeout: 10000,
    });
    await page.waitForTimeout(500);

    // Clone Character template
    const templateCards = page
      .locator('mat-card')
      .filter({ hasText: 'Character' });
    await templateCards
      .locator('button[aria-label="Template actions"]')
      .first()
      .click();
    await page.getByTestId('clone-template-button').click();
    await page.getByLabel(/name/i).fill('Test Template');
    await page.getByRole('button', { name: 'Rename' }).click();
    await page.waitForTimeout(500);

    // Now edit the custom template
    await page
      .locator('mat-card')
      .filter({ hasText: 'Test Template' })
      .locator('button[aria-label="Template actions"]')
      .click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByTestId('template-editor-dialog')).toBeVisible();

    // Try to clear required template name field
    await page.getByTestId('template-name-input').clear();

    // Blur the field to trigger validation (more reliable than timeout)
    await page.getByTestId('template-name-input').blur();

    // Verify the save button is disabled due to validation (use longer timeout for CI)
    await expect(page.getByTestId('save-template-button')).toBeDisabled({
      timeout: 10000,
    });

    // Fix validation error
    await page.getByTestId('template-name-input').fill('Valid Name');

    // Now button should be enabled and save should work (use longer timeout for CI)
    await expect(page.getByTestId('save-template-button')).toBeEnabled({
      timeout: 10000,
    });
    await page.getByTestId('save-template-button').click();
    await expect(page.getByTestId('template-editor-dialog')).not.toBeVisible();
  });

  test('should handle icon display for custom templates', async ({
    offlinePageWithProject: page,
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

    // Navigate back to project home, then to Templates
    await page.getByTestId('toolbar-home-button').click();
    await page.getByTestId('sidebar-templates-button').click();

    // Wait for templates page to load
    await expect(page).toHaveURL(/.*templates-list.*/);
    await page.waitForSelector('mat-card', {
      state: 'visible',
      timeout: 10000,
    });
    await page.waitForTimeout(500);

    // Find Character template and clone it
    const templateCards = page
      .locator('mat-card')
      .filter({ hasText: 'Character' });
    await templateCards
      .locator('button[aria-label="Template actions"]')
      .first()
      .click();
    await page.getByTestId('clone-template-button').click();

    // Fill in the rename dialog
    await page.getByLabel(/name/i).fill('Custom Hero');

    await page.getByRole('button', { name: 'Rename' }).click();

    // Wait for template to be created and snackbar
    await page.waitForTimeout(500);

    // Go back to project home to create element
    await page.getByTestId('toolbar-home-button').click();
    await page.waitForTimeout(300);

    // Create element using custom template
    await page.getByTestId('create-new-element').click();

    // Find the custom template option by its label "Custom Hero"
    const customHeroOption = page
      .locator('.type-card')
      .filter({ hasText: 'Custom Hero' });

    // Wait for the custom template option to appear (async from schema library)
    await expect(customHeroOption).toBeVisible({ timeout: 10000 });

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

    // Verify icon in tab when element is opened
    await heroElement.click();
    const tab = page.getByRole('tab', { name: /My Hero/i });
    await expect(tab.locator('mat-icon', { hasText: 'person' })).toBeVisible();
  });
});
