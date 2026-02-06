/**
 * Media Tab Tests - Local Mode
 *
 * Tests that verify the Media tab functionality works correctly.
 * The Media tab displays all media stored in IndexedDB:
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

      // Should show media tab content
      await expect(page.locator('.media-container')).toBeVisible();
      await expect(page.locator('h1')).toContainText('Project Media');
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
      const mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(3);
    });

    test('should show media stats and category counts', async ({
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

      // Should show header stats
      await expect(page.locator('.header-stats')).toBeVisible();

      // Should have category filter buttons (in the .category-filter section)
      const filterSection = page.locator('.category-filter');
      await expect(
        filterSection.getByRole('button', { name: /All/i })
      ).toBeVisible();
      await expect(
        filterSection.getByRole('button', { name: /^Cover$/i })
      ).toBeVisible();
    });
  });

  test.describe('Filtering', () => {
    test('should filter media by category', async ({
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
      const mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(3);

      // Click "Cover" filter
      await page.getByRole('button', { name: /^Cover$/i }).click();

      // Should show only 1 cover
      await expect(mediaItems).toHaveCount(1);

      // Click "Inline Images" filter
      await page.getByRole('button', { name: /Inline Images/i }).click();

      // Should show 2 inline images
      await expect(mediaItems).toHaveCount(2);

      // Click "All" to show everything again
      await page.getByRole('button', { name: /All/i }).click();

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

      // Click on the media item to open preview
      await page.locator('.media-item').first().click();

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

      // Click download button on the media item (button with "Download" tooltip)
      await page
        .locator('button:has(mat-icon:text("download"))')
        .first()
        .click();

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
      const mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(2);

      // Click delete button on first item (button with "delete" icon)
      await page
        .locator('.media-item')
        .first()
        .locator('button:has(mat-icon:text("delete"))')
        .click();

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
      const mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(2);

      // Filter to show only published files
      await page.getByRole('button', { name: /Published/i }).click();

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
      const mediaItems = page.locator('.media-item');
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

      const mediaItems = page.locator('.media-item');
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

      const mediaItems = page.locator('.media-item');

      // Filter to inline images first
      await page.getByRole('button', { name: /Inline Images/i }).click();
      await expect(mediaItems).toHaveCount(2);

      // Now search within the inline category
      const searchInput = page.getByTestId('media-search-input');
      await searchInput.fill('scene-one');

      // Should show only the matching inline image
      await expect(mediaItems).toHaveCount(1);
    });
  });
});
