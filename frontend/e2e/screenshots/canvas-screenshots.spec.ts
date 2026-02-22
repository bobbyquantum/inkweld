/**
 * Canvas Tab Screenshot Tests
 *
 * Captures screenshots demonstrating the Canvas element type:
 * - Full canvas tab with sidebar and toolbar (overview)
 * - Sidebar detail showing layers panel
 * - Toolbar showing all tool buttons
 * - Both light and dark mode variants
 *
 * Uses local mode (no server) since canvas elements are stored entirely
 * in the browser's local IndexedDB.
 */

import { Page } from '@playwright/test';
import { join } from 'path';

import { dismissToastIfPresent } from '../common/test-helpers';
import { test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

test.describe('Canvas Tab Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  /**
   * Helper: set up a project and canvas element in local mode.
   * The `offlinePage` fixture already configures localStorage for local mode;
   * we just need to navigate and create the project + canvas element via the UI.
   */
  async function setupCanvas(page: Page): Promise<void> {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Create a project (empty state — no prior projects in offline mode)
    const createButton = page.getByTestId('create-first-project-button');
    await createButton.waitFor({ timeout: 15_000 });
    await createButton.click();

    // Step 1: Template selection — accept default (empty)
    const nextButton = page.getByTestId('next-step-button');
    await nextButton.waitFor({ timeout: 10_000 });
    await nextButton.click();

    // Step 2: Project details
    const titleInput = page.getByTestId('project-title-input');
    await titleInput.waitFor({ timeout: 10_000 });
    await titleInput.fill('World Atlas');

    const slugInput = page.getByTestId('project-slug-input');
    await slugInput.fill('world-atlas');

    const submitButton = page.getByTestId('create-project-button');
    await submitButton.waitFor();
    await submitButton.click();

    // Wait for navigation to the project
    await page.waitForURL(/world-atlas/, { timeout: 15_000 });
    await page.waitForLoadState('domcontentloaded');

    // Dismiss the "Project created successfully!" toast if present
    await dismissToastIfPresent(page);

    // Create a canvas element
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-canvas').click();

    const nameInput = page.getByTestId('element-name-input');
    await nameInput.waitFor({ state: 'visible', timeout: 10_000 });
    await nameInput.fill('World Map');

    await page.getByTestId('create-element-button').click();

    // Wait for the canvas tab to open
    await page.waitForSelector('[data-testid="canvas-container"]', {
      state: 'visible',
      timeout: 15_000,
    });

    // Add a second layer so the sidebar looks more interesting
    await page
      .getByTestId('canvas-sidebar')
      .getByRole('button', { name: /add layer/i })
      .click();

    // ── Draw some shapes on layer 1 so the canvas looks populated ──────────────
    const canvasStage = page.getByTestId('canvas-stage');
    const box = await canvasStage.boundingBox();

    if (box) {
      const { x: cx, y: cy, width: cw, height: ch } = box;

      /** Drag from (sx,sy) to (ex,ey) in canvas-relative coords to draw a shape */
      const dragShape = async (
        sx: number,
        sy: number,
        ex: number,
        ey: number
      ) => {
        await page.mouse.move(cx + sx, cy + sy);
        await page.mouse.down();
        await page.mouse.move(cx + ex, cy + ey, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(80);
      };

      const toolbar = page.getByTestId('canvas-toolbar');

      // ── Rectangles ───────────────────────────────────────────────────────
      await toolbar.getByRole('button', { name: /Shape \(S\)/i }).click();
      await page.getByRole('menuitem', { name: /Rectangle/i }).click();

      // Three rectangles at different positions / sizes
      await dragShape(cw * 0.08, ch * 0.12, cw * 0.36, ch * 0.44);
      await dragShape(cw * 0.44, ch * 0.08, cw * 0.74, ch * 0.4);
      await dragShape(cw * 0.22, ch * 0.52, cw * 0.58, ch * 0.76);

      // ── Ellipse ──────────────────────────────────────────────────────────
      await toolbar.getByRole('button', { name: /Shape \(S\)/i }).click();
      await page.getByRole('menuitem', { name: /Ellipse/i }).click();

      await dragShape(cw * 0.62, ch * 0.52, cw * 0.88, ch * 0.8);

      // ── Line ─────────────────────────────────────────────────────────────
      await toolbar.getByRole('button', { name: /Line \(L\)/i }).click();
      await page.mouse.move(cx + cw * 0.08, cy + ch * 0.8);
      await page.mouse.down();
      await page.mouse.move(cx + cw * 0.6, cy + ch * 0.88, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(80);

      // Second line
      await page.mouse.move(cx + cw * 0.36, cy + ch * 0.44);
      await page.mouse.down();
      await page.mouse.move(cx + cw * 0.44, cy + ch * 0.4, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(80);

      // Switch back to select tool so no ghost tool state lingers
      await toolbar.getByRole('button', { name: /Select \(V\)/i }).click();
    }

    // Move mouse away to dismiss any tooltip overlay
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
  }

  // ── Light mode ──────────────────────────────────────────────────────────────

  test('canvas tab overview (light)', async ({ offlinePage: page }) => {
    await setupCanvas(page);

    const container = page.getByTestId('canvas-container');
    await captureElementScreenshot(
      page,
      [container],
      join(screenshotsDir, 'canvas-tab-overview-light.png'),
      0
    );
  });

  test('canvas sidebar (light)', async ({ offlinePage: page }) => {
    await setupCanvas(page);

    const sidebar = page.getByTestId('canvas-sidebar');
    await captureElementScreenshot(
      page,
      [sidebar],
      join(screenshotsDir, 'canvas-tab-sidebar-light.png'),
      8
    );
  });

  test('canvas toolbar (light)', async ({ offlinePage: page }) => {
    await setupCanvas(page);

    const toolbar = page.getByTestId('canvas-toolbar');
    await captureElementScreenshot(
      page,
      [toolbar],
      join(screenshotsDir, 'canvas-tab-toolbar-light.png'),
      8
    );
  });

  // ── Dark mode ────────────────────────────────────────────────────────────────

  test('canvas tab overview (dark)', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupCanvas(page);

    const container = page.getByTestId('canvas-container');
    await captureElementScreenshot(
      page,
      [container],
      join(screenshotsDir, 'canvas-tab-overview-dark.png'),
      0
    );
  });

  test('canvas sidebar (dark)', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupCanvas(page);

    const sidebar = page.getByTestId('canvas-sidebar');
    await captureElementScreenshot(
      page,
      [sidebar],
      join(screenshotsDir, 'canvas-tab-sidebar-dark.png'),
      8
    );
  });

  test('canvas toolbar (dark)', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupCanvas(page);

    const toolbar = page.getByTestId('canvas-toolbar');
    await captureElementScreenshot(
      page,
      [toolbar],
      join(screenshotsDir, 'canvas-tab-toolbar-dark.png'),
      8
    );
  });
});
