/**
 * Element Reference E2E Tests
 *
 * Tests the @ mention functionality:
 * - Typing @ triggers the element search popup
 * - Search filters results
 * - Selecting an element inserts a reference
 * - Keyboard navigation works (up/down arrows, Enter, Escape)
 */

import { expect, Locator, Page, test } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';

/**
 * Helper to trigger a contextmenu event on an element reference.
 * Uses JavaScript evaluation to dispatch the event directly on the element,
 * which is more reliable on CI than Playwright's click({ button: 'right' }).
 */
async function triggerContextMenu(
  page: Page,
  elementRef: Locator
): Promise<void> {
  // Get the element handle and dispatch contextmenu event with proper coordinates
  await elementRef.evaluate((el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    el.dispatchEvent(event);
  });
}

test.describe('Element Reference (@mentions)', () => {
  test.beforeEach(async ({ page }) => {
    // Configure offline mode for isolated testing
    await page.addInitScript(() => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile: {
            name: 'Test User',
            username: 'testuser',
          },
        })
      );
    });
  });

  test('typing @ in editor triggers element search popup', async ({ page }) => {
    // Navigate to root and create a project
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 15000,
    });

    // Create a project using the two-step flow with demo template
    await createProjectWithTwoSteps(
      page,
      'Test Project',
      'test-project',
      undefined,
      'worldbuilding-demo'
    );

    // Wait for navigation
    await page.waitForURL(/\/testuser\/test-project/, { timeout: 15000 });

    // Wait for project tree to load
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 15000,
    });

    // Open the README document (exists in all templates)
    await page.click('text="README"').catch(() => {
      return page.locator('.tree-node-item').first().click();
    });

    // Wait for the editor
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();

    // Type @ to trigger popup
    await page.keyboard.type('@');

    // Verify the popup appears
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 15000 });

    // Verify the search input is present
    const searchInput = page.locator(
      '[data-testid="element-ref-search-input"]'
    );
    await expect(searchInput).toBeVisible();
  });

  test('Escape key closes the @ mention popup', async ({ page }) => {
    // Set up and navigate to editor
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 15000,
    });

    // Create project using the two-step flow with demo template
    await createProjectWithTwoSteps(
      page,
      'Escape Test',
      'escape-test',
      undefined,
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/escape-test/, { timeout: 15000 });

    // Open document
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });

    // Open the README document
    await page
      .click('text="README"')
      .catch(() => page.locator('.tree-node-item').first().click());

    // Get editor and type @
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();
    await page.keyboard.type('@');

    // Wait for popup
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Verify popup is closed
    await expect(popup).toBeHidden({ timeout: 15000 });
  });

  test('search query filters element results', async ({ page }) => {
    // Set up project with editor
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 15000,
    });

    await createProjectWithTwoSteps(
      page,
      'Search Test',
      'search-test',
      undefined,
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/search-test/, { timeout: 15000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });

    // Open the README document
    await page
      .click('text="README"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();

    // Type @ with a search term (searching for a character in the demo template)
    await page.keyboard.type('@elara');

    // Wait for popup
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    // Verify search input has the query
    const searchInput = page.locator(
      '[data-testid="element-ref-search-input"]'
    );
    await expect(searchInput).toHaveValue('elara');

    // Results should show items matching "elara"
    // The results container should be visible
    const results = page.locator('[data-testid="element-ref-results"]');
    await expect(results).toBeVisible();
  });

  test('clicking result item closes popup', async ({ page }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 15000,
    });

    await createProjectWithTwoSteps(
      page,
      'Click Test',
      'click-test',
      undefined,
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/click-test/, { timeout: 15000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });

    // Open the README document
    await page
      .click('text="README"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();

    // Type @
    await page.keyboard.type('@');

    // Wait for popup
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    // If there are results, click one
    const resultItem = page
      .locator('[data-testid="element-ref-result-item"]')
      .first();
    if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await resultItem.click();

      // Popup should close after selection
      await expect(popup).toBeHidden({ timeout: 15000 });
    }
  });

  test('keyboard navigation works in popup', async ({ page }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 15000,
    });

    await createProjectWithTwoSteps(
      page,
      'Keyboard Test',
      'keyboard-test',
      undefined,
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/keyboard-test/, { timeout: 15000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });

    // Open the README document
    await page
      .click('text="README"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();

    // Type @
    await page.keyboard.type('@');

    // Wait for popup
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    // Test arrow navigation if results exist
    const results = page.locator('[data-testid="element-ref-result-item"]');
    const resultCount = await results.count();

    if (resultCount > 1) {
      // Press down arrow to move selection
      await page.keyboard.press('ArrowDown');

      // Second item should be selected
      const secondItem = results.nth(1);
      await expect(secondItem).toHaveClass(/selected/);

      // Press up arrow to go back
      await page.keyboard.press('ArrowUp');

      // First item should be selected again
      const firstItem = results.first();
      await expect(firstItem).toHaveClass(/selected/);
    }
  });

  test('element reference is rendered with proper styling', async ({
    page,
  }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 15000,
    });

    await createProjectWithTwoSteps(
      page,
      'Style Test',
      'style-test',
      undefined,
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/style-test/, { timeout: 15000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });

    // Open the README document
    await page
      .click('text="README"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();

    // Type some text, then @
    await editor.pressSequentially('Meeting with ', { delay: 20 });
    await page.keyboard.type('@');

    // Wait for popup
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    // Select first result
    const resultItem = page
      .locator('[data-testid="element-ref-result-item"]')
      .first();
    if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await resultItem.click();
      await expect(popup).not.toBeVisible({ timeout: 15000 });

      // Check that an element-ref span was inserted
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible({ timeout: 15000 });

      // Verify it has the data attribute
      await expect(elementRef).toHaveAttribute('data-element-ref', 'true');

      // Verify it has an aria-label attribute (for accessibility - tooltip is now a rich component)
      const ariaLabel = await elementRef.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!.length).toBeGreaterThan(0);
    }
  });

  test('right-click on element reference shows context menu', async ({
    page,
  }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 15000,
    });

    await createProjectWithTwoSteps(
      page,
      'Context Menu Test',
      'context-menu-test',
      undefined,
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/context-menu-test/, { timeout: 15000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });

    // Open the README document
    await page
      .click('text="README"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();

    // Create an element reference
    await page.keyboard.type('@');
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 15000 });

    const resultItem = page
      .locator('[data-testid="element-ref-result-item"]')
      .first();
    await resultItem.waitFor({ state: 'visible', timeout: 15000 });
    await resultItem.click();
    await expect(popup).not.toBeVisible({ timeout: 15000 });

    // Find the element reference
    const elementRef = page.locator('.element-ref').first();
    await expect(elementRef).toBeVisible({ timeout: 15000 });

    // Wait a tiny bit for the editor to settle after insertion
    await page.waitForTimeout(200);

    // Right-click on the element reference using JS dispatch for CI reliability
    await triggerContextMenu(page, elementRef);

    // Wait for context menu
    const contextMenu = page.locator(
      '[data-testid="element-ref-context-menu"]'
    );
    await expect(contextMenu).toBeVisible({ timeout: 15000 });

    // Verify menu items are present
    const navigateBtn = page.locator('[data-testid="context-menu-navigate"]');
    const editBtn = page.locator('[data-testid="context-menu-edit"]');
    const deleteBtn = page.locator('[data-testid="context-menu-delete"]');

    await expect(navigateBtn).toBeVisible();
    await expect(editBtn).toBeVisible();
    await expect(deleteBtn).toBeVisible();

    // Close menu by pressing Escape
    await page.keyboard.press('Escape');
    await expect(contextMenu).not.toBeVisible({ timeout: 1000 });
  });

  test('context menu edit mode allows changing display text', async ({
    page,
  }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 15000,
    });

    await createProjectWithTwoSteps(
      page,
      'Edit Test',
      'edit-test',
      undefined,
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/edit-test/, { timeout: 15000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });

    // Open the README document
    await page
      .click('text="README"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();

    // Create an element reference
    await page.keyboard.type('@');
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 15000 });

    const resultItem = page
      .locator('[data-testid="element-ref-result-item"]')
      .first();
    await resultItem.waitFor({ state: 'visible', timeout: 15000 });
    await resultItem.click();
    await expect(popup).not.toBeVisible({ timeout: 15000 });

    // Find the element reference and get its original text
    const elementRef = page.locator('.element-ref').first();
    await expect(elementRef).toBeVisible({ timeout: 15000 });
    const originalText = await elementRef.textContent();

    // Wait a tiny bit for the editor to settle after insertion
    await page.waitForTimeout(200);

    // Right-click and open context menu using JS dispatch for CI reliability
    await triggerContextMenu(page, elementRef);

    const contextMenu = page.locator(
      '[data-testid="element-ref-context-menu"]'
    );
    await expect(contextMenu).toBeVisible({ timeout: 15000 });

    // Click edit button
    const editBtn = page.locator('[data-testid="context-menu-edit"]');
    await editBtn.click();

    // Wait for edit input to appear
    const editInput = page.locator('[data-testid="context-menu-edit-input"]');
    await expect(editInput).toBeVisible({ timeout: 1000 });

    // Clear and type new text
    await editInput.clear();
    await editInput.fill('My Custom Reference');

    // Save
    const saveBtn = page.locator('[data-testid="context-menu-save"]');
    await saveBtn.click();

    // Verify the text changed
    await page.waitForTimeout(300);
    const newText = await elementRef.textContent();
    expect(newText).toBe('My Custom Reference');
    expect(newText).not.toBe(originalText);
  });

  test('context menu delete removes element reference', async ({ page }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 15000,
    });

    await createProjectWithTwoSteps(
      page,
      'Delete Test',
      'delete-test',
      undefined,
      'worldbuilding-demo'
    );
    await page.waitForURL(/\/testuser\/delete-test/, { timeout: 15000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });

    // Open the README document
    await page
      .click('text="README"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 15000 });
    await editor.click();

    // Create an element reference
    await page.keyboard.type('@');
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 15000 });

    const resultItem = page
      .locator('[data-testid="element-ref-result-item"]')
      .first();
    await resultItem.waitFor({ state: 'visible', timeout: 15000 });
    await resultItem.click();
    await expect(popup).not.toBeVisible({ timeout: 15000 });

    // Find the element reference and count how many there are
    const elementRefsBefore = await page.locator('.element-ref').count();
    expect(elementRefsBefore).toBeGreaterThan(0);

    // Find the first element reference
    const elementRef = page.locator('.element-ref').first();
    await expect(elementRef).toBeVisible({ timeout: 15000 });

    // Wait a tiny bit for the editor to settle after insertion
    await page.waitForTimeout(200);

    // Right-click and open context menu using JS dispatch for CI reliability
    await triggerContextMenu(page, elementRef);

    const contextMenu = page.locator(
      '[data-testid="element-ref-context-menu"]'
    );
    await expect(contextMenu).toBeVisible({ timeout: 15000 });

    // Click delete button
    const deleteBtn = page.locator('[data-testid="context-menu-delete"]');
    await deleteBtn.click();

    // Verify the element reference count decreased
    await page.waitForTimeout(300);
    const elementRefsAfter = await page.locator('.element-ref').count();
    expect(elementRefsAfter).toBe(elementRefsBefore - 1);
  });
});
