/**
 * Random generators - Local Mode
 *
 * Covers the loop a writer actually walks: the generators a new worldbuilding
 * project ships with, rolling an element name from the Character template's
 * bound generator, rolling a field from its dice, and authoring a generator
 * of your own in the settings section.
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

/** Entries are chosen so every roll is recognisable in an assertion. */
const FIRST_NAMES = ['Aldric', 'Brynn', 'Cera'];
const LAST_NAME = 'Stonehelm';

/** mat-menu-item pads its label, so the match tolerates surrounding space. */
const ROLLED_NAME = new RegExp(
  `^\\s*(${FIRST_NAMES.join('|')}) ${LAST_NAME}\\s*$`
);

/** Generators shipped with the worldbuilding templates. */
const SHIPPED_GENERATORS = [
  'Character names',
  'Settlement names',
  'Tavern & inn names',
  'Wilds & landmarks',
  'Story prompts',
];

async function gotoSettingsSection(page: Page, section: string): Promise<void> {
  const settingsButton = page.getByTestId('sidebar-settings-button');
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  await page.waitForURL(/\/settings$/);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  await page.getByTestId(`nav-${section}`).click();
}

test.describe('Random generators', () => {
  test('a new project ships with generators bound to its templates', async ({
    localPageWithProject: page,
  }) => {
    // Settings, a dialog roll and a field roll in one test — past the default
    // per-test budget on a cold dev server.
    test.slow();

    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);
    const projectUrl = page.url();

    await test.step('the settings section lists them', async () => {
      await gotoSettingsSection(page, 'generators');
      const list = page.getByTestId('generators-list');
      await expect(list).toBeVisible();
      for (const name of SHIPPED_GENERATORS) {
        await expect(list).toContainText(name);
      }
      // Each row previews a sample roll from its own generator. The sample is
      // seeded from the generator id, so assert its shape, not its wording.
      await expect(
        page
          .getByTestId('generators-row-gen-character-names')
          .locator('.generator-sample')
      ).toHaveText(/^\S+ \S+/);
    });

    let rolled = '';

    await test.step('the Character template rolls element names', async () => {
      await page.goto(projectUrl);
      await page.getByTestId('create-new-element').click();
      await page.waitForSelector('[data-testid="element-type-character-v1"]');
      await page.getByTestId('element-type-character-v1').click();

      await page.getByTestId('new-element-dice').click();
      const suggestion = page.getByTestId('generator-dice-suggestion-0');
      await expect(suggestion).toBeVisible();

      rolled = (await suggestion.textContent())?.trim() ?? '';
      expect(rolled.length).toBeGreaterThan(0);
      await suggestion.click();

      await expect(page.getByTestId('element-name-input')).toHaveValue(rolled);
      await page.getByTestId('create-element-button').click();
      await expect(page.getByTestId(`element-${rolled}`)).toBeVisible();
    });

    await test.step('the Full Name field has its own dice', async () => {
      await page.getByTestId(`element-${rolled}`).click();
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();

      // The editor opens on Identity; Full Name lives in Basic Info.
      await page.getByTestId('nav-basic').click();
      await page.getByTestId('field-dice-fullName').click();
      const suggestion = page.getByTestId('generator-dice-suggestion-0');
      await expect(suggestion).toBeVisible();

      const fullName = (await suggestion.textContent())?.trim() ?? '';
      await suggestion.click();

      await expect(
        page.getByTestId('field-fullName').locator('input')
      ).toHaveValue(fullName);
    });
  });

  test('a generator can be authored, previewed and reloaded', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page).toHaveURL(/\/.+\/.+/);

    await test.step('the preview rolls from the draft', async () => {
      await gotoSettingsSection(page, 'generators');
      await page.getByTestId('generators-create').click();
      await expect(page.getByTestId('generator-edit-name')).toBeVisible();

      await page.getByTestId('generator-edit-name').fill('My names');
      await page.getByTestId('generator-edit-template').fill('#first# #last#');
      await page.getByTestId('generator-edit-rule-key-0').fill('first');
      await page
        .getByTestId('generator-edit-rule-entries-0')
        .fill(FIRST_NAMES.join('\n'));
      await page.getByTestId('generator-edit-rule-key-1').fill('last');
      await page.getByTestId('generator-edit-rule-entries-1').fill(LAST_NAME);

      const preview = page.getByTestId('generator-edit-preview');
      await expect(preview.locator('li').first()).toHaveText(ROLLED_NAME);
    });

    await test.step('an unresolved reference blocks saving', async () => {
      await page.getByTestId('generator-edit-template').fill('#missing#');
      await expect(page.getByTestId('generator-edit-save')).toBeDisabled();

      await page.getByTestId('generator-edit-template').fill('#first# #last#');
      await expect(page.getByTestId('generator-edit-save')).toBeEnabled();
    });

    await test.step('saving returns to the list', async () => {
      await page.getByTestId('generator-edit-save').click();
      await expect(page.getByTestId('generators-list')).toContainText(
        'My names'
      );
    });

    await test.step('the generator survives a reload', async () => {
      await page.reload();
      await expect(page.getByTestId('settings-tab-content')).toBeVisible();
      await page.getByTestId('nav-generators').click();
      await expect(page.getByTestId('generators-list')).toContainText(
        'My names'
      );
    });
  });
});
