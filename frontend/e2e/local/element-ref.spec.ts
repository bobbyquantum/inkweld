/**
 * Element Reference E2E Tests
 *
 * Tests the @ mention functionality:
 * - Typing @ triggers the element search popup
 * - Search filters results
 * - Selecting an element inserts a reference
 * - Keyboard navigation works (up/down arrows, Enter, Escape)
 * - Right-click context menu (navigate / edit / delete)
 *
 * Consolidated from 9 individual tests into 3 grouped tests using
 * `test.step()`. A `beforeEach` performs the expensive local-mode
 * bootstrap + project creation + README open exactly once per test.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';

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

/**
 * Insert one @ mention by accepting the first popup result and return
 * the resulting `.element-ref` locator.
 */
async function insertFirstElementRef(page: Page): Promise<Locator> {
  await page.keyboard.type('@');
  const popup = page.locator('[data-testid="element-ref-popup"]');
  await expect(popup).toBeVisible();

  const firstResult = page
    .locator('[data-testid="element-ref-result-item"]')
    .first();
  await expect(firstResult).toBeVisible();
  await firstResult.press('Enter');
  await expect(popup).not.toBeVisible();

  const elementRef = page.locator('.element-ref').first();
  await expect(elementRef).toBeVisible();
  return elementRef;
}

test.describe('Element Reference (@mentions)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Configure local mode for isolated testing (v2 config format).
    await page.addInitScript(() => {
      const userProfile = {
        id: 'local-test-user',
        username: 'testuser',
        name: 'Test User',
        enabled: true,
      };

      const now = new Date().toISOString();

      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          version: 2,
          activeConfigId: 'local',
          configurations: [
            {
              id: 'local',
              type: 'local',
              displayName: 'Local Mode',
              userProfile: {
                name: userProfile.name,
                username: userProfile.username,
              },
              addedAt: now,
              lastUsedAt: now,
            },
          ],
        })
      );

      localStorage.setItem(
        'local:inkweld-local-user',
        JSON.stringify(userProfile)
      );
    });

    // Create a project once per test (each test runs in an isolated context,
    // so the project name/slug only needs to be unique within this test).
    await page.goto('/');
    await expect(page.getByTestId('empty-state')).toBeVisible();

    // Use a deterministic slug based on the test title so failures are easy
    // to trace and parallel workers don't conflict (each gets its own context).
    const slug = testInfo.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);

    await createProjectWithTwoSteps(
      page,
      `ElementRef ${testInfo.title}`,
      slug,
      undefined,
      'worldbuilding-demo'
    );
    await page.waitForURL(new RegExp(`/testuser/${slug}`));
    await expect(page.locator('app-project-tree')).toBeVisible();

    // Open the README document (exists in all templates).
    await page
      .click('text="README"')
      .catch(() => page.locator('.tree-node-item').first().click());

    const editor = page.locator('.ProseMirror').first();
    await expect(editor).toBeVisible();
    await editor.click();
  });

  test('popup lifecycle: trigger, search filter, keyboard nav, escape', async ({
    page,
  }) => {
    const popup = page.locator('[data-testid="element-ref-popup"]');

    await test.step('typing @ triggers the popup', async () => {
      await page.keyboard.type('@');
      await expect(popup).toBeVisible();
      await expect(page.getByTestId('element-ref-search-input')).toBeVisible();
    });

    await test.step('arrow keys move selection between results', async () => {
      // Popup is still open from the previous step with no filter,
      // so we likely have multiple unfiltered results to navigate.
      const results = page.locator('[data-testid="element-ref-result-item"]');
      const count = await results.count();
      if (count > 1) {
        await page.keyboard.press('ArrowDown');
        await expect(results.nth(1)).toHaveClass(/selected/);

        await page.keyboard.press('ArrowUp');
        await expect(results.first()).toHaveClass(/selected/);
      }
    });

    await test.step('typed text after @ filters via the search input', async () => {
      // Continue typing while the popup is open to populate the search box.
      await page.keyboard.type('elara');

      const searchInput = page.locator(
        '[data-testid="element-ref-search-input"]'
      );
      await expect(searchInput).toHaveValue('elara');
      await expect(
        page.locator('[data-testid="element-ref-results"]')
      ).toBeVisible();
    });

    await test.step('Escape closes the popup', async () => {
      await page.keyboard.press('Escape');
      await expect(popup).toBeHidden();
    });
  });

  test('insert reference: click result inserts properly-styled element-ref', async ({
    page,
  }) => {
    await test.step('typing surrounding text + clicking result inserts a reference', async () => {
      const editor = page.locator('.ProseMirror').first();
      await editor.pressSequentially('Meeting with ', { delay: 20 });
      await insertFirstElementRef(page);
    });

    await test.step('inserted element-ref has data attribute and aria-label', async () => {
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toHaveAttribute('data-element-ref', 'true');

      const ariaLabel = await elementRef.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel!.length).toBeGreaterThan(0);
    });
  });

  test('context menu: right-click shows menu, edit changes text, delete removes ref', async ({
    page,
  }) => {
    const contextMenu = page.locator(
      '[data-testid="element-ref-context-menu"]'
    );

    // Insert two refs so we can verify "delete" removes only one of them.
    const firstRef = await insertFirstElementRef(page);
    const editor = page.locator('.ProseMirror').first();
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' and ');
    await insertFirstElementRef(page);

    const refsAfterInsert = await page.locator('.element-ref').count();
    expect(refsAfterInsert).toBeGreaterThanOrEqual(2);

    await test.step('right-click shows context menu with navigate/edit/delete', async () => {
      await triggerContextMenu(page, firstRef);
      await expect(contextMenu).toBeVisible();
      await expect(
        page.locator('[data-testid="context-menu-navigate"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="context-menu-edit"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="context-menu-delete"]')
      ).toBeVisible();
    });

    await test.step('edit mode allows changing the displayed text', async () => {
      const originalText = await firstRef.textContent();

      await page.locator('[data-testid="context-menu-edit"]').click();

      const editInput = page.locator('[data-testid="context-menu-edit-input"]');
      await expect(editInput).toBeVisible();
      await editInput.clear();
      await editInput.fill('My Custom Reference');
      await page.locator('[data-testid="context-menu-save"]').click();

      await expect(firstRef).toHaveText('My Custom Reference');
      const newText = await firstRef.textContent();
      expect(newText).not.toBe(originalText);
    });

    await test.step('delete removes the element reference from the document', async () => {
      const beforeCount = await page.locator('.element-ref').count();

      await triggerContextMenu(page, firstRef);
      await expect(contextMenu).toBeVisible();
      await page.locator('[data-testid="context-menu-delete"]').click();

      await expect(page.locator('.element-ref')).toHaveCount(beforeCount - 1);
    });
  });
});
