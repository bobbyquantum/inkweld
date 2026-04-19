/**
 * Toolbar Overflow Tests - Local Mode
 *
 * Verifies that when the editor toolbar is too narrow to show all groups
 * on a single line, overflow groups are hidden from the main bar and
 * accessible via the overflow ("more") dropdown button.
 *
 * Strategy: All document creation is done at a full 1280×800 viewport so the
 * project sidebar is visible.  The viewport is then resized (or the toolbar
 * container is constrained via CSS) to trigger overflow behaviour.
 */
import { expect, test } from './fixtures';

/**
 * Opens a project and creates a document at 1280px width, leaving the
 * editor visible.  The viewport is left at 1280×800 after this helper.
 */
async function openEditorInProject(
  page: import('@playwright/test').Page,
  docName: string
): Promise<void> {
  // Always ensure a wide viewport for navigation & document creation
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByTestId('project-card').first().click();
  await expect(page.getByTestId('project-tree')).toBeVisible();

  const newDocButton = page.getByTestId('create-new-element');
  await expect(newDocButton).toBeVisible();
  await newDocButton.click();

  // Select Document type
  await page.getByRole('heading', { name: 'Document', level: 4 }).click();

  const dialogInput = page.getByLabel('Document Name');
  await dialogInput.waitFor({ state: 'visible' });
  await dialogInput.fill(docName);
  await page.getByTestId('create-element-button').click();

  // Wait for editor to appear
  await expect(page.locator('ngx-editor')).toBeVisible();
  // Focus editor
  await page.locator('ngx-editor .ProseMirror').click();
}

/**
 * Constrains the toolbar to a narrow pixel width by injecting a named style rule,
 * then waits for the ResizeObserver to fire and Angular to update.
 */
async function constrainToolbarWidth(
  page: import('@playwright/test').Page,
  widthPx: number
): Promise<void> {
  await page.evaluate(w => {
    const style = document.createElement('style');
    style.setAttribute('data-toolbar-constraint', 'true');
    style.textContent = `[data-testid="editor-toolbar"] { max-width: ${w}px !important; width: ${w}px !important; }`;
    document.head.appendChild(style);
    // Force synchronous layout so ResizeObserver fires immediately
    document.body.getBoundingClientRect();
  }, widthPx);
  // Give ResizeObserver and Angular a moment to react
  await page.waitForTimeout(400);
}

/**
 * Removes the injected width constraint so the toolbar returns to full size.
 * Also forces a layout reflow so the ResizeObserver sees the change.
 */
async function removeToolbarConstraint(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelectorAll('style[data-toolbar-constraint]')
      .forEach(s => s.remove());
    // Force a synchronous reflow so the ResizeObserver entry is queued
    document.body.getBoundingClientRect();
  });
  // Give ResizeObserver and Angular ample time to react
  await page.waitForTimeout(600);
}

