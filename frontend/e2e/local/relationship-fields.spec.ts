/**
 * Relationship Fields Tests - Local Mode
 *
 * Verifies the end-to-end flow for template "relationship fields":
 * 1. Template editor: add a relationship field (target template, inverse label)
 * 2. Settings relationship types list shows the auto-managed type read-only
 * 3. Element editor: link another element via the filtered picker, card renders
 * 4. Relationships section shows the link (and the backlink on the target)
 * 5. Removing the link restores the empty state
 *
 * Any API request fails the test (pure local mode).
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

/** Create a Character element from the project home screen. */
async function createCharacter(page: Page, name: string): Promise<void> {
  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-character-v1').click();
  await page.getByTestId('element-name-input').fill(name);
  await page.getByTestId('create-element-button').click();
  await expect(page.getByTestId(`element-${name}`)).toBeVisible();
}

/** Navigate from anywhere in the project shell to Settings → Element Templates. */
async function gotoTemplatesTab(page: Page): Promise<void> {
  const settingsButton = page.getByTestId('sidebar-settings-button');
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  await page.waitForURL(/\/settings$/);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  await page.getByTestId('nav-templates').click();
  await expect(page.getByTestId('template-card').first()).toBeVisible();
}

/** Replace a seeded dialog input value deterministically (zoneless-safe). */
async function retypeSeededInput(
  page: Page,
  testId: string,
  value: string
): Promise<void> {
  const input = page.getByTestId(testId);
  await input.click();
  await input.press('ControlOrMeta+a');
  await input.press('Backspace');
  await input.pressSequentially(value);
}

