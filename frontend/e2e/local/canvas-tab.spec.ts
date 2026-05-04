/**
 * Canvas Element E2E Tests - Local Mode
 *
 * Tests that verify the Canvas element type works correctly in local mode:
 * - Creating a canvas element and opening the canvas tab
 * - Sidebar: layers panel, objects panel
 * - Layer CRUD (add, rename, duplicate, delete, reorder)
 * - Layer visibility and lock toggles
 * - Toolbar tool switching and zoom controls
 * - Sidebar collapse / expand
 * - Objects list (empty state)
 * - Context menu presence
 *
 * Note: Actual drawing interactions on the Konva stage are not tested here,
 * as they require simulating pointer events at canvas-level coordinates.
 * The toolbar, sidebar, and layer operations are all standard Angular/HTML
 * and are the primary focus of these tests.
 *
 * NOTE: Tests are consolidated into a small number of `test()` blocks using
 * `test.step()` so we only pay the project + canvas-element creation cost
 * once per group. Each step leaves the UI in a state that the next step can
 * build on (or resets explicitly).
 */

import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a canvas element and navigate into it
// ─────────────────────────────────────────────────────────────────────────────

async function createCanvasAndOpen(page: Page) {
  // Navigate into the project
  await page.getByTestId('project-card').first().click();
  await page.waitForURL(/\/.+\/.+/);

  // Open the new-element dialog
  await page.getByTestId('create-new-element').click();

  // Select the Canvas element type
  await page.getByTestId('element-type-canvas').click();

  // Fill in the element name
  const nameInput = page.getByTestId('element-name-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill('My Canvas');

  // Submit
  await page.getByTestId('create-element-button').click();

  // Wait for the element to appear in the tree and the tab to open
  await expect(page.getByTestId('element-My Canvas')).toBeVisible();

  // The canvas tab should now be open — wait for the canvas container
  await expect(page.getByTestId('canvas-container')).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Canvas Tab', () => {
  test('basic structure, sidebar, and zoom defaults', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    await test.step('canvas tab opens with toolbar and stage', async () => {
      await expect(page).toHaveURL(/canvas\/.+/);
      await expect(page.getByTestId('canvas-container')).toBeVisible();
      await expect(page.getByTestId('canvas-toolbar')).toBeVisible();
      await expect(page.getByTestId('canvas-stage')).toBeVisible();
    });

    await test.step('sidebar shows layers and objects panels', async () => {
      const sidebar = page.getByTestId('canvas-sidebar');
      await expect(sidebar).toBeVisible();
      await expect(sidebar.getByTestId('layers-header')).toBeVisible();
      await expect(sidebar.getByTestId('objects-header')).toBeVisible();
    });

    await test.step('default Layer 1 is present', async () => {
      await expect(
        page
          .getByTestId('canvas-sidebar')
          .getByTestId('layer-name')
          .filter({ hasText: 'Layer 1' })
      ).toBeVisible();
    });

    await test.step('objects list shows empty state', async () => {
      await expect(
        page.getByTestId('canvas-sidebar').getByTestId('objects-empty')
      ).toBeVisible();
    });

    await test.step('zoom label starts at 100%', async () => {
      await expect(
        page.getByTestId('canvas-toolbar').getByTestId('zoom-label')
      ).toHaveText('100%');
    });

    await test.step('sidebar can collapse and expand', async () => {
      await expect(page.getByTestId('canvas-sidebar')).toBeVisible();

      await page
        .getByTestId('canvas-sidebar')
        .getByRole('button', { name: /collapse sidebar/i })
        .click();

      await expect(page.getByTestId('canvas-sidebar')).not.toBeVisible();
      await expect(page.getByTestId('canvas-collapsed-sidebar')).toBeVisible();

      await page
        .getByTestId('canvas-collapsed-sidebar')
        .getByRole('button', { name: /expand sidebar/i })
        .click();

      await expect(page.getByTestId('canvas-sidebar')).toBeVisible();
    });
  });

  test('layer CRUD: add, rename, duplicate, delete, reorder, opacity', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const sidebar = page.getByTestId('canvas-sidebar');

    await test.step('rename Layer 1 → Background via context menu', async () => {
      await sidebar
        .getByTestId('layer-item')
        .first()
        .getByRole('button', { name: /more/i })
        .click();

      await page.getByRole('menuitem', { name: /rename/i }).click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();

      const input = dialog.getByRole('textbox').first();
      await input.waitFor({ state: 'visible' });
      await expect(input).not.toHaveValue('');
      await input.clear();
      await input.fill('Background');
      await expect(input).toHaveValue('Background');

      const confirmButton = dialog.getByRole('button', {
        name: /rename|save|ok|confirm/i,
      });
      await expect(confirmButton).toBeEnabled();
      await confirmButton.click();
      await expect(dialog).not.toBeVisible();

      await expect(
        sidebar.getByTestId('layer-name').filter({ hasText: 'Background' })
      ).toBeVisible();
    });

    await test.step('duplicate the layer (now 2 layers)', async () => {
      await sidebar
        .getByTestId('layer-item')
        .first()
        .getByRole('button', { name: /more/i })
        .click();
      await page.getByRole('menuitem', { name: /duplicate/i }).click();

      await expect(sidebar.getByTestId('layer-item')).toHaveCount(2);
      // Both layers should reference "Background" name
      await expect(sidebar.getByTestId('layer-name').nth(1)).toContainText(
        'Background'
      );
    });

    await test.step('delete the duplicate (back to 1 layer)', async () => {
      await page.mouse.move(0, 0);

      await sidebar
        .getByTestId('layer-item')
        .first()
        .getByRole('button', { name: /more/i })
        .click();

      await page.getByRole('menuitem', { name: /delete/i }).click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: /delete/i }).click();
      await expect(dialog).not.toBeVisible();

      await expect(sidebar.getByTestId('layer-item')).toHaveCount(1);
    });

    await test.step('add a new layer via Add Layer button', async () => {
      await sidebar.getByRole('button', { name: /add layer/i }).click();
      await expect(sidebar.getByTestId('layer-item')).toHaveCount(2);
    });

    await test.step('newly added layer becomes active', async () => {
      const lastLayer = sidebar.getByTestId('layer-item').last();
      await expect(lastLayer).toHaveClass(/active/);
    });

    await test.step('clicking a layer makes it active', async () => {
      const layers = sidebar.getByTestId('layer-item');
      await layers.first().click();
      await expect(layers.first()).toHaveClass(/active/);
      await expect(layers.last()).not.toHaveClass(/active/);
    });

    await test.step('reorder layers via move up / move down', async () => {
      const layers = sidebar.getByTestId('layer-item');

      // Capture starting names
      const firstName = await layers
        .first()
        .getByTestId('layer-name')
        .textContent();
      const lastName = await layers
        .last()
        .getByTestId('layer-name')
        .textContent();

      // Open the menu on the bottom layer and Move up
      await layers
        .last()
        .getByRole('button', { name: /more options/i })
        .click();
      await page.getByTestId('layer-move-up').click();

      await expect(layers.first().getByTestId('layer-name')).toHaveText(
        lastName ?? ''
      );
      await expect(layers.last().getByTestId('layer-name')).toHaveText(
        firstName ?? ''
      );

      // Move down on the new top item to swap back
      await layers
        .first()
        .getByRole('button', { name: /more options/i })
        .click();
      await page.getByTestId('layer-move-down').click();

      await expect(layers.first().getByTestId('layer-name')).toHaveText(
        firstName ?? ''
      );
    });

    await test.step('opacity slider exists on the active layer only', async () => {
      // Active layer is currently the last (Layer 2 / "Layer 2")
      const slider = sidebar.getByTestId('layer-opacity');
      await expect(slider).toHaveCount(1);
      await expect(slider).toBeVisible();
      await expect(slider).toHaveAttribute('min', '0');
      await expect(slider).toHaveAttribute('max', '1');
      await expect(slider).toHaveValue('1');

      await slider.evaluate(el => {
        const input = el as HTMLInputElement;
        input.value = '0.4';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await expect(slider).toHaveValue('0.4');
    });
  });

  test('layer visibility and lock toggles', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const layer = page
      .getByTestId('canvas-sidebar')
      .getByTestId('layer-item')
      .first();

    await test.step('toggle visibility off then on', async () => {
      const visibilityButton = layer.getByTestId('layer-visibility');

      await expect(visibilityButton.locator('mat-icon')).toContainText(
        'visibility'
      );

      await visibilityButton.click();
      await expect(visibilityButton.locator('mat-icon')).toContainText(
        'visibility_off'
      );

      await visibilityButton.click();
      await expect(visibilityButton.locator('mat-icon')).toContainText(
        'visibility'
      );
    });

    await test.step('toggle lock', async () => {
      const lockButton = layer.getByTestId('layer-lock');

      await expect(lockButton.locator('mat-icon')).toContainText('lock_open');

      await lockButton.click();
      await expect(lockButton.locator('mat-icon')).toContainText('lock');
    });
  });

  test('toolbar: tool switching, zoom, export, shape submenu, context menu', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const toolbar = page.getByTestId('canvas-toolbar');
    const sidebar = page.getByTestId('canvas-sidebar');

    await test.step('switch between navigation tools', async () => {
      await expect(
        toolbar.getByRole('button', { name: /Select \(V\)/i })
      ).toHaveClass(/active/);

      await toolbar.getByRole('button', { name: /Pan/i }).click();
      await expect(toolbar.getByRole('button', { name: /Pan/i })).toHaveClass(
        /active/
      );

      await toolbar.getByRole('button', { name: /Rectangle select/i }).click();
      await expect(
        toolbar.getByRole('button', { name: /Rectangle select/i })
      ).toHaveClass(/active/);
    });

    await test.step('creation tools enabled when a layer exists', async () => {
      await expect(
        toolbar.getByRole('button', { name: /Place pin/i })
      ).not.toBeDisabled();
      await expect(
        toolbar.getByRole('button', { name: /Freehand draw/i })
      ).not.toBeDisabled();
      await expect(
        toolbar.getByRole('button', { name: /Add text/i })
      ).not.toBeDisabled();

      await toolbar.getByRole('button', { name: /Freehand draw/i }).click();
      await expect(
        toolbar.getByRole('button', { name: /Freehand draw/i })
      ).toHaveClass(/active/);

      await toolbar.getByRole('button', { name: /Line/i }).click();
      await expect(toolbar.getByRole('button', { name: /Line/i })).toHaveClass(
        /active/
      );
    });

    await test.step('palette button disabled with no selection', async () => {
      await expect(
        toolbar.getByRole('button', { name: /edit object colors/i })
      ).toBeDisabled();
    });

    await test.step('shape submenu opens and selects Ellipse', async () => {
      await toolbar.getByRole('button', { name: /Shape \(S\)/i }).click();

      await expect(
        page.getByRole('menuitem', { name: /Ellipse/i })
      ).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: /Rectangle/i })
      ).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: /Arrow/i })
      ).toBeVisible();

      await page.getByRole('menuitem', { name: /Ellipse/i }).click();

      await expect(
        toolbar.getByRole('button', { name: /Shape \(S\)/i })
      ).toHaveClass(/active/);
    });

    const zoomLabel = toolbar.getByTestId('zoom-label');

    await test.step('zoom in updates label above 100%', async () => {
      await expect(zoomLabel).toHaveText('100%');

      await toolbar.getByRole('button', { name: /zoom in/i }).click();

      await expect(zoomLabel).not.toHaveText('100%');
      const text = await zoomLabel.textContent();
      const value = Number.parseInt(text?.replaceAll('%', '') ?? '100', 10);
      expect(value).toBeGreaterThan(100);
    });

    await test.step('clicking zoom label resets to 100%', async () => {
      await zoomLabel.click();
      await expect(zoomLabel).toHaveText('100%');
    });

    await test.step('zoom out updates label below 100%', async () => {
      await toolbar.getByRole('button', { name: /zoom out/i }).click();

      await expect(zoomLabel).not.toHaveText('100%');
      const text = await zoomLabel.textContent();
      const value = Number.parseInt(text?.replaceAll('%', '') ?? '100', 10);
      expect(value).toBeLessThan(100);

      // Reset before continuing so subsequent steps start from a known state.
      await zoomLabel.click();
      await expect(zoomLabel).toHaveText('100%');
    });

    await test.step('export menu shows all options', async () => {
      await sidebar.getByRole('button', { name: /export canvas/i }).click();

      await expect(
        page.getByRole('menuitem', { name: /export as png/i }).first()
      ).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: /high-res/i })
      ).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: /export as svg/i })
      ).toBeVisible();

      await page.keyboard.press('Escape');
    });

    await test.step('right-click opens context menu with disabled selection actions', async () => {
      const stage = page.getByTestId('canvas-stage');
      await stage.click({ button: 'right' });

      await expect(page.getByRole('menuitem', { name: /^Cut$/ })).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: /^Copy$/ })
      ).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: /^Paste$/ })
      ).toBeVisible();
      await expect(
        page.getByRole('menuitem', { name: /^Delete$/ })
      ).toBeVisible();

      await expect(
        page.getByRole('menuitem', { name: /^Cut$/ })
      ).toBeDisabled();
      await expect(
        page.getByRole('menuitem', { name: /^Copy$/ })
      ).toBeDisabled();
      await expect(
        page.getByRole('menuitem', { name: /^Delete$/ })
      ).toBeDisabled();

      await expect(page.getByTestId('object-bring-to-front')).toHaveCount(0);

      await page.keyboard.press('Escape');
    });
  });
});