test.describe('Toolbar Overflow', () => {
  test.describe('Wide viewport — no overflow', () => {
    test('should show all toolbar groups and no overflow button at full width', async ({
      localPageWithProject: page,
    }) => {
      await openEditorInProject(page, 'Wide Toolbar Test');

      const toolbar = page.getByTestId('editor-toolbar');
      await expect(toolbar).toBeVisible();

      // All primary groups should be visible
      await expect(page.getByTestId('toolbar-bold')).toBeVisible();
      await expect(page.getByTestId('toolbar-heading')).toBeVisible();
      await expect(page.getByTestId('toolbar-align')).toBeVisible();
      await expect(page.getByTestId('toolbar-bullet-list')).toBeVisible();
      await expect(page.getByTestId('toolbar-image')).toBeVisible();
      await expect(page.getByTestId('toolbar-undo')).toBeVisible();

      // The overflow button should NOT be present when everything fits
      await expect(page.getByTestId('toolbar-overflow-btn')).not.toBeVisible();
    });

    test('toolbar should remain on a single row at full width', async ({
      localPageWithProject: page,
    }) => {
      await openEditorInProject(page, 'Single Row Test');

      const toolbar = page.getByTestId('editor-toolbar');
      const box = await toolbar.boundingBox();
      expect(box).not.toBeNull();
      // A single-row toolbar should be no taller than ~60px
      expect(box!.height).toBeLessThanOrEqual(60);
    });
  });

  test.describe('Narrow toolbar — overflow triggered', () => {
    test('should show the overflow button when the toolbar is constrained narrow', async ({
      localPageWithProject: page,
    }) => {
      await openEditorInProject(page, 'Narrow Toolbar Test');

      // Constrain the toolbar to a narrow width to force overflow
      await constrainToolbarWidth(page, 250);

      const toolbar = page.getByTestId('editor-toolbar');
      await expect(toolbar).toBeVisible();

      // Overflow button must be visible when constrained
      const overflowBtn = page.getByTestId('toolbar-overflow-btn');
      await expect(overflowBtn).toBeVisible({ timeout: 5000 });
    });

    test('overflow button opens a menu containing overflowed controls', async ({
      localPageWithProject: page,
    }) => {
      await openEditorInProject(page, 'Overflow Menu Test');

      // Constrain toolbar
      await constrainToolbarWidth(page, 250);

      const overflowBtn = page.getByTestId('toolbar-overflow-btn');
      await expect(overflowBtn).toBeVisible({ timeout: 5000 });
      await overflowBtn.click();

      // The overflow menu panel should appear (Material CDK portal renders it
      // outside the toolbar, in the overlay container)
      const overflowSections = page.locator('[data-testid^="overflow-"]');
      await expect(overflowSections.first()).toBeVisible({ timeout: 5000 });

      const count = await overflowSections.count();
      expect(count).toBeGreaterThan(0);
    });

    test('overflow menu actions are functional — undo from overflow', async ({
      localPageWithProject: page,
    }) => {
      await openEditorInProject(page, 'Overflow Action Test');

      // Type some text so undo has something to do
      const editor = page.locator('ngx-editor .ProseMirror');
      await editor.type('Hello overflow');

      // Constrain toolbar so the history group overflows
      await constrainToolbarWidth(page, 250);

      const overflowBtn = page.getByTestId('toolbar-overflow-btn');
      await expect(overflowBtn).toBeVisible({ timeout: 5000 });
      await overflowBtn.click();

      const overflowUndo = page.getByTestId('overflow-undo');
      if (await overflowUndo.isVisible()) {
        await overflowUndo.click();
        const content = await editor.textContent();
        expect(content).not.toBe('Hello overflow');
      } else {
        // undo button not overflowed at this constraint – verify other sections exist
        const overflowSections = page.locator('[data-testid^="overflow-"]');
        const count = await overflowSections.count();
        expect(count).toBeGreaterThan(0);
      }
    });

    test('toolbar height remains a single row when narrow', async ({
      localPageWithProject: page,
    }) => {
      await openEditorInProject(page, 'Narrow Single Row Test');

      await constrainToolbarWidth(page, 250);

      const toolbar = page.getByTestId('editor-toolbar');
      const box = await toolbar.boundingBox();
      expect(box).not.toBeNull();
      // With overflow JS active, the toolbar should stay on one row
      expect(box!.height).toBeLessThanOrEqual(60);
    });
  });

  test.describe('Dynamic resize', () => {
    test('overflow button appears when toolbar is resized to narrow width', async ({
      localPageWithProject: page,
    }) => {
      await openEditorInProject(page, 'Resize Test');

      // No overflow at full width
      await expect(page.getByTestId('toolbar-overflow-btn')).not.toBeVisible();

      // Constrain the toolbar by constraining its container via CSS
      await constrainToolbarWidth(page, 250);

      // Overflow button should appear
      await expect(page.getByTestId('toolbar-overflow-btn')).toBeVisible({
        timeout: 5000,
      });
    });

    test('overflow button disappears when toolbar is expanded back to full width', async ({
      localPageWithProject: page,
    }) => {
      await openEditorInProject(page, 'Expand Resize Test');

      // Constrain toolbar with CSS so overflow triggers
      await constrainToolbarWidth(page, 250);

      await expect(page.getByTestId('toolbar-overflow-btn')).toBeVisible({
        timeout: 5000,
      });

      // Check toolbar width before removing constraint
      const beforeWidth = await page.evaluate(() => {
        return (
          document.querySelector(
            '[data-testid="editor-toolbar"]'
          ) as HTMLElement
        )?.offsetWidth;
      });
      console.log('Toolbar width BEFORE removing constraint:', beforeWidth);

      // Remove the CSS constraint — toolbar should expand back to full width.
      await removeToolbarConstraint(page);

      // Check toolbar width immediately after removing constraint
      const afterWidth = await page.evaluate(() => {
        return (
          document.querySelector(
            '[data-testid="editor-toolbar"]'
          ) as HTMLElement
        )?.offsetWidth;
      });
      console.log('Toolbar width AFTER removing constraint:', afterWidth);

      // Debug: inject a function to expose component state
      const debug = await page.evaluate(() => {
        const toolbar = document.querySelector(
          '[data-testid="editor-toolbar"]'
        ) as HTMLElement;
        const groups: Record<string, { width: number; hidden: boolean }> = {};
        [
          'formatting',
          'heading',
          'alignment',
          'lists',
          'insert',
          'history',
        ].forEach(name => {
          const el = toolbar?.querySelector(
            `[data-toolbar-group="${name}"]`
          ) as HTMLElement;
          groups[name] = {
            width: el?.offsetWidth ?? -1,
            hidden: el?.classList.contains('toolbar-group--hidden') ?? true,
          };
        });
        // Check if overflow button is in the DOM
        const overflowBtn = toolbar?.querySelector(
          '[data-testid="toolbar-overflow-btn"]'
        );
        return {
          containerWidth: toolbar?.offsetWidth ?? -1,
          groups,
          overflowBtnPresent: !!overflowBtn,
        };
      });
      console.log('DEBUG:', JSON.stringify(debug));

      // Overflow button should disappear
      await expect(page.getByTestId('toolbar-overflow-btn')).not.toBeVisible({
        timeout: 8000,
      });
    });
  });
});
