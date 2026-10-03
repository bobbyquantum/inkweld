/**
 * Corkboard & Outline Tests - Local Mode
 *
 * A folder of scenes opens as a corkboard of index cards and can be
 * switched to an outline table. One test walks the whole flow so the
 * project, folder and scenes are only set up once.
 */
import { type Page } from '@playwright/test';

import { openProjectFromGrid } from '../common/test-helpers';
import { expect, openUserSettings, test } from './fixtures';

const FOLDER = 'Manuscript';

/** Create a scene inside the folder and type some prose into it. */
async function createScene(
  page: Page,
  name: string,
  prose: string
): Promise<void> {
  await page.getByTestId(`element-${FOLDER}`).click({ button: 'right' });
  await page.getByTestId('context-menu-new-element').click();
  await page.getByTestId('element-type-item').click();
  await page.getByTestId('element-name-input').fill(name);
  await page.getByTestId('create-element-button').click();
  await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });

  const editor = page.locator('ngx-editor .ProseMirror');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(prose);
  await expect(editor).toContainText(prose);
}

test.describe('Corkboard and outline', () => {
  test('a folder of scenes shows as index cards and as an outline', async ({
    localPageWithProject: page,
  }) => {
    await openProjectFromGrid(page);
    await page.getByTestId('project-tree').waitFor({ state: 'visible' });

    await test.step('create a folder with two scenes', async () => {
      await page.getByTestId('create-new-element').click();
      await page.getByTestId('element-type-folder').click();
      await page.getByTestId('element-name-input').fill(FOLDER);
      await page.getByTestId('create-element-button').click();
      await expect(page.getByTestId(`element-${FOLDER}`)).toBeVisible();

      await createScene(page, 'Opening', 'The harbour bell rang twice.');
      await createScene(page, 'Storm', 'The mast groaned.');
    });

    const corkboard = page.getByTestId('scene-corkboard');
    const cards = corkboard.locator('[data-testid^="corkboard-card-"]');
    const card = (name: string) => cards.filter({ hasText: name });

    await test.step('the folder opens on the corkboard', async () => {
      await page.getByTestId(`element-${FOLDER}`).click({ button: 'right' });
      await page.getByTestId('context-menu-open-folder').click();

      await expect(corkboard).toBeVisible();
      await expect(cards).toHaveCount(2);
      // Counts are read from the documents just written.
      await expect(card('Opening')).toContainText('5 words');
      await expect(card('Storm')).toContainText('3 words');
    });

    await test.step('a synopsis and status are edited on the card', async () => {
      const synopsis = card('Opening').locator('textarea');
      await synopsis.fill('Mira arrives at the harbour.');
      await synopsis.blur();

      await card('Opening')
        .locator('[data-testid^="corkboard-status-"]')
        .click();
      await page.getByTestId('corkboard-status-draft').click();
      await expect(card('Opening')).toHaveClass(/status-draft/);
    });

    await test.step('the outline lists the scenes with totals', async () => {
      await page.getByTestId('folder-view-outline').click();

      const outline = page.getByTestId('scene-outline');
      await expect(outline).toBeVisible();

      const row = outline
        .locator('[data-testid^="outline-row-"]')
        .filter({ hasText: 'Opening' });
      await expect(row.locator('input.synopsis')).toHaveValue(
        'Mira arrives at the harbour.'
      );
      await expect(row).toContainText('Draft');

      const totals = page.getByTestId('outline-totals');
      await expect(totals).toContainText('2 scenes');
      await expect(totals).toContainText('8');
    });

    await test.step('the chosen view is remembered after a reload', async () => {
      await page.reload();
      await expect(page.getByTestId('scene-outline')).toBeVisible();
    });

    await test.step('a scene opens from its outline row', async () => {
      await page
        .locator('[data-testid^="outline-open-"]')
        .filter({ hasText: 'Storm' })
        .click();
      await expect(page.locator('ngx-editor .ProseMirror')).toContainText(
        'The mast groaned.'
      );
    });
  });

  test('a folder opens on click only when the preference is on', async ({
    localPageWithProject: page,
  }) => {
    await openProjectFromGrid(page);
    await page.getByTestId('project-tree').waitFor({ state: 'visible' });
    const projectUrl = page.url();

    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-folder').click();
    await page.getByTestId('element-name-input').fill(FOLDER);
    await page.getByTestId('create-element-button').click();
    const folder = page.getByTestId(`element-${FOLDER}`);
    await expect(folder).toBeVisible();
    // Creating a folder opens it; go back to the project home tab.
    await page.getByTestId('toolbar-home-button').click();
    await expect(page).toHaveURL(projectUrl);

    await test.step('by default a click only toggles the folder', async () => {
      const before = await folder.getAttribute('aria-expanded');
      await folder.click();
      await expect(folder).not.toHaveAttribute('aria-expanded', before ?? '');
      await expect(page).toHaveURL(projectUrl);
    });

    await test.step('turn on the preference in Project Tree settings', async () => {
      await openUserSettings(page);
      await page.getByRole('tab', { name: /project tree/i }).click();
      const toggle = page
        .getByTestId('folder-click-opens-toggle')
        .getByRole('switch');
      await toggle.click();
      await expect(toggle).toBeChecked();
      await page.getByTestId('settings-close-button').click();
    });

    await test.step('now a click expands and opens the folder', async () => {
      await folder.click();
      await expect(page).toHaveURL(/\/folder\//);
      await expect(page.getByTestId('folder-empty')).toBeVisible();
      await expect(folder).toHaveAttribute('aria-expanded', 'true');

      // Clicking it again keeps it open rather than collapsing it.
      await folder.click();
      await expect(folder).toHaveAttribute('aria-expanded', 'true');
    });
  });
});
