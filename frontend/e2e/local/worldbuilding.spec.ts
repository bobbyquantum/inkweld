/**
 * Worldbuilding Template Tests - Local Mode
 *
 * These tests verify worldbuilding functionality in pure local mode.
 * Any API requests will cause the test to fail, ensuring the feature
 * works correctly without a server connection.
 *
 * Consolidated from 7 individual tests into 3 grouped tests using
 * `test.step()`. Test B reuses a single Settings → Templates tab visit
 * to exercise create/clone/edit/delete operations.
 */
import { type Page } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

/**
 * Open the project, then create one Character element so that the
 * worldbuilding template library is initialized for the project.
 */
async function openProjectAndInitTemplates(
  page: Page,
  characterName = 'Init Character'
): Promise<void> {
  await page.getByTestId('project-card').first().click();
  await expect(page).toHaveURL(/\/.+\/.+/);

  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-character-v1').click();
  await page.getByTestId('element-name-input').fill(characterName);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${characterName}`)).toBeVisible();
}

/**
 * Navigate from anywhere in the project shell to Settings → Element Templates.
 */
async function gotoTemplatesTab(page: Page): Promise<void> {
  const settingsButton = page.getByTestId('sidebar-settings-button');
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  await page.waitForURL(/\/settings$/);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  await page.getByTestId('nav-templates').click();
  await expect(page.getByTestId('template-card').first()).toBeVisible();
}

test.describe('Worldbuilding Templates', () => {
  test('worldbuilding elements initialize with their expected schemas', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForLoadState('domcontentloaded');

    const elementTypes = [
      { type: 'character-v1', name: 'Test Character', expectedTabKey: 'basic' },
      { type: 'location-v1', name: 'Test Location', expectedTabKey: 'basic' },
      { type: 'wb-item-v1', name: 'Test Item', expectedTabKey: 'basic' },
    ];

    for (const element of elementTypes) {
      await test.step(`creates ${element.type} and shows ${element.expectedTabKey} schema tab`, async () => {
        // If a previous step left a dialog open, close it first.
        const existingDialogs = await page
          .locator('mat-dialog-container')
          .count();
        if (existingDialogs > 0) {
          await page.keyboard.press('Escape');
          await expect(page.locator('mat-dialog-container')).not.toBeVisible();
        }

        const addButton = page.getByTestId('create-new-element');
        await expect(addButton).toBeVisible();
        await addButton.click();

        // Wait for dialog to mount (search field is the first stable signal).
        await expect(
          page.locator('mat-form-field input[matInput]')
        ).toBeVisible();

        // Element type cards are loaded asynchronously from the schema library.
        try {
          await page.waitForSelector(
            `[data-testid="element-type-${element.type}"]`
          );
        } catch {
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

        await expect(page.locator('mat-dialog-container')).toBeHidden();

        await page.getByTestId(`element-${element.name}`).click();
        await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

        const sidenavTab = page.getByTestId(`nav-${element.expectedTabKey}`);
        const accordionTab = page.getByTestId(
          `accordion-${element.expectedTabKey}`
        );
        await expect(sidenavTab.or(accordionTab)).toBeVisible();

        await page.getByTestId('toolbar-home-button').click();
        await page.waitForLoadState('domcontentloaded');
      });
    }
  });

  test('custom templates: create, clone, edit (validation + field types), delete, use', async ({
    localPageWithProject: page,
  }) => {
    await openProjectAndInitTemplates(page, 'Init Character');
    await gotoTemplatesTab(page);

    await test.step('Create Template button creates a brand-new template', async () => {
      await page.getByTestId('create-template-button').click();
      await expect(page.getByTestId('template-editor-page')).toBeVisible();

      const nameInput = page.getByTestId('template-name-input');
      await nameInput.clear();
      await nameInput.fill('Custom Event');

      // Icon is a mat-select; pick 'star' from the available icons.
      await page.getByTestId('template-icon-input').click();
      await page.getByRole('option', { name: /star/ }).click();

      await page
        .getByTestId('template-description-input')
        .fill('Template for story events');

      await page.getByTestId('save-template-button').click();
      await expect(page.getByTestId('template-editor-page')).not.toBeVisible();
      await expect(
        page.getByTestId('template-card').filter({ hasText: 'Custom Event' })
      ).toBeVisible();
    });

    await test.step('cloning Character produces a new template card', async () => {
      const characterCards = page
        .getByTestId('template-card')
        .filter({ hasText: 'Character' });
      await characterCards.getByTestId('clone-template-button').first().click();

      await page.getByLabel(/name/i).fill('Hero Template');
      await page.getByRole('button', { name: 'Rename' }).click();

      // Scope to templates-list to avoid colliding with snackbar text.
      await expect(
        page.getByTestId('templates-list').getByText('Hero Template')
      ).toBeVisible();
    });

    await test.step('editing Hero Template enforces a non-empty name', async () => {
      await page
        .getByTestId('template-card')
        .filter({ hasText: 'Hero Template' })
        .getByTestId('edit-template-button')
        .click();
      await expect(page.getByTestId('template-editor-page')).toBeVisible();

      const nameInput = page.getByTestId('template-name-input');
      await nameInput.click();
      await nameInput.fill('');
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('save-template-button')).toBeDisabled();

      // Restore a valid name so we can proceed to the next step.
      await nameInput.fill('Hero Template');
      await expect(page.getByTestId('save-template-button')).toBeEnabled();
    });

    await test.step('Date is exposed as a field type in the template editor', async () => {
      // We're still on the Hero Template edit page from the previous step.
      await page.getByTestId('add-field-button').click();
      await page.getByTestId('field-expansion-header').last().click();
      await page.getByTestId('field-type-select').last().click();
      await expect(page.getByTestId('field-type-option-date')).toBeVisible();

      // Close the select dropdown so we can save without leaving an open overlay.
      await page.keyboard.press('Escape');
      await page.getByTestId('save-template-button').click();
      await expect(page.getByTestId('template-editor-page')).not.toBeVisible();
    });

    await test.step('custom template can be used to create an element with the right icon', async () => {
      await page.getByTestId('toolbar-home-button').click();
      await expect(page.getByTestId('create-new-element')).toBeVisible();
      await page.getByTestId('create-new-element').click();

      const customHeroOption = page
        .locator('.type-card')
        .filter({ hasText: 'Hero Template' });
      await expect(customHeroOption).toBeVisible();

      const testId = await customHeroOption.getAttribute('data-testid');
      expect(testId).toMatch(/^element-type-custom-\d+$/);

      await customHeroOption.click();
      await page.getByTestId('element-name-input').fill('My Hero');
      await page.getByTestId('create-element-button').click();

      const heroElement = page.getByTestId('element-My Hero');
      await expect(heroElement).toBeVisible();
      // Cloned from Character, so the icon defaults to 'person'.
      await expect(
        heroElement.locator('mat-icon', { hasText: 'person' })
      ).toBeVisible();

      await heroElement.click();
      const sidenavTab = page.getByTestId('nav-basic');
      const accordionTab = page.getByTestId('accordion-basic');
      await expect(sidenavTab.or(accordionTab)).toBeVisible();
    });

    await test.step('deleting Hero Template removes it from the list', async () => {
      await gotoTemplatesTab(page);

      const heroCard = page
        .getByTestId('template-card')
        .filter({ hasText: 'Hero Template' });
      await heroCard.getByTestId('delete-template-button').click();
      await page.getByRole('button', { name: 'Delete' }).click();
      await expect(
        page.getByRole('button', { name: 'Delete' })
      ).not.toBeVisible();

      await expect(
        page.getByTestId('template-card').filter({ hasText: 'Hero Template' })
      ).not.toBeVisible();
    });
  });

  test('demo template populates character date-of-birth field correctly', async ({
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
});
