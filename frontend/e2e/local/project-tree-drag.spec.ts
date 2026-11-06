/**
 * Project Tree Drag and Drop - Local Mode
 *
 * Dropping an item into a closed folder opens the folder, so the item stays
 * in sight instead of vanishing into it.
 */
import { type Locator, type Page } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Picks `source` up with the mouse and holds it over the middle of `target`,
 * without letting go. The CDK starts a mouse drag once the pointer has moved
 * 5 px.
 */
async function dragOver(
  page: Page,
  source: Locator,
  target: Locator
): Promise<void> {
  const from = await centreOf(source);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 8, { steps: 4 });
  await expect(page.locator('.cdk-drag-preview')).toBeAttached();
  // Measure the target once the drag has started and laid out its
  // placeholder.
  const to = await centreOf(target);
  await page.mouse.move(to.x, to.y, { steps: 10 });
}

test.describe('Project tree drag and drop', () => {
  test('dropping an item into a closed folder opens the folder', async ({
    localPage: page,
  }) => {
    await page.getByTestId('empty-state').waitFor({ state: 'visible' });
    await createProjectWithTwoSteps(
      page,
      'Drop Tree',
      'drop-tree',
      undefined,
      'worldbuilding-demo'
    );

    // README is the first row and Chronicles, a closed folder, the second.
    const readme = page.getByTestId('element-README');
    const chronicles = page.getByTestId('element-Chronicles');
    await expect(readme).toHaveAttribute('data-level', '0');
    await expect(chronicles).toHaveAttribute('aria-expanded', 'false');

    // Over the middle of a folder row, the drop lands inside the folder,
    // which the tree highlights.
    await dragOver(page, readme, chronicles);
    await expect(chronicles).toHaveClass(/drop-target-folder/);
    await page.mouse.up();

    await expect(page.getByTestId('move-dialog-to')).toContainText(
      'Chronicles'
    );
    await page.getByTestId('move-dialog-confirm').click();
    await expect(page.getByTestId('move-dialog-confirm')).toBeHidden();

    await expect(chronicles).toHaveAttribute('aria-expanded', 'true');
    await expect(readme).toBeVisible();
    await expect(readme).toHaveAttribute('data-level', '1');
  });
});
