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
 * Navigate to a project and then to the media tab.
 * Returns the project URL (without /media suffix).
 */
async function _navigateToMediaTab(
  page: import('@playwright/test').Page
): Promise<string> {
  await page.getByTestId('project-card').first().click();
  await page.waitForURL(/\/.+\/.+/);
  await page.waitForLoadState('domcontentloaded');
  const url = page.url();

  const mediaButton = page.getByTestId('sidebar-media-button');
  await mediaButton.click();
  await page.waitForURL(/\/media$/);

  return url;
}

/**
 * Open the filter sidenav and click a category button by label.
 */
async function selectCategoryFilter(
  page: import('@playwright/test').Page,
  label: string
): Promise<void> {
  // Open the filter panel
  await page.getByTestId('media-filter-button').click();

  // Wait for the filter sidenav to appear
  await page.waitForSelector('[data-testid="filter-panel"]', {
    state: 'visible',
  });

  // Click the matching category chip
  const categoryButtons = page.locator('[data-testid="filter-category"]');
  await categoryButtons.getByText(label, { exact: true }).click();
}

test.describe('Media Tab', () => {
  test.describe('Navigation', () => {
    test('should navigate to media tab from home tab', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      // Click the Media Library button on the home tab
      const mediaButton = page.getByTestId('sidebar-media-button');
      await expect(mediaButton).toBeVisible();
      await mediaButton.click();

      // Should navigate to media route
      await page.waitForURL(/\/media$/);

      // Should show media tab content (search header + sidenav container)
      await expect(page.locator('.media-container')).toBeVisible();
      await expect(page.getByTestId('media-search-input')).toBeVisible();
    });

    test('should show media tab in toolbar menu', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      // Check that media library button is visible in the sidebar
      const mediaButton = page.getByTestId('sidebar-media-button');
      await expect(mediaButton).toBeVisible();
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state when no media exists', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      // Navigate to media tab
      const mediaButton = page.getByTestId('sidebar-media-button');
      await mediaButton.click();
      await page.waitForURL(/\/media$/);

      // Should show empty state
      await expect(page.getByTestId('empty-card')).toBeVisible();
      await expect(
        page.getByText(/No media stored locally for this project/i)
      ).toBeVisible();
    });
  });

  test.describe('Media Display', () => {
    test('should display stored media in grid', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project to get the project key
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      // Get the project key from URL
      const projectKey = getProjectKeyFromUrl(page.url());

      // Store real demo images in IndexedDB
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
        'img-character',
        DEMO_ASSETS.images.demoCharacter,
        'hero-portrait.png'
      );
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-cityscape',
        DEMO_ASSETS.images.cyberCityscape,
        'city-scene.png'
      );

      // Navigate to media tab
      const mediaButton = page.getByTestId('sidebar-media-button');
      await mediaButton.click();
      await page.waitForURL(/\/media$/);

      // Should show media grid with items
      await expect(page.getByTestId('media-grid')).toBeVisible();
      const mediaItems = page.locator('app-media-item-card');
      await expect(mediaItems).toHaveCount(3);
    });

    test('should show status bar with item count and size', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store various media types using real images
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'cover',
        DEMO_ASSETS.covers.inkweld1,
        'cover.png'
      );
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-1',
        DEMO_ASSETS.images.landscapePencil,
        'landscape.png'
      );
      await storeRealEpubInIndexedDB(
        page,
        projectKey,
        'export-1',
        'my-novel.epub'
      );

      // Navigate to media tab
      await page.goto(`${url}/media`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('media-grid')).toBeVisible();

      // Should show status bar with item count
      const statusBar = page.locator('.media-status-bar');
      await expect(statusBar).toBeVisible();
      await expect(statusBar).toContainText('3 items');
    });
  });

  test.describe('Filtering', () => {
    test('should filter media by category via filter panel', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store media of different categories using real images
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'cover',
        DEMO_ASSETS.covers.worldbuilding1,
        'cover.png'
      );
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-scene',
        DEMO_ASSETS.images.cyberCityscape,
        'scene.png'
      );
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-char',
        DEMO_ASSETS.images.demoCharacter,
        'character.png'
      );

      // Navigate to media tab
      await page.goto(`${url}/media`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('media-grid')).toBeVisible();

      // Should show all 3 items initially
      const mediaItems = page.locator('app-media-item-card');
      await expect(mediaItems).toHaveCount(3);

      // Open filter panel and select "Cover"
      await selectCategoryFilter(page, 'Cover');

      // Should show only 1 cover
      await expect(mediaItems).toHaveCount(1);

      // Switch to "Inline Images"
      await page
        .locator('[data-testid="filter-category"]')
        .getByText('Inline Images', { exact: true })
        .click();

      // Should show 2 inline images
      await expect(mediaItems).toHaveCount(2);

      // Switch back to "All"
      await page
        .locator('[data-testid="filter-category"]')
        .getByText('All', { exact: true })
        .click();

      await expect(mediaItems).toHaveCount(3);
    });
  });

  test.describe('Image Preview', () => {
    test('should open image viewer when clicking an image', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store a real image
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-preview',
        DEMO_ASSETS.images.landscapePencil,
        'preview-image.png'
      );

      // Navigate to media tab
      await page.goto(`${url}/media`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('media-grid')).toBeVisible();

      // Click on the media card overlay to open preview
      await page.locator('app-media-item-card .card-overlay').first().click();

      // Should open image viewer dialog
      await expect(page.locator('app-image-viewer-dialog')).toBeVisible();
    });
  });

  test.describe('Download', () => {
    test('should trigger download when clicking download button', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store a real image
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-download',
        DEMO_ASSETS.covers.demo1,
        'downloadable.png'
      );

      // Navigate to media tab
      await page.goto(`${url}/media`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('media-grid')).toBeVisible();

      // Set up download listener
      const downloadPromise = page.waitForEvent('download');

      // Hover on the card to reveal overlay buttons, then click download
      const card = page.locator('app-media-item-card').first();
      await card.hover();
      await card.locator('button:has(mat-icon:text("download"))').click();

      // Should trigger download
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('downloadable.png');
    });
  });

  test.describe('Delete', () => {
    test('should delete media after confirmation', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store two real images
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-keep',
        DEMO_ASSETS.images.demoCharacter,
        'keep-me.png'
      );
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-delete',
        DEMO_ASSETS.images.cyberCityscape,
        'delete-me.png'
      );

      // Navigate to media tab
      await page.goto(`${url}/media`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('media-grid')).toBeVisible();

      // Should have 2 items
      const mediaItems = page.locator('app-media-item-card');
      await expect(mediaItems).toHaveCount(2);

      // Hover on first card and click delete button
      const firstCard = mediaItems.first();
      await firstCard.hover();
      await firstCard.locator('button:has(mat-icon:text("delete"))').click();

      // Should show confirmation dialog
      await expect(page.locator('app-confirmation-dialog')).toBeVisible();

      // Confirm deletion (use the specific confirm button)
      await page.getByTestId('confirm-delete-button').click();

      // Should now have 1 item
      await expect(mediaItems).toHaveCount(1);
    });
  });

  test.describe('Published Files', () => {
    test('should display published exports', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store published files (EPUB)
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

      // Should show published items
      const mediaItems = page.locator('app-media-item-card');
      await expect(mediaItems).toHaveCount(2);

      // Open filter panel and select "Published"
      await selectCategoryFilter(page, 'Published');

      // Should still show 2 (both are published)
      await expect(mediaItems).toHaveCount(2);
    });
  });

  test.describe('Search', () => {
    test('should filter media by search query', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store media with distinct filenames
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
        'img-city',
        DEMO_ASSETS.images.cyberCityscape,
        'city-scene.png'
      );

      // Navigate to media tab
      await page.goto(`${url}/media`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('media-grid')).toBeVisible();

      // Should show all 3 items initially
      const mediaItems = page.locator('app-media-item-card');
      await expect(mediaItems).toHaveCount(3);

      // Search for "hero"
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('hero');

      // Should filter to 1 item
      await expect(mediaItems).toHaveCount(1);
    });

    test('should show empty state when search has no results', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store a media item
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-test',
        DEMO_ASSETS.covers.demo1,
        'test-image.png'
      );

      // Navigate to media tab
      await page.goto(`${url}/media`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('media-grid')).toBeVisible();

      // Search for non-existent term
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('nonexistent123');

      // Should show empty state with search-specific message
      await expect(page.getByTestId('empty-card')).toBeVisible();
      await expect(
        page.getByText(/No media matching "nonexistent123"/i)
      ).toBeVisible();
    });

    test('should clear search and show all items', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store two media items
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-alpha',
        DEMO_ASSETS.images.demoCharacter,
        'alpha-image.png'
      );
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-beta',
        DEMO_ASSETS.images.cyberCityscape,
        'beta-image.png'
      );

      // Navigate to media tab
      await page.goto(`${url}/media`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('media-grid')).toBeVisible();

      const mediaItems = page.locator('app-media-item-card');
      await expect(mediaItems).toHaveCount(2);

      // Search to filter down
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('alpha');
      await expect(mediaItems).toHaveCount(1);

      // Click clear button to reset search
      await page.getByTestId('media-search-clear').click();

      // Should show all items again
      await expect(mediaItems).toHaveCount(2);
    });

    test('should combine search with category filter', async ({
      localPageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('domcontentloaded');

      const url = page.url();
      const projectKey = getProjectKeyFromUrl(url);

      // Store media of different categories with distinct names
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
        'img-scene-one',
        DEMO_ASSETS.images.demoCharacter,
        'scene-one.png'
      );
      await storeRealMediaInIndexedDB(
        page,
        projectKey,
        'img-scene-two',
        DEMO_ASSETS.images.cyberCityscape,
        'scene-two.png'
      );

      // Navigate to media tab
      await page.goto(`${url}/media`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('media-grid')).toBeVisible();

      const mediaItems = page.locator('app-media-item-card');

      // Open filter panel and select "Inline Images"
      await selectCategoryFilter(page, 'Inline Images');
      await expect(mediaItems).toHaveCount(2);

      // Now search within the inline category
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('scene-one');

      // Should show only the matching inline image
      await expect(mediaItems).toHaveCount(1);
    });
  });
});
