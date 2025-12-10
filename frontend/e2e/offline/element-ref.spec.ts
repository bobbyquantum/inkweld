/**
 * Element Reference E2E Tests
 *
 * Tests the @ mention functionality:
 * - Typing @ triggers the element search popup
 * - Search filters results
 * - Selecting an element inserts a reference
 * - Keyboard navigation works (up/down arrows, Enter, Escape)
 */

import { expect, test } from '@playwright/test';

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
      timeout: 5000,
    });

    // Create a project
    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    await page.fill('input[data-testid="project-title-input"]', 'Test Project');
    await page.fill('input[data-testid="project-slug-input"]', 'test-project');
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForURL(/\/testuser\/test-project/, { timeout: 5000 });

    // Wait for project tree to load
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });

    // Expand folders if needed
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(300);
    }

    // Open a document
    await page.click('text="Chapter 1"').catch(() => {
      return page.locator('.tree-node-item').first().click();
    });

    // Wait for the editor
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    // Type @ to trigger popup
    await page.keyboard.type('@');

    // Verify the popup appears
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

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
      timeout: 5000,
    });

    // Create project
    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
    });
    await page.fill('input[data-testid="project-title-input"]', 'Escape Test');
    await page.fill('input[data-testid="project-slug-input"]', 'escape-test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/testuser\/escape-test/, { timeout: 5000 });

    // Open document
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(200);
    }
    await page
      .click('text="Chapter 1"')
      .catch(() => page.locator('.tree-node-item').first().click());

    // Get editor and type @
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();
    await page.keyboard.type('@');

    // Wait for popup
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Verify popup is closed
    await expect(popup).toBeHidden({ timeout: 2000 });
  });

  test('search query filters element results', async ({ page }) => {
    // Set up project with editor
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 5000,
    });

    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
    });
    await page.fill('input[data-testid="project-title-input"]', 'Search Test');
    await page.fill('input[data-testid="project-slug-input"]', 'search-test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/testuser\/search-test/, { timeout: 5000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(200);
    }
    await page
      .click('text="Chapter 1"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    // Type @ with a search term
    await page.keyboard.type('@chapter');

    // Wait for popup
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    // Verify search input has the query
    const searchInput = page.locator(
      '[data-testid="element-ref-search-input"]'
    );
    await expect(searchInput).toHaveValue('chapter');

    // Results should show items matching "chapter"
    // The results container should be visible
    const results = page.locator('[data-testid="element-ref-results"]');
    await expect(results).toBeVisible();
  });

  test('clicking result item closes popup', async ({ page }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 5000,
    });

    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
    });
    await page.fill('input[data-testid="project-title-input"]', 'Click Test');
    await page.fill('input[data-testid="project-slug-input"]', 'click-test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/testuser\/click-test/, { timeout: 5000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(200);
    }
    await page
      .click('text="Chapter 1"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
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
      await expect(popup).toBeHidden({ timeout: 2000 });
    }
  });

  test('keyboard navigation works in popup', async ({ page }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 5000,
    });

    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
    });
    await page.fill(
      'input[data-testid="project-title-input"]',
      'Keyboard Test'
    );
    await page.fill('input[data-testid="project-slug-input"]', 'keyboard-test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/testuser\/keyboard-test/, { timeout: 5000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(200);
    }
    await page
      .click('text="Chapter 1"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
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
      timeout: 5000,
    });

    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
    });
    await page.fill('input[data-testid="project-title-input"]', 'Style Test');
    await page.fill('input[data-testid="project-slug-input"]', 'style-test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/testuser\/style-test/, { timeout: 5000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(200);
    }
    await page
      .click('text="Chapter 1"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
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
      await page.waitForTimeout(200);

      // Check that an element-ref span was inserted
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible({ timeout: 2000 });

      // Verify it has the data attribute
      await expect(elementRef).toHaveAttribute('data-element-ref', 'true');

      // Verify it has an aria-label attribute (for accessibility - tooltip is now a rich component)
      const ariaLabel = await elementRef.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!.length).toBeGreaterThan(0);

      // Log the element's HTML for debugging
      const html = await elementRef.evaluate(el => el.outerHTML);
      console.log('Element ref HTML:', html);
    }
  });

  test('right-click on element reference shows context menu', async ({
    page,
  }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 5000,
    });

    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
    });
    await page.fill(
      'input[data-testid="project-title-input"]',
      'Context Menu Test'
    );
    await page.fill(
      'input[data-testid="project-slug-input"]',
      'context-menu-test'
    );
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/testuser\/context-menu-test/, { timeout: 5000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(200);
    }
    await page
      .click('text="Chapter 1"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    // Create an element reference
    await page.keyboard.type('@');
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    const resultItem = page
      .locator('[data-testid="element-ref-result-item"]')
      .first();
    if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await resultItem.click();
      await page.waitForTimeout(300);

      // Find the element reference
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible({ timeout: 2000 });

      // Right-click on the element reference
      await elementRef.click({ button: 'right' });

      // Wait for context menu
      const contextMenu = page.locator(
        '[data-testid="element-ref-context-menu"]'
      );
      await expect(contextMenu).toBeVisible({ timeout: 2000 });

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
    }
  });

  test('context menu edit mode allows changing display text', async ({
    page,
  }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 5000,
    });

    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
    });
    await page.fill('input[data-testid="project-title-input"]', 'Edit Test');
    await page.fill('input[data-testid="project-slug-input"]', 'edit-test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/testuser\/edit-test/, { timeout: 5000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(200);
    }
    await page
      .click('text="Chapter 1"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    // Create an element reference
    await page.keyboard.type('@');
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    const resultItem = page
      .locator('[data-testid="element-ref-result-item"]')
      .first();
    if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await resultItem.click();
      await page.waitForTimeout(300);

      // Find the element reference and get its original text
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible({ timeout: 2000 });
      const originalText = await elementRef.textContent();

      // Right-click and open context menu
      await elementRef.click({ button: 'right' });
      const contextMenu = page.locator(
        '[data-testid="element-ref-context-menu"]'
      );
      await expect(contextMenu).toBeVisible({ timeout: 2000 });

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
    }
  });

  test('context menu delete removes element reference', async ({ page }) => {
    // Set up project
    await page.goto('/');
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 5000,
    });

    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
    });
    await page.fill('input[data-testid="project-title-input"]', 'Delete Test');
    await page.fill('input[data-testid="project-slug-input"]', 'delete-test');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/testuser\/delete-test/, { timeout: 5000 });

    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(200);
    }
    await page
      .click('text="Chapter 1"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    // Create an element reference
    await page.keyboard.type('@');
    const popup = page.locator('[data-testid="element-ref-popup"]');
    await expect(popup).toBeVisible({ timeout: 3000 });

    const resultItem = page
      .locator('[data-testid="element-ref-result-item"]')
      .first();
    if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
      await resultItem.click();
      await page.waitForTimeout(300);

      // Find the element reference
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible({ timeout: 2000 });

      // Get the display text for verification later
      const displayText = await elementRef.textContent();

      // Right-click and open context menu
      await elementRef.click({ button: 'right' });
      const contextMenu = page.locator(
        '[data-testid="element-ref-context-menu"]'
      );
      await expect(contextMenu).toBeVisible({ timeout: 2000 });

      // Click delete button
      const deleteBtn = page.locator('[data-testid="context-menu-delete"]');
      await deleteBtn.click();

      // Verify the element reference was removed
      await page.waitForTimeout(300);
      await expect(page.locator('.element-ref').first()).not.toBeVisible({
        timeout: 1000,
      });

      // Verify the text is now just plain text in the editor (not an element ref)
      const editorText = await editor.textContent();
      expect(editorText).not.toContain(displayText);
    }
  });
});
