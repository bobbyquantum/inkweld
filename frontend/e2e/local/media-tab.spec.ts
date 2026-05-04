/**
 * Media Tab Tests - Local Mode
 *
 * Tests that verify the Media tab functionality works correctly.
 * The Media tab displays all media stored in IndexedDB using a card-based
 * gallery with a search header, filter sidenav, and status bar:
 * - Project covers
 * - Inline images (from documents)
 * - Published exports (EPUB, PDF, etc.)
 *
 * These tests use REAL demo images from assets/demo_covers and assets/demo_images
 *
 * NOTE: Tests are consolidated into two `test()` blocks using `test.step()`.
 *
 * - Test A covers Navigation + Empty State (no media seeded).
 * - Test B seeds a single gallery (1 cover + 2 inline images + 2 published
 *   EPUBs, all uniquely named) and walks through display, status bar,
 *   filtering, search, search-empty, clear-search, search+filter,
 *   image preview, download, and finally delete (which mutates count and
 *   must run last).
 */
import {
  DEMO_ASSETS,
  storeRealEpubInIndexedDB,
  storeRealMediaInIndexedDB,
} from '../common/test-helpers';
import { expect, test } from './fixtures';

/**
 * Extract project key from a page URL
 * @param pageUrl The full URL (e.g., http://localhost:4200/testuser/test-project)
 * @returns The project key (e.g., testuser/test-project)
 */
function getProjectKeyFromUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  const pathMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)/);
  return pathMatch
    ? `${pathMatch[1]}/${pathMatch[2]}`
    : 'testuser/test-project';
}

/**
 * Open the filter sidenav and click a category button by label.
 */
async function selectCategoryFilter(
  page: import('@playwright/test').Page,
  label: string
): Promise<void> {
  // Open the filter panel only if not already visible (clicking the toggle
  // when open would close it).
  const panel = page.locator('[data-testid="filter-panel"]');
  if (!(await panel.isVisible())) {
    await page.getByTestId('media-filter-button').click();
    await panel.waitFor({ state: 'visible' });
  }

  // Click the matching category chip
  const categoryButtons = page.locator('[data-testid="filter-category"]');
  await categoryButtons.getByText(label, { exact: true }).click();
}

