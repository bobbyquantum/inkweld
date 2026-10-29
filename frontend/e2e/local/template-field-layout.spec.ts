/**
 * Template field grid layout - Local Mode
 *
 * Fields sit on a 12-column grid. Small spans (a stat block of six span-2
 * numbers) used to squeeze the edit-mode header so its buttons overlapped and
 * "Remove field" sat under the gear, and the grid overflowed its panel. This
 * spec builds such a template and checks, at tablet and small-laptop widths,
 * that the grid fits its panel and every field action can be reached.
 */
import { type Locator, type Page } from '@playwright/test';

import { openProjectFromGrid } from '../common/test-helpers';
import { expect, test } from './fixtures';

const STATS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

/** Fields added through the schema editor get generated `field_<uuid>` keys. */
const generatedFields = (page: Page) =>
  page.locator('[data-testid^="field-field_"]');

async function addField(
  page: Page,
  label: string,
  span: number,
  type?: string
): Promise<void> {
  const fields = generatedFields(page);
  const before = await fields.count();
  await page.getByTestId('add-field-basic').click();
  await expect(fields).toHaveCount(before + 1);

  await fields.nth(before).getByTestId('field-edit').click();
  const dialog = page.locator('mat-dialog-container');
  await expect(dialog).toBeVisible();
  await page.getByTestId('fc-label').fill(label);
  if (type) {
    await page.getByTestId('fc-type').click();
    await page.getByTestId(`fc-type-option-${type}`).click();
  }
  await page.getByTestId(`fc-span-cell-${span - 1}`).click();
  await expect(page.getByTestId('fc-span-value')).toHaveText(`${span} / 12`);
  await page.getByTestId('fc-save').click();
  await expect(dialog).toBeHidden();
}

/** True when the element at the centre of `target` is `target` itself. */
async function isHitTarget(target: Locator): Promise<boolean> {
  await target.scrollIntoViewIfNeeded();
  return target.evaluate(el => {
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    return !!hit && el.contains(hit);
  });
}

async function expectGridFitsPanel(page: Page): Promise<void> {
  const grid = page.locator('.tab-content:visible').first();
  await expect(grid).toBeVisible();
  const overflow = await grid.evaluate(el => {
    const panel = el.getBoundingClientRect();
    let worst = 0;
    for (const cell of Array.from(el.children)) {
      const rect = cell.getBoundingClientRect();
      worst = Math.max(worst, panel.left - rect.left, rect.right - panel.right);
    }
    return { scroll: el.scrollWidth - el.clientWidth, worst };
  });
  expect(overflow.scroll).toBeLessThanOrEqual(0);
  expect(overflow.worst).toBeLessThanOrEqual(0.5);
}

/** Every card exposes Remove: inline when it fits, else in the overflow menu. */
async function expectActionsReachable(page: Page): Promise<void> {
  const cards = generatedFields(page);
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    await expect(card.getByTestId('field-edit')).toBeVisible();
    expect(await isHitTarget(card.getByTestId('field-edit'))).toBe(true);

    const remove = card.getByTestId('field-remove');
    const more = card.getByTestId('field-more-actions');
    if (await remove.isVisible()) {
      await expect(more).toBeHidden();
      expect(await isHitTarget(remove)).toBe(true);
    } else {
      await expect(more).toBeVisible();
      expect(await isHitTarget(more)).toBe(true);
    }
  }
}

test.describe('Template field layout', () => {
  test('small-span fields keep their actions reachable and the grid fits', async ({
    localPageWithProject: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openProjectFromGrid(page);
    await expect(page).toHaveURL(/\/.+\/.+/);

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
    // The reported layout had the project sidebar collapsed.
    await page.getByTestId('toolbar-collapse-button').click();
    await expect(page.getByTestId('sidebar-expand-button')).toBeVisible();
    await page.getByTestId('nav-basic').click();

    await test.step('build a stat block', async () => {
      for (const stat of STATS) {
        await addField(page, stat, 2, 'number');
      }
      await addField(page, 'Speed', 3, 'number');
      await addField(page, 'Armour', 4);
    });

    for (const width of [1024, 800, 600]) {
      await test.step(`edit mode at ${width}px`, async () => {
        await page.setViewportSize({ width, height: 900 });
        // At narrow widths the editor switches to its accordion layout.
        const panel = page.getByTestId('accordion-basic');
        if (await panel.isVisible()) {
          const header = panel.locator('mat-expansion-panel-header');
          if ((await header.getAttribute('aria-expanded')) !== 'true') {
            await header.click();
          }
        }
        await expect(generatedFields(page)).toHaveCount(STATS.length + 2);
        await expect(generatedFields(page).first()).toBeVisible();
        await expectGridFitsPanel(page);
        await expectActionsReachable(page);
      });
    }

    await test.step('remove a narrow field through its overflow menu', async () => {
      const card = generatedFields(page).filter({ hasText: 'CHA' });
      await card.getByTestId('field-more-actions').click();
      await page.getByTestId('field-menu-remove').click();
      await expect(
        generatedFields(page).filter({ hasText: 'CHA' })
      ).toHaveCount(0);
    });

    await test.step('an element keeps small fields side by side at 800px', async () => {
      await page.setViewportSize({ width: 800, height: 900 });
      await page.getByTestId('sidebar-expand-button').click();
      await page.getByTestId('create-new-element').click();
      await page.getByTestId('element-type-character-v1').click();
      await page.getByTestId('element-name-input').fill('Stat Block');
      await page.getByTestId('create-element-button').click();
      await expect(page.locator('mat-dialog-container')).toBeHidden();
      await page.getByTestId('element-Stat Block').click();
      await expect(page.getByTestId('worldbuilding-editor')).toBeVisible();
      await page.getByTestId('toolbar-collapse-button').click();

      const panel = page.getByTestId('accordion-basic');
      if (await panel.isVisible()) {
        await panel.locator('mat-expansion-panel-header').click();
      } else {
        await page.getByTestId('nav-basic').click();
      }
      const fields = generatedFields(page);
      await expect(fields).toHaveCount(STATS.length + 1);
      await expect(fields.first()).toBeVisible();
      await expectGridFitsPanel(page);

      const tops = await fields.evaluateAll(els =>
        els.map(el => Math.round(el.getBoundingClientRect().top))
      );
      // STR, DEX and CON (span 2) share the first row.
      expect(new Set(tops.slice(0, 3)).size).toBe(1);
    });
  });
});