test.describe('Relationship fields', () => {
  test('relationship fields link elements and surface in the relationships tab', async ({
    localPageWithProject: page,
  }) => {
    await test.step('create two characters to link', async () => {
      await page.getByTestId('project-card').first().click();
      await expect(page).toHaveURL(/\/.+\/.+/);
      await createCharacter(page, 'Alice');
      await createCharacter(page, 'Maria');
    });

    await test.step('add a "Nemesis" relationship field to the Character template', async () => {
      await gotoTemplatesTab(page);

      const characterCard = page
        .getByTestId('template-card')
        .filter({ hasText: 'Character' })
        .first();
      await characterCard.getByTestId('edit-template-button').click();
      await expect(page.getByTestId('template-editor-page')).toBeVisible();

      await page.getByTestId('nav-basic').click();
      const fieldEditButtons = page.getByTestId('field-edit');
      await expect(fieldEditButtons.first()).toBeVisible();
      const fieldCount = await fieldEditButtons.count();
      await page.getByTestId('add-field-basic').click();
      await expect(fieldEditButtons).toHaveCount(fieldCount + 1);
      await fieldEditButtons.last().click();

      // Configure the field: label, key, type=relationship.
      await expect(page.getByTestId('fc-key')).toBeVisible();
      await retypeSeededInput(page, 'fc-label', 'Nemesis');
      await retypeSeededInput(page, 'fc-key', 'nemesis');

      await page.getByTestId('fc-type').click();
      await page.getByTestId('fc-type-option-relationship').click();

      // Relationship-specific settings appear.
      await expect(page.getByTestId('fc-relationship')).toBeVisible();

      // Restrict the link target to Character elements.
      await page.getByTestId('fc-target-schema').click();
      await page.getByTestId('fc-target-schema-character-v1').click();

      // Inverse label shown as the backlink on the target element.
      await retypeSeededInput(page, 'fc-inverse-label', 'Nemesis of');

      await page.getByTestId('fc-save').click();
      await expect(page.locator('mat-dialog-container')).not.toBeVisible();

      // The live preview renders the relationship field wrapper.
      await expect(page.getByTestId('field-nemesis')).toBeVisible();

      // Close the editor tab (autosave already committed the schema edit).
      await page
        .locator('[data-testid="tab-Character"] .close-tab-button')
        .click();
      await expect(page.getByTestId('template-editor-page')).not.toBeVisible();
    });

    await test.step('settings show the auto-managed type as read-only', async () => {
      // Already in Settings after closing the template editor tab.
      await page.getByTestId('nav-relationships').click();
      await expect(page.getByTestId('relationship-types-list')).toBeVisible();

      // The default templates seed field-managed types too (Mother/Father);
      // target the one this test created via its title text.
      const nemesisCard = page
        .getByTestId('relationship-type-card')
        .filter({ hasText: 'Nemesis' });
      await expect(nemesisCard).toHaveCount(1);
      await expect(
        nemesisCard.getByTestId('type-field-managed-badge')
      ).toBeVisible();
      await expect(
        nemesisCard.getByTestId('edit-type-button')
      ).not.toBeVisible();
      await expect(
        nemesisCard.getByTestId('delete-type-button')
      ).not.toBeVisible();
    });

    await test.step("link Maria as Alice's nemesis from the element editor", async () => {
      await page.getByTestId('toolbar-home-button').click();
      await expect(page.getByTestId('create-new-element')).toBeVisible();

      await page.getByTestId('element-Alice').click();
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

      // Alice was created before the template gained the field. Elements own
      // a copy of their schema, so the change is flagged and pulled in
      // explicitly via "Update from shared schema" rather than applied live.
      await expect(page.getByTestId('schema-update-dot')).toBeVisible();
      await page.getByTestId('schema-source-chip').click();
      await page.getByTestId('schema-menu-sync').click();
      await page.getByTestId('confirm-delete-button').click();
      await expect(page.locator('mat-dialog-container')).toBeHidden();
      await expect(page.getByTestId('schema-update-dot')).toHaveCount(0);

      await page.getByTestId('nav-basic').click();
      const fieldWrapper = page.getByTestId('relationship-field-nemesis');
      await expect(fieldWrapper).toBeVisible();
      await expect(fieldWrapper.getByTestId('rel-add')).toBeVisible();

      await fieldWrapper.getByTestId('rel-add').click();

      // Picker is filtered to Character elements.
      const pickerList = page.getByTestId('element-picker-list');
      await expect(pickerList).toBeVisible();
      const mariaItem = pickerList
        .getByTestId('element-picker-item')
        .filter({ hasText: 'Maria' });
      await expect(mariaItem).toBeVisible();
      await mariaItem.click();
      await page.getByTestId('element-picker-confirm').click();
      await expect(page.locator('mat-dialog-container')).not.toBeVisible();

      // The linked element renders as a card; single-valued field shows change.
      await expect(
        fieldWrapper.locator('[data-testid^="rel-card-"]')
      ).toBeVisible();
      await expect(fieldWrapper.getByTestId('rel-name')).toHaveText('Maria');
      await expect(fieldWrapper.getByTestId('rel-change')).toBeVisible();
    });

    await test.step('Alice relationships section lists the Nemesis link', async () => {
      await page.getByTestId('nav-relationships').click();
      const metaPanel = page.getByTestId('meta-panel');
      await expect(metaPanel).toBeVisible();
      await expect(
        metaPanel
          .locator('[data-testid="relationship-type-panel"]')
          .filter({ hasText: 'Nemesis' })
      ).toBeVisible();
      await expect(
        metaPanel.getByTestId('relationship-item').filter({ hasText: 'Maria' })
      ).toBeVisible();
    });

    await test.step('Maria shows the "Nemesis of" backlink', async () => {
      await page.getByTestId('toolbar-home-button').click();
      await expect(page.getByTestId('create-new-element')).toBeVisible();

      await page.getByTestId('element-Maria').click();
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
      await page.getByTestId('nav-relationships').click();

      const metaPanel = page.getByTestId('meta-panel');
      await expect(metaPanel).toBeVisible();
      await expect(
        metaPanel
          .locator('[data-testid="relationship-type-panel"]')
          .filter({ hasText: 'Nemesis of' })
      ).toBeVisible();
      await expect(
        metaPanel.getByTestId('relationship-item').filter({ hasText: 'Alice' })
      ).toBeVisible();
    });

    await test.step('removing the link restores the empty state', async () => {
      await page.getByTestId('toolbar-home-button').click();
      await expect(page.getByTestId('create-new-element')).toBeVisible();

      await page.getByTestId('element-Alice').click();
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
      await page.getByTestId('nav-basic').click();

      const fieldWrapper = page.getByTestId('relationship-field-nemesis');
      await expect(fieldWrapper).toBeVisible();
      await fieldWrapper.locator('[data-testid^="rel-remove-"]').click();

      await expect(fieldWrapper.getByTestId('rel-add')).toBeVisible();
      await expect(
        fieldWrapper.locator('[data-testid^="rel-card-"]')
      ).not.toBeVisible();
    });
  });
});