test.describe('Media Tab', () => {
  test('navigation and empty state when no media exists', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);
    await page.waitForLoadState('domcontentloaded');

    await test.step('media library button visible in sidebar', async () => {
      const mediaButton = page.getByTestId('sidebar-media-button');
      await expect(mediaButton).toBeVisible();
    });

    await test.step('navigate to media tab and see search header', async () => {
      const mediaButton = page.getByTestId('sidebar-media-button');
      await mediaButton.click();
      await page.waitForURL(/\/media$/);

      await expect(page.locator('.media-container')).toBeVisible();
      await expect(page.getByTestId('media-search-input')).toBeVisible();
    });

    await test.step('empty state shown when no media stored', async () => {
      await expect(page.getByTestId('empty-card')).toBeVisible();
      await expect(
        page.getByText(/No media stored locally for this project/i)
      ).toBeVisible();
    });
  });

  test('full media gallery: display, filter, search, preview, download, delete', async ({
    localPageWithProject: page,
  }) => {
    // Navigate to the project to obtain its key
    await page.getByTestId('project-card').first().click();
    await page.waitForURL(/\/.+\/.+/);
    await page.waitForLoadState('domcontentloaded');

    const url = page.url();
    const projectKey = getProjectKeyFromUrl(url);

    // ── Seed a single gallery: 1 cover + 2 inline images + 2 published EPUBs ──
    // Filenames are chosen so that search ("hero", "scene-one", "alpha")
    // and category filter (Cover, Inline Images, Published) all work
    // against the same dataset.
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'cover',
      DEMO_ASSETS.covers.demo1,
      'cover.png'
    );
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'img-hero',
      DEMO_ASSETS.images.demoCharacter,
      'hero-portrait.png'
    );
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'img-scene-one',
      DEMO_ASSETS.images.cyberCityscape,
      'scene-one.png'
    );
    await storeRealEpubInIndexedDB(
      page,
      projectKey,
      'final',
      'my-novel-final.epub'
    );
    await storeRealEpubInIndexedDB(
      page,
      projectKey,
      'draft',
      'my-novel-draft.epub'
    );

    // Navigate to media tab
    await page.goto(`${url}/media`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('media-grid')).toBeVisible();

    const mediaItems = page.locator('app-media-item-card');

    await test.step('grid displays all 5 seeded items', async () => {
      await expect(mediaItems).toHaveCount(5);
    });

    await test.step('status bar shows item count', async () => {
      const statusBar = page.locator('.media-status-bar');
      await expect(statusBar).toBeVisible();
      await expect(statusBar).toContainText('5 items');
    });

    await test.step('filter by Cover category shows only the cover', async () => {
      await selectCategoryFilter(page, 'Cover');
      await expect(mediaItems).toHaveCount(1);
    });

    await test.step('filter by Inline Images shows the 2 inline images', async () => {
      await page
        .locator('[data-testid="filter-category"]')
        .getByText('Inline Images', { exact: true })
        .click();
      await expect(mediaItems).toHaveCount(2);
    });

    await test.step('filter by Published shows the 2 EPUBs', async () => {
      await page
        .locator('[data-testid="filter-category"]')
        .getByText('Published', { exact: true })
        .click();
      await expect(mediaItems).toHaveCount(2);
    });

    await test.step('filter by All shows everything again', async () => {
      await page
        .locator('[data-testid="filter-category"]')
        .getByText('All', { exact: true })
        .click();
      await expect(mediaItems).toHaveCount(5);
    });

    await test.step('search filters by filename', async () => {
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('hero');
      await expect(mediaItems).toHaveCount(1);
    });

    await test.step('search with no results shows empty state', async () => {
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('nonexistent123');
      await expect(page.getByTestId('empty-card')).toBeVisible();
      await expect(
        page.getByText(/No media matching "nonexistent123"/i)
      ).toBeVisible();
    });

    await test.step('clear search restores all items', async () => {
      await page.getByTestId('media-search-clear').click();
      await expect(mediaItems).toHaveCount(5);
    });

    await test.step('combine search + category filter (Inline Images + "scene-one")', async () => {
      await selectCategoryFilter(page, 'Inline Images');
      await expect(mediaItems).toHaveCount(2);

      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('scene-one');
      await expect(mediaItems).toHaveCount(1);

      // Reset for subsequent steps
      await page.getByTestId('media-search-clear').click();
      await page
        .locator('[data-testid="filter-category"]')
        .getByText('All', { exact: true })
        .click();
      await expect(mediaItems).toHaveCount(5);
    });

    await test.step('clicking a card opens the image viewer dialog', async () => {
      // Find a card that is an image (not an EPUB) — search narrows it down
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('hero');
      await expect(mediaItems).toHaveCount(1);

      // Either the .card-preview or .card-overlay opens the viewer; whichever
      // is on top depends on hover state. Use the overlay (top during hover).
      await mediaItems.first().hover();
      await mediaItems.first().locator('.card-overlay').click();
      await expect(page.locator('app-image-viewer-dialog')).toBeVisible();

      // Close the dialog and reset search
      await page.keyboard.press('Escape');
      await expect(page.locator('app-image-viewer-dialog')).not.toBeVisible();
      await page.getByTestId('media-search-clear').click();
      await expect(mediaItems).toHaveCount(5);
    });

    await test.step('download button triggers download with correct filename', async () => {
      // Search to a single, predictable item
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('hero-portrait');
      await expect(mediaItems).toHaveCount(1);

      const downloadPromise = page.waitForEvent('download');
      const card = mediaItems.first();
      await card.hover();
      await card.locator('button:has(mat-icon:text("download"))').click();

      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('hero-portrait.png');

      await page.getByTestId('media-search-clear').click();
      await expect(mediaItems).toHaveCount(5);
    });

    // Destructive — must run last
    await test.step('delete an item after confirmation reduces count', async () => {
      // Target a specific item via search
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('scene-one');
      await expect(mediaItems).toHaveCount(1);

      const card = mediaItems.first();
      await card.hover();
      await card.locator('button:has(mat-icon:text("delete"))').click();

      await expect(page.locator('app-confirmation-dialog')).toBeVisible();
      await page.getByTestId('confirm-delete-button').click();

      // Search now matches nothing → empty state for that query
      await expect(page.getByTestId('empty-card')).toBeVisible();

      // Clear search; count should drop to 4
      await page.getByTestId('media-search-clear').click();
      await expect(mediaItems).toHaveCount(4);
    });
  });
});
