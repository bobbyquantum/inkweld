import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

/**
 * E2E coverage for the breadcrumb "quick nav" flyout.
 *
 * Verifies that:
 *   - Clicking a parent breadcrumb segment opens a Material flyout listing the
 *     segment's siblings.
 *   - Clicking a document row in the flyout navigates to that document.
 *
 * The test builds a two-level tree (folder > two documents) via the UI so the
 * flyout has real siblings to render. Element creation via the context menu
 * automatically opens each new element as a tab, so we switch tabs rather
 * than expanding the folder in the tree.
 */
test.describe('Breadcrumb quick-nav flyout', () => {
  test('clicking a parent segment opens a flyout of siblings and navigates', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120000);
    const stamp = Date.now();
    const projectTitle = `Breadcrumb Flyout ${stamp}`;
    const projectSlug = `breadcrumb-flyout-${stamp}`;
    const folderName = `ActOne-${stamp}`;
    const docA = `SceneA-${stamp}`;
    const docB = `SceneB-${stamp}`;

    // 1) Create a project (default worldbuilding-empty template).
    await createProjectWithTwoSteps(page, projectTitle, projectSlug);
    await page.waitForSelector('app-project-tree', { state: 'visible' });

    // 2) Create a folder at the root.
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-folder').click();
    await page.getByTestId('element-name-input').fill(folderName);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });
    await expect(
      page.locator(`[data-testid="element-${folderName}"]`).first()
    ).toBeVisible();

    // 3) Create "Scene A" inside the folder via the folder's context menu.
    //    Creating an element via the context menu opens it as a tab.
    await page
      .locator(`[data-testid="element-${folderName}"]`)
      .first()
      .click({ button: 'right' });
    await page.getByTestId('context-menu-new-element').click();
    await page.getByTestId('element-type-item').click();
    await page.getByTestId('element-name-input').fill(docA);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });

    // 4) Create "Scene B" inside the folder (same flow).
    await page
      .locator(`[data-testid="element-${folderName}"]`)
      .first()
      .click({ button: 'right' });
    await page.getByTestId('context-menu-new-element').click();
    await page.getByTestId('element-type-item').click();
    await page.getByTestId('element-name-input').fill(docB);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });

    // 5) Switch to the "Scene A" tab — the breadcrumb should show
    //    "ActOne > SceneA".
    await page.getByRole('tab', { name: docA }).click();
    const breadcrumbs = page.getByTestId('document-breadcrumbs').locator('nav');
    await expect(breadcrumbs).toBeVisible();
    await expect(breadcrumbs).toContainText(folderName);
    await expect(breadcrumbs).toContainText(docA);

    // 6) Click the folder segment in the breadcrumb — should open the flyout
    //    listing the folder's children (Scene A and Scene B).
    const segmentButton = breadcrumbs
      .locator('.breadcrumb-segment-button')
      .first();
    await expect(segmentButton).toContainText(folderName);
    await segmentButton.click();

    // The flyout renders in a cdk-overlay-pane. Wait for the menu items.
    // Material menu items have the .mat-mdc-menu-item class.
    const flyout = page.locator('.cdk-overlay-pane').last();
    await expect(flyout).toBeVisible();

    // Both sibling documents should be listed in the flyout.
    // Use getByText with exact match to avoid matching substrings.
    await expect(flyout.getByText(docA, { exact: true })).toBeVisible();
    await expect(flyout.getByText(docB, { exact: true })).toBeVisible();

    // 7) Click "Scene B" in the flyout — should navigate to Scene B.
    await flyout.getByText(docB, { exact: true }).click();

    // The breadcrumb should now show Scene B as the current document.
    await expect(breadcrumbs).toContainText(docB);
  });
});
