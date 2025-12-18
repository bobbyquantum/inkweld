/**
 * Media Tab Tests - Offline Mode
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
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

      // Click the Media Library button on the home tab
      const mediaButton = page.getByTestId('sidebar-media-button');
      await expect(mediaButton).toBeVisible({ timeout: 5000 });
      await mediaButton.click();

      // Should navigate to media route
      await page.waitForURL(/\/media$/);

      // Should show media tab content
      await expect(page.locator('.media-container')).toBeVisible();
      await expect(page.locator('h1')).toContainText('Project Media');
    });

    test('should show media tab in toolbar menu', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

      // Check that media library button is visible in the sidebar
      const mediaButton = page.getByTestId('sidebar-media-button');
      await expect(mediaButton).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Empty State', () => {
    test('should show empty state when no media exists', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

      // Navigate to media tab
      const mediaButton = page.getByTestId('sidebar-media-button');
      await mediaButton.click();
      await page.waitForURL(/\/media$/);

      // Should show empty state
      await expect(page.locator('.empty-card')).toBeVisible({ timeout: 5000 });
      await expect(
        page.getByText(/No media stored locally for this project/i)
      ).toBeVisible();
    });
  });

  test.describe('Media Display', () => {
    test('should display stored media in grid', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project to get the project key
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

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
      await expect(page.locator('.media-grid')).toBeVisible({ timeout: 5000 });
      const mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(3);
    });

    test('should show media stats and category counts', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

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
      await page.waitForLoadState('networkidle');

      // Should show header stats
      await expect(page.locator('.header-stats')).toBeVisible({
        timeout: 5000,
      });

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
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

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
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.media-grid')).toBeVisible({ timeout: 5000 });

      // Should show all 3 items initially
      let mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(3);

      // Click "Cover" filter
      await page.getByRole('button', { name: /^Cover$/i }).click();
      await page.waitForTimeout(300);

      // Should show only 1 cover
      mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(1);

      // Click "Inline Images" filter
      await page.getByRole('button', { name: /Inline Images/i }).click();
      await page.waitForTimeout(300);

      // Should show 2 inline images
      mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(2);

      // Click "All" to show everything again
      await page.getByRole('button', { name: /All/i }).click();
      await page.waitForTimeout(300);

      mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(3);
    });
  });

  test.describe('Image Preview', () => {
    test('should open image viewer when clicking an image', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

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
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.media-grid')).toBeVisible({ timeout: 5000 });

      // Click on the media item to open preview
      await page.locator('.media-item').first().click();

      // Should open image viewer dialog
      await expect(page.locator('app-image-viewer-dialog')).toBeVisible({
        timeout: 3000,
      });
    });
  });

  test.describe('Download', () => {
    test('should trigger download when clicking download button', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

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
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.media-grid')).toBeVisible({ timeout: 5000 });

      // Set up download listener
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 });

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
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

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
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.media-grid')).toBeVisible({ timeout: 5000 });

      // Should have 2 items
      let mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(2);

      // Click delete button on first item (button with "delete" icon)
      await page
        .locator('.media-item')
        .first()
        .locator('button:has(mat-icon:text("delete"))')
        .click();

      // Should show confirmation dialog
      await expect(page.locator('app-confirmation-dialog')).toBeVisible({
        timeout: 3000,
      });

      // Confirm deletion (use the specific confirm button)
      await page.getByTestId('confirm-delete-button').click();

      // Wait for deletion to complete
      await page.waitForTimeout(500);

      // Should now have 1 item
      mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(1);
    });
  });

  test.describe('Published Files', () => {
    test('should display published exports', async ({
      offlinePageWithProject: page,
    }) => {
      // Navigate to the project
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);
      await page.waitForLoadState('networkidle');

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
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.media-grid')).toBeVisible({ timeout: 5000 });

      // Should show published items
      const mediaItems = page.locator('.media-item');
      await expect(mediaItems).toHaveCount(2);

      // Filter to show only published files
      await page.getByRole('button', { name: /Published/i }).click();
      await page.waitForTimeout(300);

      // Should still show 2 (both are published)
      await expect(mediaItems).toHaveCount(2);
    });
  });
});
