/**
 * Relationship Chart Element Images – Local Mode
 *
 * Verifies that worldbuilding elements with an identity image display
 * that image on nodes in the relationship chart (graph view).
 *
 * The normal frontend flow stores identity images as base64 data: URLs
 * in the Yjs identity map (via the worldbuilding image dialog cropper).
 * The template import path writes `data.image` → `identityMap.set('image', …)`,
 * so seeding a data: URL in the template JSON mirrors real behaviour.
 *
 * Bug reproduction: the chart currently calls the getElementImages API
 * endpoint to fetch identity images, which does not work in local mode.
 * Images should be read from the local Yjs identity map instead.
 */

import {
  createProjectWithTwoSteps,
  dismissToastIfPresent,
} from '../common/test-helpers';
import { expect, test } from './fixtures';

/**
 * A 1×1 red pixel PNG encoded as a data-URL.
 * This is the same format the frontend stores after a user crops and
 * uploads a worldbuilding identity image (base64 data: URL).
 */
const TEST_IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Relationship Chart Element Images', () => {
  test('should display worldbuilding element images on chart nodes', async ({
    localPage: page,
  }) => {
    // ── Inject a test image into the template during import ──────────────
    // Intercept the worldbuilding-demo template's worldbuilding.json so that
    // "Elara Nightwhisper" (first entry) gets an identity image written into
    // her Yjs identity map during project creation.
    //
    // The import pipeline (document-import.service.ts → writeWorldbuildingData)
    // copies `data.image` into `identityMap.set('image', value)`, exactly
    // matching the path used when a user uploads an image through the UI.
    await page.route(
      '**/assets/project-templates/worldbuilding-demo/worldbuilding.json',
      async route => {
        const response = await route.fetch();
        const json = await response.json();
        // The first element is char-elara (Elara Nightwhisper)
        json[0].data.image = TEST_IMAGE_DATA_URL;
        await route.fulfill({ json });
      }
    );

    // ── Create project from worldbuilding-demo template ──────────────────
    await createProjectWithTwoSteps(
      page,
      'Chart Image Test',
      'chart-image-test',
      undefined,
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/testuser\/chart-image-test/);
    await expect(page.getByTestId('project-tree')).toBeVisible();
    await dismissToastIfPresent(page);

    // ── Verify the identity image was persisted ──────────────────────────
    // Open Elara's character sheet and confirm the image section shows an
    // actual <img> (not the "Add Image" placeholder icon).
    const charactersFolder = page.getByRole('treeitem', { name: 'Characters' });
    await expect(charactersFolder).toBeVisible();
    await charactersFolder.locator('button').first().click();

    const elaraElement = page.getByRole('treeitem', {
      name: 'Elara Nightwhisper',
    });
    await expect(elaraElement).toBeVisible();
    await elaraElement.click();

    // The identity panel hides the image in sidenav mode (showImage=false),
    // but the sidenav thumbnail shows the image when it exists.
    const sidenavThumbnail = page.getByTestId('sidenav-thumbnail');
    await expect(sidenavThumbnail).toBeVisible({ timeout: 10_000 });

    // ── Navigate to the Character Web chart ──────────────────────────────
    await page.getByTestId('element-Character Web').click({ timeout: 10_000 });

    // Wait for the Cytoscape canvas to initialise inside the chart area
    await page.waitForSelector('[data-testid="chart-area"] canvas', {
      state: 'visible',
      timeout: 15_000,
    });

    // Allow time for the asynchronous node-image loading pipeline to complete.
    // The chart fires loadNodeImages() in an effect after graph data loads;
    // give it a generous window to resolve images from Yjs / IndexedDB.
    await page.waitForTimeout(5_000);

    // ── Assert that at least one node image was loaded ────────────────────
    // The chart-area div exposes `data-node-images-loaded` with the count of
    // resolved node images. If images loaded correctly this will be ≥ 1.
    //
    // BUG: loadNodeImages() calls the getElementImages API endpoint, which
    // does not exist in local mode (API requests are blocked). The chart
    // should read identity images from local Yjs stores instead.
    const chartArea = page.locator('[data-testid="chart-area"]');
    const imageCount = await chartArea.getAttribute('data-node-images-loaded');
    expect(
      Number(imageCount),
      'Expected at least one node image to be loaded on the relationship chart, ' +
        'but nodeImages map is empty. This indicates the chart failed to read ' +
        'identity images from the local Yjs store (loadNodeImages uses an API ' +
        'call that is unavailable in local mode).'
    ).toBeGreaterThan(0);
  });
});
