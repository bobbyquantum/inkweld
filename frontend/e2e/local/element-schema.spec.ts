/**
 * Per-element schema copies - Local Mode
 *
 * Each worldbuilding element owns a copy of its schema. This spec covers the
 * status-bar chip that reports whether the element follows the shared project
 * schema or has been customised, in-place schema editing on one element, the
 * "update from shared schema" and "revert to shared schema" actions, and the
 * icon placeholder / Set image controls that replaced the dashed empty box.
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

const ELEMENT_A = 'Thornfolk';
const ELEMENT_B = 'Moonshadow Fox';

/** Fields added through the schema editor get generated `field_<uuid>` keys. */
const generatedFields = (page: Page) =>
  page.locator('[data-testid^="field-field_"]');

async function createCharacter(page: Page, name: string): Promise<void> {
  await page.getByTestId('create-new-element').click();
  await page.waitForSelector('[data-testid="element-type-character-v1"]');
  await page.getByTestId('element-type-character-v1').click();
  await page.getByTestId('element-name-input').fill(name);
  await page.getByTestId('create-element-button').click();
  await expect(page.locator('mat-dialog-container')).toBeHidden();
  await expect(page.getByTestId(`element-${name}`)).toBeVisible();
}

async function openElement(page: Page, name: string): Promise<void> {
  await page.getByTestId(`element-${name}`).click();
  await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
  await expect(page.getByTestId('schema-source-chip')).toBeVisible();
}

async function openChipMenuItem(page: Page, itemTestId: string): Promise<void> {
  await page.getByTestId('schema-source-chip').click();
  const item = page.getByTestId(itemTestId);
  await expect(item).toBeVisible();
  await item.click();
}

async function confirmDialog(page: Page): Promise<void> {
  const confirm = page.getByTestId('confirm-delete-button');
  await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(page.locator('mat-dialog-container')).toBeHidden();
}

test.describe('Per-element schema', () => {
  test('element schema can be customised, updated from shared, and reverted', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    await test.step('new element follows the shared schema', async () => {
      await createCharacter(page, ELEMENT_A);
      await openElement(page, ELEMENT_A);
      await expect(page.getByTestId('schema-source-chip')).toContainText(
        'Shared schema'
      );
      await expect(page.getByTestId('schema-update-dot')).toHaveCount(0);
    });

    await test.step('editing the element schema adds a field and marks it custom', async () => {
      await openChipMenuItem(page, 'schema-menu-edit');
      await expect(page.getByTestId('element-schema-banner')).toBeVisible();
      // Schema Details is template-only and must not appear here.
      await expect(page.getByTestId('nav-schema-details')).toHaveCount(0);

      await page.getByTestId('nav-basic').click();
      const fieldEditButtons = page.getByTestId('field-edit');
      await expect(fieldEditButtons.first()).toBeVisible();
      const before = await fieldEditButtons.count();
      await page.getByTestId('add-field-basic').click();
      await expect(fieldEditButtons).toHaveCount(before + 1);
      await expect(generatedFields(page)).toHaveCount(1);

      await page.getByTestId('element-schema-done').click();
      await expect(page.getByTestId('element-schema-banner')).toBeHidden();
      await expect(page.getByTestId('schema-source-chip')).toContainText(
        'Custom schema'
      );
      // Field persists outside edit mode.
      await expect(generatedFields(page)).toHaveCount(1);
    });

    await test.step('other elements of the same type are unaffected', async () => {
      await page.getByTestId('toolbar-home-button').click();
      await createCharacter(page, ELEMENT_B);
      await openElement(page, ELEMENT_B);
      await page.getByTestId('nav-basic').click();
      await expect(page.getByTestId('schema-source-chip')).toContainText(
        'Shared schema'
      );
      await expect(generatedFields(page)).toHaveCount(0);
    });

    await test.step('editing the shared template flags the custom element', async () => {
      await page.getByTestId('sidebar-settings-button').click();
      await page.waitForURL(/\/settings$/);
      await page.getByTestId('nav-templates').click();
      await page
        .getByTestId('template-card')
        .filter({ hasText: 'Character' })
        .first()
        .getByTestId('edit-template-button')
        .click();
      await expect(page.getByTestId('template-editor-page')).toBeVisible();

      await page.getByTestId('nav-basic').click();
      const fieldEditButtons = page.getByTestId('field-edit');
      await expect(fieldEditButtons.first()).toBeVisible();
      const before = await fieldEditButtons.count();
      await page.getByTestId('add-field-basic').click();
      await expect(fieldEditButtons).toHaveCount(before + 1);

      await page.getByTestId('toolbar-home-button').click();
      await openElement(page, ELEMENT_A);
      await expect(page.getByTestId('schema-source-chip')).toContainText(
        'Custom schema'
      );
      await expect(page.getByTestId('schema-update-dot')).toBeVisible();
    });

    await test.step('updating from shared keeps the local field and adds the shared one', async () => {
      await openChipMenuItem(page, 'schema-menu-sync');
      await expect(page.getByTestId('confirm-dialog-message')).toContainText(
        'New Field'
      );
      await confirmDialog(page);

      await page.getByTestId('nav-basic').click();
      await expect(generatedFields(page)).toHaveCount(2);
      await expect(page.getByTestId('schema-update-dot')).toHaveCount(0);
      // Still custom: the element has a local-only field.
      await expect(page.getByTestId('schema-source-chip')).toContainText(
        'Custom schema'
      );
    });

    await test.step('reverting drops the local field and follows the shared schema', async () => {
      await openChipMenuItem(page, 'schema-menu-revert');
      await confirmDialog(page);

      await page.getByTestId('nav-basic').click();
      await expect(generatedFields(page)).toHaveCount(1);
      await expect(page.getByTestId('schema-source-chip')).toContainText(
        'Shared schema'
      );
      // Element data survives the schema change.
      await page.getByTestId('nav-identity').click();
      await expect(page.getByTestId('identity-panel')).toContainText(ELEMENT_A);
    });
  });

  test('empty image shows the element icon and Set image lives in Identity', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);
    await createCharacter(page, ELEMENT_A);
    await openElement(page, ELEMENT_A);

    const placeholder = page.getByTestId('sidenav-thumbnail-empty');
    await expect(placeholder).toBeVisible();
    // Character schema icon, rendered large in place of the dashed box.
    await expect(placeholder.locator('mat-icon')).toHaveText(/\S+/);
    await expect(placeholder).not.toContainText('add_photo_alternate');

    await page.getByTestId('nav-identity').click();
    await expect(page.getByTestId('identity-clear-image')).toHaveCount(0);
    await page.getByTestId('identity-set-image').click();
    await expect(page.locator('mat-dialog-container')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('mat-dialog-container')).toBeHidden();
  });
});
