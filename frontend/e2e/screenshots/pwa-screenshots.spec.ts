import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import {
  createProjectWithTwoSteps,
  DEMO_ASSETS,
  storeRealEpubInIndexedDB,
  storeRealMediaInIndexedDB,
} from '../common/test-helpers';
import { test } from './fixtures';
import { applyColorScheme, applyColorSchemeAndReload } from './theme-helpers';

/**
 * Base directory for generated screenshots.
 * Screenshots are stored in docs/site/static/img/generated/ and gitignored.
 */
const SCREENSHOTS_DIR = join(
  process.cwd(),
  '..',
  'docs',
  'site',
  'static',
  'img',
  'generated'
);

/**
 * Capture a screenshot clipping the bounding box around two locators.
 */
async function captureBoundingBoxScreenshot(
  page: import('@playwright/test').Page,
  primary: import('@playwright/test').Locator,
  secondary: import('@playwright/test').Locator,
  outPath: string,
  padding = 16
): Promise<void> {
  const primaryBox = await primary.boundingBox();
  const secondaryBox = await secondary.boundingBox();
  if (!primaryBox || !secondaryBox) return;

  const x = Math.min(primaryBox.x, secondaryBox.x) - padding;
  const y = Math.min(primaryBox.y, secondaryBox.y) - padding;
  const right =
    Math.max(
      primaryBox.x + primaryBox.width,
      secondaryBox.x + secondaryBox.width
    ) + padding;
  const bottom =
    Math.max(
      primaryBox.y + primaryBox.height,
      secondaryBox.y + secondaryBox.height
    ) + padding;

  await page.screenshot({
    path: outPath,
    clip: {
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: right - x,
      height: bottom - y,
    },
  });
}

