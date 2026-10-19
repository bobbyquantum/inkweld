/**
 * New project picker - Local Mode
 *
 * The picker offers one card per kind of project (Worldbuilding, Tabletop RPG,
 * Script, Blank) and, inside a kind, a choice between starting empty and
 * exploring a demo. These tests check that choice and that the Tabletop RPG
 * templates produce the project they promise.
 */
import { type Page } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

async function openTreeFolder(page: Page, name: string): Promise<void> {
  const folder = page.getByRole('treeitem', { name });
  await expect(folder).toBeVisible();
  await folder.locator('button').first().click();
}

test.describe('New project picker', () => {
  test('offers a card per kind, and a start-with choice inside a kind', async ({
    localPage: page,
  }) => {
    await page.goto('/create-project');
    await expect(page.getByTestId('template-grid')).toBeVisible();

    await test.step('one card per kind of project', async () => {
      for (const group of [
        'worldbuilding',
        'tabletop-rpg',
        'script',
        'blank',
      ]) {
        await expect(page.getByTestId(`template-group-${group}`)).toBeVisible();
      }
    });

    await test.step('a kind with a demo asks what to start with', async () => {
      await page.getByTestId('template-group-tabletop-rpg').click();
      await expect(page.getByTestId('variant-picker')).toBeVisible();
      await expect(page.getByTestId('template-ttrpg-empty')).toBeVisible();
      await expect(page.getByTestId('template-ttrpg-demo')).toBeVisible();
    });

    await test.step('a kind with one template just describes it', async () => {
      await page.getByTestId('template-group-script').click();
      await expect(page.getByTestId('variant-picker')).toHaveCount(0);
      await expect(page.getByTestId('template-note')).toBeVisible();
    });
  });

  test('the Tabletop RPG starter sets up folders and element types', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(
      page,
      'My Campaign',
      'my-campaign',
      'A starter campaign',
      'ttrpg-empty'
    );
    await page.waitForURL(/\/testuser\/my-campaign/);
    const tree = page.getByTestId('project-tree');
    await expect(tree).toBeVisible();

    for (const folder of [
      'Party',
      'NPCs',
      'Locations',
      'Factions',
      'Bestiary',
      'Quests',
    ]) {
      await expect(page.getByRole('treeitem', { name: folder })).toBeVisible();
    }
    await expect(page.getByRole('treeitem', { name: 'README' })).toBeVisible();
  });

  test('the Tabletop RPG demo is the illustrated Drowned Lantern campaign', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(
      page,
      'Lantern Demo',
      'lantern-demo',
      'The demo campaign',
      'ttrpg-demo'
    );
    await page.waitForURL(/\/testuser\/lantern-demo/);
    await expect(page.getByTestId('project-tree')).toBeVisible();

    await test.step('has the campaign content', async () => {
      await openTreeFolder(page, 'Party');
      await expect(
        page.getByRole('treeitem', { name: 'Pip Cobble' })
      ).toBeVisible();
      await openTreeFolder(page, 'Bestiary');
      await expect(
        page.getByRole('treeitem', { name: 'Drowned Acolyte' })
      ).toBeVisible();
    });

    await test.step('shows the cover and the entry images from the template', async () => {
      await expect(page.locator('app-project-cover img').first()).toBeVisible();
      await page.getByRole('treeitem', { name: 'Pip Cobble' }).click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            [...document.querySelectorAll('img')].some(
              img => img.src.startsWith('blob:') && img.naturalWidth >= 800
            )
          )
        )
        .toBe(true);
    });
  });
});
