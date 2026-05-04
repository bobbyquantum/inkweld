/**
 * Pinning Feature Tests - Local Mode
 *
 * Verifies that project owners can pin / unpin elements, that pins appear in
 * both the sidebar pinned-section and the Home tab Pinned column, that pins
 * survive a full page reload (persisted via IndexedDB in local mode), and
 * that the project title is preserved across pin operations.
 *
 * Consolidated from 5 individual tests into 1 grouped test using
 * `test.step()`. All assertions operate on the same project so the
 * pin / unpin lifecycle is exercised end-to-end without redoing the
 * (slow) `createProjectWithTwoSteps` flow per case.
 */
import { type Page } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

/** Wait for the project shell + tree to be hydrated. */
async function waitForProjectReady(page: Page, slug: string): Promise<void> {
  await page.waitForURL(new RegExp(`testuser/${slug}`));
  await page.waitForSelector('app-project-tree', { state: 'visible' });
  // Give IndexedDB a moment to hydrate.
  await page.waitForTimeout(500);
}

/** Right-click the named tree node and click Pin/Unpin in the context menu. */
async function togglePinViaContextMenu(
  page: Page,
  elementName: string
): Promise<void> {
  const node = page.locator(`[data-testid="element-${elementName}"]`);
  await node.waitFor({ state: 'visible' });
  await node.click({ button: 'right' });
  await page.waitForSelector('.context-menu', { state: 'visible' });
  await page.locator('[data-testid="context-menu-pin"]').click();
  // Allow the Yjs write + IndexedDB flush to complete.
  await page.waitForTimeout(500);
}

const TITLE_SELECTOR = 'h1, h2, .project-title, [data-testid="project-title"]';

test.describe('Pinning', () => {
  test('pin/unpin lifecycle: sidebar, Home tab, reload persistence, title preservation', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(
      page,
      'Pin Lifecycle Test',
      'pin-lifecycle'
    );
    await waitForProjectReady(page, 'pin-lifecycle');

    let titleBefore: string | null = null;

    await test.step('initial state: no pinned section, Home tab shows empty title baseline', async () => {
      await expect(page.locator('.pinned-section')).not.toBeVisible();

      await page.locator('[data-testid="toolbar-home-button"]').click();
      await page.waitForTimeout(300);

      titleBefore = await page.locator(TITLE_SELECTOR).first().textContent();
      expect(titleBefore?.trim()).toBeTruthy();

      await expect(
        page.locator('[data-testid="home-pinned-empty"]')
      ).toBeVisible();
    });

    await test.step('pin README → sidebar pinned section + Home Pinned column show it', async () => {
      // Return to project tree view.
      await page.goto('/testuser/pin-lifecycle');
      await waitForProjectReady(page, 'pin-lifecycle');

      await togglePinViaContextMenu(page, 'README');

      await expect(page.locator('.pinned-section')).toBeVisible();
      await expect(page.locator('[data-testid="pinned-README"]')).toBeVisible();

      await page.locator('[data-testid="toolbar-home-button"]').click();
      await page.waitForTimeout(300);

      await expect(
        page.locator('[data-testid="home-pinned-README"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="home-pinned-empty"]')
      ).not.toBeVisible();
    });

    await test.step('project title is preserved after pinning', async () => {
      const titleAfter = await page
        .locator(TITLE_SELECTOR)
        .first()
        .textContent();
      expect(titleAfter?.trim()).toBeTruthy();
      expect(titleAfter?.trim()).toBe(titleBefore?.trim());
    });

    await test.step('pin survives a full page reload', async () => {
      await page.reload();
      await waitForProjectReady(page, 'pin-lifecycle');

      await expect(page.locator('.pinned-section')).toBeVisible();
      await expect(page.locator('[data-testid="pinned-README"]')).toBeVisible();

      await page.locator('[data-testid="toolbar-home-button"]').click();
      await page.waitForTimeout(300);
      await expect(
        page.locator('[data-testid="home-pinned-README"]')
      ).toBeVisible();
    });

    await test.step('unpinning removes the element from both surfaces', async () => {
      await page.goto('/testuser/pin-lifecycle');
      await waitForProjectReady(page, 'pin-lifecycle');

      await togglePinViaContextMenu(page, 'README');

      await expect(page.locator('.pinned-section')).not.toBeVisible();

      await page.locator('[data-testid="toolbar-home-button"]').click();
      await page.waitForTimeout(300);
      await expect(
        page.locator('[data-testid="home-pinned-empty"]')
      ).toBeVisible();
    });
  });
});