test.describe('PWA Screenshots', () => {
  test.beforeAll(async () => {
    // Ensure screenshots directory exists
    if (!existsSync(SCREENSHOTS_DIR)) {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test('capture project bookshelf - desktop light & dark', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.waitForSelector('.covers-grid', { state: 'visible' });
    await page.waitForSelector('[data-testid="project-card"]', {
      state: 'visible',
    });
    await page.waitForLoadState('networkidle');

    await test.step('light', async () => {
      await applyColorScheme(page, 'light');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'bookshelf-desktop-light.png'),
        fullPage: true,
      });
    });

    await test.step('dark', async () => {
      await applyColorScheme(page, 'dark');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'bookshelf-desktop-dark.png'),
        fullPage: true,
      });
    });
  });

  test('capture project bookshelf - mobile light & dark', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to mobile size FIRST and reload so Angular's
    // BreakpointObserver detects mobile viewport.
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload({ waitUntil: 'domcontentloaded' });

    await page.waitForSelector('.covers-grid', { state: 'visible' });
    const projectCards = page.locator('[data-testid="project-card"]');
    await projectCards.first().waitFor({ state: 'visible' });

    await test.step('light', async () => {
      await applyColorScheme(page, 'light');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'bookshelf-mobile-light.png'),
        fullPage: true,
      });
    });

    await test.step('dark', async () => {
      await applyColorScheme(page, 'dark');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'bookshelf-mobile-dark.png'),
        fullPage: true,
      });
    });
  });

  test('capture project home - desktop light & dark', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/demouser\/my-novel/);
    await page.waitForSelector('.home-tab-content', { state: 'visible' });

    await test.step('light', async () => {
      await applyColorScheme(page, 'light');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'project-home-desktop-light.png'),
        fullPage: true,
      });
    });

    await test.step('dark', async () => {
      await applyColorScheme(page, 'dark');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'project-home-desktop-dark.png'),
        fullPage: true,
      });
    });
  });

  test('capture element type chooser dialog - light & dark', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/demouser\/my-novel/);
    await page.waitForSelector('app-project-tree', { state: 'visible' });

    // Click the "Create" button at the bottom of the tree
    await page.click('[data-testid="create-new-element"]');
    await page.waitForSelector('mat-dialog-container', { state: 'visible' });

    const dialog = page.locator('mat-dialog-container');

    await test.step('light', async () => {
      await applyColorScheme(page, 'light');
      await dialog.screenshot({
        path: join(SCREENSHOTS_DIR, 'element-type-chooser-light.png'),
      });
    });

    await test.step('dark', async () => {
      await applyColorScheme(page, 'dark');
      await dialog.screenshot({
        path: join(SCREENSHOTS_DIR, 'element-type-chooser-dark.png'),
      });
    });
  });

  test('capture folder context menu - light & dark', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/demouser\/my-novel/);
    await page.waitForSelector('app-project-tree', { state: 'visible' });

    const folder = page.locator('[data-testid="element-Chronicles"]');
    const menu = page.locator('.context-menu');

    for (const scheme of ['light', 'dark'] as const) {
      await test.step(scheme, async () => {
        await applyColorScheme(page, scheme);

        // Open context menu (re-open each iteration since the previous one
        // was dismissed at the end of the prior step)
        await folder.click({ button: 'right' });
        await menu.waitFor({ state: 'visible' });

        await captureBoundingBoxScreenshot(
          page,
          folder,
          menu,
          join(SCREENSHOTS_DIR, `folder-context-menu-${scheme}.png`)
        );

        // Dismiss context menu before next iteration
        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'hidden' }).catch(() => {
          /* already hidden */
        });
      });
    }
  });

  test('capture tags tab and tag edit dialog - light & dark', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/demouser\/my-novel/);
    await page.waitForSelector('app-project-tree', { state: 'visible' });

    // Open settings → tags
    await page.click('[data-testid="sidebar-settings-button"]');
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });
    await page.click('[data-testid="nav-tags"]');
    await page.waitForSelector('[data-testid="new-tag-button"]', {
      state: 'visible',
    });

    const settingsContent = page.locator(
      '[data-testid="settings-tab-content"]'
    );
    const dialog = page.locator('mat-dialog-container');

    for (const scheme of ['light', 'dark'] as const) {
      await test.step(`tags tab ${scheme}`, async () => {
        await applyColorScheme(page, scheme);
        await settingsContent.screenshot({
          path: join(SCREENSHOTS_DIR, `tags-tab-${scheme}.png`),
        });
      });

      await test.step(`tag edit dialog ${scheme}`, async () => {
        await page.click('[data-testid="new-tag-button"]');
        await dialog.waitFor({ state: 'visible' });
        await dialog.screenshot({
          path: join(SCREENSHOTS_DIR, `tag-edit-dialog-${scheme}.png`),
        });

        // Close dialog before next iteration
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
      });
    }
  });

  test('capture new document naming dialog - light & dark', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/demouser\/my-novel/);
    await page.waitForSelector('app-project-tree', { state: 'visible' });

    // Open create dialog and proceed to naming step
    await page.click('[data-testid="create-new-element"]');
    await page.waitForSelector('mat-dialog-container', { state: 'visible' });
    await page.click('[data-testid="element-type-item"]');

    const nameInput = page.getByTestId('element-name-input');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill('Chapter 1: The Beginning');

    const dialog = page.locator('mat-dialog-container');

    await test.step('light', async () => {
      await applyColorScheme(page, 'light');
      await dialog.screenshot({
        path: join(SCREENSHOTS_DIR, 'new-document-dialog-light.png'),
      });
    });

    await test.step('dark', async () => {
      await applyColorScheme(page, 'dark');
      await dialog.screenshot({
        path: join(SCREENSHOTS_DIR, 'new-document-dialog-dark.png'),
      });
    });
  });

  test('capture tab context menu - light & dark', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/demouser\/my-novel/);
    await page.waitForSelector('app-project-tree', { state: 'visible' });

    // Expand Chronicles folder and open document to create a tab
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.click('text="The Moonveil Accord"');
    await page.waitForSelector('[data-testid="tab-The Moonveil Accord"]', {
      state: 'visible',
    });

    const docTab = page.locator('[data-testid="tab-The Moonveil Accord"]');
    const tabBar = page.locator('.tab-bar-container');
    const menu = page.locator('.tab-context-menu');

    for (const scheme of ['light', 'dark'] as const) {
      await test.step(scheme, async () => {
        await applyColorScheme(page, scheme);

        await docTab.click({ button: 'right' });
        await menu.waitFor({ state: 'visible' });

        await captureBoundingBoxScreenshot(
          page,
          tabBar,
          menu,
          join(SCREENSHOTS_DIR, `tab-context-menu-${scheme}.png`)
        );

        await page.keyboard.press('Escape');
        await menu.waitFor({ state: 'hidden' }).catch(() => {
          /* already hidden */
        });
      });
    }
  });

  test('capture project editor - desktop light & dark', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/demouser\/my-novel/);
    await page.waitForSelector('app-project-tree', { state: 'visible' });

    const openMoonveilDoc = async () => {
      // Expand Chronicles folder and open the document
      const expandButton = page
        .locator('[data-testid="expand-folder-button"]')
        .first();
      await expandButton.click();
      await page.click('text="The Moonveil Accord"');
      await page.locator('.ProseMirror').first().waitFor({ state: 'visible' });
    };

    await openMoonveilDoc();

    await test.step('light', async () => {
      await applyColorScheme(page, 'light');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'editor-desktop-light.png'),
        fullPage: true,
      });
    });

    await test.step('dark', async () => {
      // Reload with dark theme seeded so :host-context(.dark-theme)
      // chip styles evaluate at host creation (matches main's render).
      await applyColorSchemeAndReload(page, 'dark', 'app-project-tree');
      await openMoonveilDoc();
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'editor-desktop-dark.png'),
        fullPage: true,
      });
    });
  });

  test('capture project editor - mobile light & dark', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'Mobile Story',
      'mobile-story',
      'Writing on the go',
      'worldbuilding-demo'
    );

    await page.waitForURL(/\/demouser\/mobile-story/);

    const openMobileMoonveilDoc = async () => {
      // Open hamburger menu to reveal project tree on mobile (no-op
      // if it's already open from a prior visit / reload).
      const tree = page.locator('app-project-tree');
      if (!(await tree.isVisible().catch(() => false))) {
        await page.waitForSelector(
          'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))',
          { state: 'visible' }
        );
        await page.click(
          'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))'
        );
        await tree.waitFor({ state: 'visible' });
      }

      // Expand Chronicles folder and open the document. Scope the
      // click to the project tree so we don't accidentally hit the
      // breadcrumb (which also reads "The Moonveil Accord" once the
      // document has been opened previously in this session).
      const expandButton = page
        .locator('[data-testid="expand-folder-button"]')
        .first();
      await expandButton.click();
      await tree.locator('text="The Moonveil Accord"').first().click();

      const editor = page.locator('.ProseMirror').first();
      await editor.waitFor({ state: 'visible' });

      // Triple-click to select text and trigger inline formatting menu
      await editor.click({ clickCount: 3 });
    };

    await openMobileMoonveilDoc();

    await test.step('light', async () => {
      await applyColorScheme(page, 'light');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'editor-mobile-light.png'),
        fullPage: true,
      });
    });

    await test.step('dark', async () => {
      // Reload with dark theme seeded so :host-context(.dark-theme)
      // chip styles evaluate at host creation (matches main's render).
      await applyColorSchemeAndReload(
        page,
        'dark',
        'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))'
      );
      await openMobileMoonveilDoc();
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'editor-mobile-dark.png'),
        fullPage: true,
      });
    });
  });

  // ============================================
  // MEDIA TAB SCREENSHOTS
  // ============================================
  // These tests use REAL images from assets/demo_covers and assets/demo_images
  // via the storeRealMediaInIndexedDB helper from test-helpers.ts

  test('capture media tab - with various media types (light & dark)', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      'Media Showcase',
      'media-showcase',
      'A project demonstrating media storage'
    );
    await page.waitForURL(/\/demouser\/media-showcase/);

    const projectKey = 'demouser/media-showcase';

    // Store REAL demo images in IndexedDB
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
      'img-char',
      DEMO_ASSETS.images.demoCharacter,
      'hero-portrait.png'
    );
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'img-city',
      DEMO_ASSETS.images.cyberCityscape,
      'cityscape.png'
    );
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'img-landscape',
      DEMO_ASSETS.images.landscapePencil,
      'landscape-sketch.png'
    );
    await storeRealEpubInIndexedDB(
      page,
      projectKey,
      'final',
      'media-showcase-final.epub'
    );

    await page.goto(`/demouser/media-showcase/media`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.media-grid', { state: 'visible' });

    await test.step('light', async () => {
      await applyColorScheme(page, 'light');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'media-tab-desktop-light.png'),
        fullPage: true,
      });
    });

    await test.step('dark', async () => {
      await applyColorScheme(page, 'dark');
      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'media-tab-dark.png'),
        fullPage: true,
      });
    });
  });

  test('capture media tab - filtered by inline images', async ({
    offlinePage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(page, 'Filtered Media', 'filtered-media');
    await page.waitForURL(/\/demouser\/filtered-media/);

    const projectKey = 'demouser/filtered-media';

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
      'img-1',
      DEMO_ASSETS.images.demoCharacter,
      'character-art-1.png'
    );
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'img-2',
      DEMO_ASSETS.images.cyberCityscape,
      'location-sketch.png'
    );
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'img-3',
      DEMO_ASSETS.images.landscapePencil,
      'landscape-art.png'
    );

    await page.goto(`/demouser/filtered-media/media`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.media-grid', { state: 'visible' });

    // Open the filter panel, then click "Inline Images" category
    await page.click('[data-testid="media-filter-button"]');
    await page.waitForSelector('[data-testid="filter-panel"]', {
      state: 'visible',
    });
    await page.click(
      '[data-testid="filter-category"]:has-text("Inline Images")'
    );

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-filtered-light.png'),
      fullPage: true,
    });
  });

  test('capture media tab - empty state', async ({ offlinePage: page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(page, 'Empty Media', 'empty-media');
    await page.waitForURL(/\/demouser\/empty-media/);

    await page.goto(`/demouser/empty-media/media`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.empty-card', { state: 'visible' });

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-empty-light.png'),
      fullPage: true,
    });
  });

  test('capture media tab - mobile view', async ({ offlinePage: page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(page, 'Mobile Media', 'mobile-media');
    await page.waitForURL(/\/demouser\/mobile-media/);

    const projectKey = 'demouser/mobile-media';

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
      DEMO_ASSETS.images.demoCharacter,
      'sketch.png'
    );
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'img-2',
      DEMO_ASSETS.images.landscapePencil,
      'concept.png'
    );

    await page.goto(`/demouser/mobile-media/media`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.media-grid', { state: 'visible' });

    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-mobile-light.png'),
      fullPage: true,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Create Project Flow Screenshots
  // ─────────────────────────────────────────────────────────────────────────────

  test('capture create button in nav bar - light & dark', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.waitForSelector('.covers-grid', { state: 'visible' });
    const headerSection = page.locator('.header-section');
    await headerSection.waitFor({ state: 'visible' });

    await test.step('light', async () => {
      await applyColorScheme(page, 'light');
      await headerSection.screenshot({
        path: join(SCREENSHOTS_DIR, 'create-button-nav-light.png'),
      });
    });

    await test.step('dark', async () => {
      await applyColorScheme(page, 'dark');
      await headerSection.screenshot({
        path: join(SCREENSHOTS_DIR, 'create-button-nav-dark.png'),
      });
    });
  });

  test('capture create project flow - templates & details (light & dark)', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    for (const scheme of ['light', 'dark'] as const) {
      await test.step(scheme, async () => {
        await applyColorScheme(page, scheme);

        // Navigate fresh to the create-project page each iteration
        await page.goto('/');
        await page.waitForSelector('.covers-grid', { state: 'visible' });
        await page.click('.create-btn');
        await page.getByTestId('create-new-project-menu-item').click();
        await page.waitForURL(/\/create-project/);
        await page.waitForSelector('.template-grid', { state: 'visible' });

        // Step 1: template selection screenshot
        await page.screenshot({
          path: join(SCREENSHOTS_DIR, `create-project-templates-${scheme}.png`),
          fullPage: true,
        });

        // Continue to step 2: project details
        await page.click('[data-testid="template-worldbuilding-demo"]');
        await page.click('[data-testid="next-button"]');

        await page.waitForSelector('[data-testid="project-title-input"]', {
          state: 'visible',
        });
        await page.fill(
          '[data-testid="project-title-input"]',
          'My Fantasy Novel'
        );

        await page.screenshot({
          path: join(SCREENSHOTS_DIR, `create-project-details-${scheme}.png`),
          fullPage: true,
        });
      });
    }
  });

  // =====================
  // Setup Screen Screenshots
  // =====================

  test('capture setup mode selection & offline profile - light & dark', async ({
    unconfiguredPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    for (const scheme of ['light', 'dark'] as const) {
      await test.step(scheme, async () => {
        await applyColorScheme(page, scheme);

        // Navigate fresh each iteration to reset to mode selection
        await page.goto('/', { waitUntil: 'domcontentloaded' });

        await page.waitForSelector('[data-testid="setup-card"]', {
          state: 'visible',
        });
        await page.waitForSelector('[data-testid="local-mode-button"]', {
          state: 'visible',
        });
        await page.waitForSelector('[data-testid="server-mode-button"]', {
          state: 'visible',
        });

        // Mode selection screenshot
        await page.screenshot({
          path: join(SCREENSHOTS_DIR, `setup-mode-selection-${scheme}.png`),
          fullPage: true,
        });

        // Click local/offline mode button
        await page.click('[data-testid="local-mode-button"]');
        await page.waitForSelector('[data-testid="local-username-input"]', {
          state: 'visible',
        });

        await page.fill('[data-testid="local-username-input"]', 'writer');
        await page.fill(
          '[data-testid="local-displayname-input"]',
          'Jane Writer'
        );

        await page.screenshot({
          path: join(SCREENSHOTS_DIR, `setup-offline-${scheme}.png`),
          fullPage: true,
        });
      });
    }
  });

  test('capture setup server connection - light & dark', async ({
    unconfiguredPage: page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    for (const scheme of ['light', 'dark'] as const) {
      await test.step(scheme, async () => {
        await applyColorScheme(page, scheme);

        // Navigate fresh each iteration to reset to mode selection
        await page.goto('/', { waitUntil: 'domcontentloaded' });

        await page.waitForSelector('[data-testid="setup-card"]', {
          state: 'visible',
        });

        await page.click('[data-testid="server-mode-button"]');
        await page.waitForSelector('[data-testid="server-url-input"]', {
          state: 'visible',
        });

        await page.fill(
          '[data-testid="server-url-input"]',
          'https://inkweld.example.com'
        );

        await page.screenshot({
          path: join(SCREENSHOTS_DIR, `setup-server-${scheme}.png`),
          fullPage: true,
        });
      });
    }
  });
});
