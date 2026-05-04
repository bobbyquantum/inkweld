/**
 * Toolbar Overflow Tests - Local Mode
 *
 * Verifies that when the editor toolbar is too narrow to show all groups
 * on a single line, overflow groups are hidden from the main bar and
 * accessible via the overflow ("more") dropdown button.
 *
 * Strategy: All document creation is done at a full 1280×800 viewport so
 * the project sidebar is visible.  The toolbar container is then constrained
 * via injected CSS to trigger overflow behaviour without resizing the window.
 *
 * Consolidated from 8 individual tests into 3 grouped tests using
 * `test.step()` to share the (project + new doc + editor focus) setup.
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Opens a project and creates a document at 1280px width, leaving the
 * editor visible.  The viewport is left at 1280×800 after this helper.
 */
async function openEditorInProject(page: Page, docName: string): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByTestId('project-card').first().click();
  await expect(page.getByTestId('project-tree')).toBeVisible();

  const newDocButton = page.getByTestId('create-new-element');
  await expect(newDocButton).toBeVisible();
  await newDocButton.click();

  await page.getByRole('heading', { name: 'Document', level: 4 }).click();

  const dialogInput = page.getByLabel('Document Name');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(docName);
  await page.getByTestId('create-element-button').click();

  await expect(page.locator('ngx-editor')).toBeVisible();
  await page.locator('ngx-editor .ProseMirror').click();
}

/**
 * Constrains the toolbar to a narrow pixel width by injecting a named
 * style rule, then waits for ResizeObserver + Angular to update.
 */
async function constrainToolbarWidth(
  page: Page,
  widthPx: number
): Promise<void> {
  await page.evaluate(w => {
    const style = document.createElement('style');
    style.setAttribute('data-toolbar-constraint', 'true');
    style.textContent = `[data-testid="editor-toolbar"] { max-width: ${w}px !important; width: ${w}px !important; }`;
    document.head.appendChild(style);
    document.body.getBoundingClientRect();
  }, widthPx);
  await page.waitForTimeout(400);
}

/**
 * Removes the injected width constraint so the toolbar returns to full size.
 * Forces a layout reflow so the ResizeObserver sees the change.
 */
async function removeToolbarConstraint(page: Page): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelectorAll('style[data-toolbar-constraint]')
      .forEach(s => s.remove());
    document.body.getBoundingClientRect();
  });
  await page.waitForTimeout(600);
}

test.describe('Toolbar Overflow', () => {
  test('wide viewport: all groups visible, no overflow button, single-row height', async ({
    localPageWithProject: page,
  }) => {
    await openEditorInProject(page, 'Wide Toolbar Test');

    const toolbar = page.getByTestId('editor-toolbar');
    await expect(toolbar).toBeVisible();

    await test.step('all primary toolbar groups are visible', async () => {
      await expect(page.getByTestId('toolbar-bold')).toBeVisible();
      await expect(page.getByTestId('toolbar-heading')).toBeVisible();
      await expect(page.getByTestId('toolbar-align')).toBeVisible();
      await expect(page.getByTestId('toolbar-bullet-list')).toBeVisible();
      await expect(page.getByTestId('toolbar-image')).toBeVisible();
      await expect(page.getByTestId('toolbar-undo')).toBeVisible();
    });

    await test.step('overflow button is not present when everything fits', async () => {
      await expect(page.getByTestId('toolbar-overflow-btn')).not.toBeVisible();
    });

    await test.step('toolbar stays on a single row', async () => {
      const box = await toolbar.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThanOrEqual(60);
    });
  });

  test('narrow toolbar: overflow button appears, opens menu, action invokes, single-row height preserved', async ({
    localPageWithProject: page,
  }) => {
    await openEditorInProject(page, 'Narrow Toolbar Test');

    const toolbar = page.getByTestId('editor-toolbar');
    const overflowBtn = page.getByTestId('toolbar-overflow-btn');

    // Type some text first so the undo action in the overflow menu has
    // something to undo in the action-functional step below.
    const editor = page.locator('ngx-editor .ProseMirror');
    await editor.type('Hello overflow');

    await test.step('constraining width forces the overflow button to appear', async () => {
      await constrainToolbarWidth(page, 250);
      await expect(toolbar).toBeVisible();
      await expect(overflowBtn).toBeVisible();
    });

    await test.step('overflow button opens a menu containing overflowed controls', async () => {
      await overflowBtn.click();
      const overflowSections = page.locator('[data-testid^="overflow-"]');
      await expect(overflowSections.first()).toBeVisible();
      const count = await overflowSections.count();
      expect(count).toBeGreaterThan(0);

      // Close the menu before continuing so the next click is a fresh open.
      await page.keyboard.press('Escape');
    });

    await test.step('toolbar stays on a single row even when narrow', async () => {
      const box = await toolbar.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeLessThanOrEqual(60);
    });

    await test.step('overflow menu actions are functional (undo via overflow)', async () => {
      // Constrain more aggressively so the high-priority history group
      // is also forced into the overflow menu.
      await constrainToolbarWidth(page, 80);
      await expect(overflowBtn).toBeVisible();
      await overflowBtn.click();

      const overflowUndo = page.getByTestId('overflow-undo');
      await expect(overflowUndo).toBeVisible();
      await overflowUndo.click();
      await expect(editor).not.toContainText('Hello overflow');
    });
  });

  test('dynamic resize: overflow appears on constrain, disappears on release', async ({
    localPageWithProject: page,
  }) => {
    await openEditorInProject(page, 'Resize Test');

    const overflowBtn = page.getByTestId('toolbar-overflow-btn');

    await test.step('starts at full width with no overflow button', async () => {
      await expect(overflowBtn).not.toBeVisible();
    });

    await test.step('constraining triggers the overflow button', async () => {
      await constrainToolbarWidth(page, 250);
      await expect(overflowBtn).toBeVisible();
    });

    await test.step('removing the constraint hides the overflow button again', async () => {
      await removeToolbarConstraint(page);
      await expect(overflowBtn).not.toBeVisible();
    });
  });
});
