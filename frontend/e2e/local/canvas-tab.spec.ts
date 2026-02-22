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
 */

import { Page } from '@playwright/test';

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
  // ── Loading & basic structure ─────────────────────────────────────────────

  test('should create a canvas element and open the canvas tab', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    // URL should contain 'canvas'
    await expect(page).toHaveURL(/canvas\/.+/);

    // Canvas container and toolbar must be present
    await expect(page.getByTestId('canvas-container')).toBeVisible();
    await expect(page.getByTestId('canvas-toolbar')).toBeVisible();
    await expect(page.getByTestId('canvas-stage')).toBeVisible();
  });

  test('should show sidebar with layers and objects panels', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const sidebar = page.getByTestId('canvas-sidebar');
    await expect(sidebar).toBeVisible();

    // Default layer and objects sections should be present
    await expect(sidebar.getByText('Layers', { exact: true })).toBeVisible();
    await expect(sidebar.getByText('Objects', { exact: true })).toBeVisible();
  });

  test('should show a default Layer 1 in the sidebar', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    await expect(
      page.getByTestId('canvas-sidebar').locator('.layer-name', {
        hasText: 'Layer 1',
      })
    ).toBeVisible();
  });

  test('should show empty-state in objects list when there are no objects', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    // Objects section empty state
    await expect(
      page.getByTestId('canvas-sidebar').getByText('No objects on this layer.')
    ).toBeVisible();
  });

  test('should display zoom level at 100%', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    await expect(
      page.getByTestId('canvas-toolbar').locator('.zoom-label')
    ).toHaveText('100%');
  });

  // ── Sidebar collapse / expand ─────────────────────────────────────────────

  test('should collapse and expand the sidebar', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    // Sidebar is initially open
    await expect(page.getByTestId('canvas-sidebar')).toBeVisible();

    // Click collapse button (tooltip: "Collapse sidebar")
    await page
      .getByTestId('canvas-sidebar')
      .getByRole('button', { name: /collapse sidebar/i })
      .click();

    // Sidebar should be hidden, collapsed strip shown
    await expect(page.getByTestId('canvas-sidebar')).not.toBeVisible();
    await expect(page.getByTestId('canvas-collapsed-sidebar')).toBeVisible();

    // Re-expand via the collapsed strip button
    await page
      .getByTestId('canvas-collapsed-sidebar')
      .getByRole('button', { name: /expand sidebar/i })
      .click();

    await expect(page.getByTestId('canvas-sidebar')).toBeVisible();
  });

  // ── Layer CRUD ────────────────────────────────────────────────────────────

  test('should add a new layer via the Add Layer button', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    // Click the add-layer button (tooltip: "Add layer")
    await page
      .getByTestId('canvas-sidebar')
      .getByRole('button', { name: /add layer/i })
      .click();

    // There should now be two layer items
    await expect(
      page.getByTestId('canvas-sidebar').locator('.layer-item')
    ).toHaveCount(2);
  });

  test('should make a new layer the active layer after adding it', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    await page
      .getByTestId('canvas-sidebar')
      .getByRole('button', { name: /add layer/i })
      .click();

    // The most recently added layer item should have the 'active' class
    const lastLayer = page
      .getByTestId('canvas-sidebar')
      .locator('.layer-item')
      .last();
    await expect(lastLayer).toHaveClass(/active/);
  });

  test('should rename a layer via the layer context menu', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    // Open the layer's context menu (more_vert button)
    await page
      .getByTestId('canvas-sidebar')
      .locator('.layer-item')
      .first()
      .getByRole('button', { name: /more/i })
      .click();

    // Click Rename in the menu
    await page.getByRole('menuitem', { name: /rename/i }).click();

    // Wait for the rename dialog
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toBeVisible();

    // Clear the name and type a new one
    const input = dialog.getByRole('textbox').first();
    await input.clear();
    await input.fill('Background');

    // Confirm
    await dialog
      .getByRole('button', { name: /rename|save|ok|confirm/i })
      .click();
    await expect(dialog).not.toBeVisible();

    // The layer should now have the new name
    await expect(
      page.getByTestId('canvas-sidebar').locator('.layer-name', {
        hasText: 'Background',
      })
    ).toBeVisible();
  });

  test('should duplicate a layer via the layer context menu', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    // Open layer menu
    await page
      .getByTestId('canvas-sidebar')
      .locator('.layer-item')
      .first()
      .getByRole('button', { name: /more/i })
      .click();

    await page.getByRole('menuitem', { name: /duplicate/i }).click();

    // Now two layers should exist
    await expect(
      page.getByTestId('canvas-sidebar').locator('.layer-item')
    ).toHaveCount(2);

    // The duplicate keeps the layer name prefix
    await expect(
      page.getByTestId('canvas-sidebar').locator('.layer-name').nth(1)
    ).toContainText('Layer 1');
  });

  test('should delete a layer after confirmation (with 2 layers)', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    // Add a second layer so we can delete the first
    await page
      .getByTestId('canvas-sidebar')
      .getByRole('button', { name: /add layer/i })
      .click();
    await expect(
      page.getByTestId('canvas-sidebar').locator('.layer-item')
    ).toHaveCount(2);
    // Move the mouse away to dismiss any tooltip overlays before clicking "More options"
    await page.mouse.move(0, 0);

    // Open the first layer's menu and click Delete
    await page
      .getByTestId('canvas-sidebar')
      .locator('.layer-item')
      .first()
      .getByRole('button', { name: /more/i })
      .click();

    await page.getByRole('menuitem', { name: /delete/i }).click();

    // Confirm in the dialog
    const dialog = page.locator('mat-dialog-container');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /delete/i }).click();
    await expect(dialog).not.toBeVisible();

    // Back to one layer
    await expect(
      page.getByTestId('canvas-sidebar').locator('.layer-item')
    ).toHaveCount(1);
  });

  // ── Layer toggles ─────────────────────────────────────────────────────────

  test('should toggle layer visibility', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const visibilityButton = page
      .getByTestId('canvas-sidebar')
      .locator('.layer-item')
      .first()
      .locator('.layer-visibility');

    // Initially visible — icon says 'visibility'
    await expect(visibilityButton.locator('mat-icon')).toContainText(
      'visibility'
    );

    await visibilityButton.click();

    // After toggle — icon says 'visibility_off'
    await expect(visibilityButton.locator('mat-icon')).toContainText(
      'visibility_off'
    );

    // Toggle back
    await visibilityButton.click();
    await expect(visibilityButton.locator('mat-icon')).toContainText(
      'visibility'
    );
  });

  test('should toggle layer lock', async ({ localPageWithProject: page }) => {
    await createCanvasAndOpen(page);

    const lockButton = page
      .getByTestId('canvas-sidebar')
      .locator('.layer-item')
      .first()
      .locator('.layer-lock');

    // Initially unlocked
    await expect(lockButton.locator('mat-icon')).toContainText('lock_open');

    await lockButton.click();

    // After lock
    await expect(lockButton.locator('mat-icon')).toContainText('lock');
  });

  // ── Toolbar tool switching ────────────────────────────────────────────────

  test('should switch between navigation tools', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const toolbar = page.getByTestId('canvas-toolbar');

    // Default tool is Select (V) — its button should have 'active' class
    await expect(
      toolbar.getByRole('button', { name: /Select \(V\)/i })
    ).toHaveClass(/active/);

    // Switch to Pan
    await toolbar.getByRole('button', { name: /Pan/i }).click();
    await expect(toolbar.getByRole('button', { name: /Pan/i })).toHaveClass(
      /active/
    );

    // Switch to Rectangle Select
    await toolbar.getByRole('button', { name: /Rectangle select/i }).click();
    await expect(
      toolbar.getByRole('button', { name: /Rectangle select/i })
    ).toHaveClass(/active/);
  });

  test('should switch to creation tools when a layer exists', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const toolbar = page.getByTestId('canvas-toolbar');

    // Creation tools should be enabled (a default layer exists)
    await expect(
      toolbar.getByRole('button', { name: /Place pin/i })
    ).not.toBeDisabled();
    await expect(
      toolbar.getByRole('button', { name: /Freehand draw/i })
    ).not.toBeDisabled();
    await expect(
      toolbar.getByRole('button', { name: /Add text/i })
    ).not.toBeDisabled();

    // Switch to freehand draw
    await toolbar.getByRole('button', { name: /Freehand draw/i }).click();
    await expect(
      toolbar.getByRole('button', { name: /Freehand draw/i })
    ).toHaveClass(/active/);

    // Switch to Line
    await toolbar.getByRole('button', { name: /Line/i }).click();
    await expect(toolbar.getByRole('button', { name: /Line/i })).toHaveClass(
      /active/
    );
  });

  test('should show palette button disabled when no object is selected', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    await expect(
      page.getByTestId('canvas-toolbar').getByRole('button', {
        name: /edit object colors/i,
      })
    ).toBeDisabled();
  });

  // ── Zoom controls ─────────────────────────────────────────────────────────

  test('should zoom in and update zoom label', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const toolbar = page.getByTestId('canvas-toolbar');
    const zoomLabel = toolbar.locator('.zoom-label');

    await expect(zoomLabel).toHaveText('100%');

    // Click zoom-in
    await toolbar.getByRole('button', { name: /zoom in/i }).click();

    // Zoom label should now show a value > 100%
    const text = await zoomLabel.textContent();
    const value = parseInt(text?.replace('%', '') ?? '100', 10);
    expect(value).toBeGreaterThan(100);
  });

  test('should zoom out and update zoom label', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const toolbar = page.getByTestId('canvas-toolbar');
    const zoomLabel = toolbar.locator('.zoom-label');

    await expect(zoomLabel).toHaveText('100%');

    // Click zoom-out
    await toolbar.getByRole('button', { name: /zoom out/i }).click();

    // Zoom label should now show a value < 100%
    const text = await zoomLabel.textContent();
    const value = parseInt(text?.replace('%', '') ?? '100', 10);
    expect(value).toBeLessThan(100);
  });

  // ── Export menu ───────────────────────────────────────────────────────────

  test('should open export menu and show all export options', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    // The export button is in the sidebar header
    await page
      .getByTestId('canvas-sidebar')
      .getByRole('button', { name: /export canvas/i })
      .click();

    await expect(
      page.getByRole('menuitem', { name: /export as png/i }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: /high-res/i })
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: /export as svg/i })
    ).toBeVisible();

    // Dismiss menu
    await page.keyboard.press('Escape');
  });

  // ── Shape submenu ─────────────────────────────────────────────────────────

  test('should open shape submenu and switch shape types', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    const toolbar = page.getByTestId('canvas-toolbar');

    // Click the Shape button to open the shape submenu
    await toolbar.getByRole('button', { name: /Shape \(S\)/i }).click();

    // Submenu should appear
    await expect(
      page.getByRole('menuitem', { name: /Ellipse/i })
    ).toBeVisible();
    await expect(
      page.getByRole('menuitem', { name: /Rectangle/i })
    ).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Arrow/i })).toBeVisible();

    // Select Ellipse
    await page.getByRole('menuitem', { name: /Ellipse/i }).click();

    // The shape tool should now be active
    await expect(
      toolbar.getByRole('button', { name: /Shape \(S\)/i })
    ).toHaveClass(/active/);
  });

  // ── Select layer from sidebar ─────────────────────────────────────────────

  test('should select a layer by clicking it', async ({
    localPageWithProject: page,
  }) => {
    await createCanvasAndOpen(page);

    // Add a second layer
    await page
      .getByTestId('canvas-sidebar')
      .getByRole('button', { name: /add layer/i })
      .click();

    // The new layer (last) should be active
    const layers = page.getByTestId('canvas-sidebar').locator('.layer-item');
    await expect(layers.last()).toHaveClass(/active/);

    // Click the first layer to switch to it
    await layers.first().click();
    await expect(layers.first()).toHaveClass(/active/);
    await expect(layers.last()).not.toHaveClass(/active/);
  });
});
