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

test.describe('PWA Screenshots', () => {
  test.beforeAll(async () => {
    // Ensure screenshots directory exists
    if (!existsSync(SCREENSHOTS_DIR)) {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
    }
  });

  test('capture project bookshelf - desktop', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to desktop size - compact for promo shots
    await page.setViewportSize({ width: 1280, height: 720 });

    // Wait for the covers grid to load (short timeout for mock data)
    await page.waitForSelector('.covers-grid', {
      state: 'visible',
      timeout: 3000,
    });

    // Wait for project cards to render
    await page.waitForSelector('[data-testid="project-card"]', {
      state: 'visible',
      timeout: 3000,
    });

    // Brief pause for images and animations to settle
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'bookshelf-desktop.png'),
      fullPage: true,
    });
  });

  test('capture project bookshelf - desktop dark mode', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to desktop size - compact for promo shots
    await page.setViewportSize({ width: 1280, height: 720 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Wait for the covers grid to load
    await page.waitForSelector('.covers-grid', {
      state: 'visible',
      timeout: 3000,
    });

    // Wait a bit for project cards and images to load
    await page.waitForTimeout(500);

    // No carousel clicking needed - grid shows all projects
    const projectCards = page.locator('[data-testid="project-card"]');
    await projectCards.first().waitFor({ state: 'visible', timeout: 3000 });

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'bookshelf-desktop-dark.png'),
      fullPage: true,
    });
  });

  test('capture project bookshelf - mobile', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to mobile size FIRST
    await page.setViewportSize({ width: 375, height: 667 });

    // Reload page so Angular's BreakpointObserver detects mobile viewport
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait for covers grid to load
    await page.waitForSelector('.covers-grid', {
      state: 'visible',
      timeout: 3000,
    });

    // Wait for project cards to load
    await page.waitForTimeout(500);

    // No carousel clicking needed - grid shows all projects
    const projectCards = page.locator('[data-testid="project-card"]');
    await projectCards.first().waitFor({ state: 'visible', timeout: 3000 });

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'bookshelf-mobile.png'),
      fullPage: true,
    });
  });

  test('capture project bookshelf - mobile dark mode', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to mobile size FIRST
    await page.setViewportSize({ width: 375, height: 667 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Reload page so Angular's BreakpointObserver detects mobile viewport
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait for covers grid to load
    await page.waitForSelector('.covers-grid', {
      state: 'visible',
      timeout: 3000,
    });

    // Wait for project cards to load
    await page.waitForTimeout(500);

    // No carousel clicking needed - grid shows all projects
    const projectCards = page.locator('[data-testid="project-card"]');
    await projectCards.first().waitFor({ state: 'visible', timeout: 3000 });

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'bookshelf-mobile-dark.png'),
      fullPage: true,
    });
  });

  test('capture project editor - desktop', async ({ offlinePage: page }) => {
    // Set viewport to desktop size - tighter focus at 1280px
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root - should go straight to home since configured
    await page.goto('/');

    // Wait for the empty state (since no projects exist in offline mode initially)
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 3000,
    });

    // Create project using worldbuilding-demo template for rich content
    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/demouser\/my-novel/, { timeout: 3000 });

    // Wait for the project tree to be visible (not just app-project component)
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    await page.waitForTimeout(1500);

    // The worldbuilding-demo template has "Chronicles" folder with "The Moonveil Accord" inside
    // First, expand the "Chronicles" folder by clicking the chevron button
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Now "The Moonveil Accord" should be visible - click on it to open
    await page.click('text="The Moonveil Accord"');
    await page.waitForTimeout(300);

    // Wait for editor to load - the document already has rich content from the template
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });

    // Wait for content to settle
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'editor-desktop.png'),
      fullPage: true,
    });
  });

  test('capture project editor - mobile', async ({ offlinePage: page }) => {
    // Set viewport to mobile size - smaller for tighter focus
    await page.setViewportSize({ width: 375, height: 667 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state (no projects initially)
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 3000,
    });

    // Create project using worldbuilding-demo template for rich content
    await createProjectWithTwoSteps(
      page,
      'Mobile Story',
      'mobile-story',
      'Writing on the go',
      'worldbuilding-demo'
    );

    // Wait for navigation to project page
    await page.waitForURL(/\/demouser\/mobile-story/, { timeout: 3000 });

    // On mobile, the project tree is in a sidebar - click hamburger menu to open it
    await page.waitForSelector(
      'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))',
      { state: 'visible', timeout: 5000 }
    );
    await page.click(
      'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))'
    );
    await page.waitForTimeout(500);

    // Wait for project tree to appear in sidebar
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    await page.waitForTimeout(500);

    // Expand "Chronicles" folder by clicking the chevron
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Click on "The Moonveil Accord" from worldbuilding-demo template
    await page.click('text="The Moonveil Accord"');
    await page.waitForTimeout(300);

    // Wait for editor to load - the document already has rich content from the template
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });

    await page.waitForTimeout(500);

    // Select some text by triple-clicking to trigger the inline menu
    const editorElement = page.locator('.ProseMirror').first();
    await editorElement.click({ clickCount: 3 });
    await page.waitForTimeout(300); // Wait for inline menu to appear

    // Take screenshot with text selected and formatting menu visible
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'editor-mobile.png'),
      fullPage: true,
    });
  });

  test('capture project editor - desktop dark mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size - tighter focus at 1280px
    await page.setViewportSize({ width: 1280, height: 720 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root - should go straight to home since configured
    await page.goto('/');

    // Wait for the empty state (since no projects exist in offline mode initially)
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 3000,
    });

    // Create project using worldbuilding-demo template for rich content
    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/demouser\/my-novel/, { timeout: 3000 });

    // Wait for the project tree to be visible (not just app-project component)
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    await page.waitForTimeout(1500);

    // The worldbuilding-demo template has "Chronicles" folder with "The Moonveil Accord" inside
    // First, expand the "Chronicles" folder by clicking the chevron button
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Now "The Moonveil Accord" should be visible - click on it to open
    await page.click('text="The Moonveil Accord"');
    await page.waitForTimeout(300);

    // Wait for editor to load - the document already has rich content from the template
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });

    // Wait for content to settle
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'editor-desktop-dark.png'),
      fullPage: true,
    });
  });

  test('capture project editor - mobile dark mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to mobile size - smaller for tighter focus
    await page.setViewportSize({ width: 375, height: 667 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state (no projects initially)
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 3000,
    });

    // Create project using worldbuilding-demo template for rich content
    await createProjectWithTwoSteps(
      page,
      'Mobile Story',
      'mobile-story',
      'Writing on the go',
      'worldbuilding-demo'
    );

    // Wait for navigation to project page
    await page.waitForURL(/\/demouser\/mobile-story/, { timeout: 3000 });

    // On mobile, the project tree is in a sidebar - click hamburger menu to open it
    await page.waitForSelector(
      'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))',
      { state: 'visible', timeout: 5000 }
    );
    await page.click(
      'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))'
    );
    await page.waitForTimeout(500);

    // Wait for project tree to appear in sidebar
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    await page.waitForTimeout(500);

    // Expand "Chronicles" folder by clicking the chevron
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Click on "The Moonveil Accord" from worldbuilding-demo template
    await page.click('text="The Moonveil Accord"');
    await page.waitForTimeout(300);

    // Wait for editor to load - the document already has rich content from the template
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });

    await page.waitForTimeout(500);

    // Select some text by triple-clicking to trigger the inline menu
    const editorElement = page.locator('.ProseMirror').first();
    await editorElement.click({ clickCount: 3 });
    await page.waitForTimeout(300); // Wait for inline menu to appear

    // Take screenshot with text selected and formatting menu visible
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'editor-mobile-dark.png'),
      fullPage: true,
    });
  });

  // ============================================
  // MEDIA TAB SCREENSHOTS
  // ============================================
  // These tests use REAL images from assets/demo_covers and assets/demo_images
  // via the storeRealMediaInIndexedDB helper from test-helpers.ts

  test('capture media tab - with various media types', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 3000,
    });

    // Create a project first
    await createProjectWithTwoSteps(
      page,
      'Media Showcase',
      'media-showcase',
      'A project demonstrating media storage'
    );
    await page.waitForURL(/\/demouser\/media-showcase/, { timeout: 3000 });
    await page.waitForTimeout(500);

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

    // Navigate to media tab
    await page.goto(`/demouser/media-showcase/media`);
    await page.waitForLoadState('networkidle');

    // Wait for media grid to load
    await page.waitForSelector('.media-grid', {
      state: 'visible',
      timeout: 5000,
    });
    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-desktop.png'),
      fullPage: true,
    });
  });

  test('capture media tab - filtered by inline images', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 3000,
    });

    // Create a project first
    await createProjectWithTwoSteps(page, 'Filtered Media', 'filtered-media');
    await page.waitForURL(/\/demouser\/filtered-media/, { timeout: 3000 });
    await page.waitForTimeout(500);

    const projectKey = 'demouser/filtered-media';

    // Store REAL demo images
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

    // Navigate to media tab
    await page.goto(`/demouser/filtered-media/media`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.media-grid', {
      state: 'visible',
      timeout: 5000,
    });

    // Click the "Inline Images" filter
    await page.click('button:has-text("Inline Images")');
    await page.waitForTimeout(300);

    // Take screenshot showing filtered view
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-filtered.png'),
      fullPage: true,
    });
  });

  test('capture media tab - empty state', async ({ offlinePage: page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 3000,
    });

    // Create a project
    await createProjectWithTwoSteps(page, 'Empty Media', 'empty-media');
    await page.waitForURL(/\/demouser\/empty-media/, { timeout: 3000 });
    await page.waitForTimeout(500);

    // Navigate directly to media tab (no media stored)
    await page.goto(`/demouser/empty-media/media`);
    await page.waitForLoadState('networkidle');

    // Wait for empty state to appear
    await page.waitForSelector('.empty-card', {
      state: 'visible',
      timeout: 5000,
    });
    await page.waitForTimeout(300);

    // Take screenshot of empty state
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-empty.png'),
      fullPage: true,
    });
  });

  test('capture media tab - mobile view', async ({ offlinePage: page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 3000,
    });

    // Create a project
    await createProjectWithTwoSteps(page, 'Mobile Media', 'mobile-media');
    await page.waitForURL(/\/demouser\/mobile-media/, { timeout: 3000 });
    await page.waitForTimeout(500);

    const projectKey = 'demouser/mobile-media';

    // Store REAL demo images
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

    // Navigate to media tab
    await page.goto(`/demouser/mobile-media/media`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.media-grid', {
      state: 'visible',
      timeout: 5000,
    });
    await page.waitForTimeout(300);

    // Take mobile screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-mobile.png'),
      fullPage: true,
    });
  });

  test('capture media tab - dark mode', async ({ offlinePage: page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Enable dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 3000,
    });

    // Create a project
    await createProjectWithTwoSteps(page, 'Dark Media', 'dark-media');
    await page.waitForURL(/\/demouser\/dark-media/, { timeout: 3000 });
    await page.waitForTimeout(500);

    const projectKey = 'demouser/dark-media';

    // Store REAL demo images that look good in dark mode
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
      'img-1',
      DEMO_ASSETS.images.cyberCityscape,
      'neon-city.png'
    );
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'img-2',
      DEMO_ASSETS.images.demoCharacter,
      'character.png'
    );
    await storeRealMediaInIndexedDB(
      page,
      projectKey,
      'img-3',
      DEMO_ASSETS.images.landscapePencil,
      'landscape.png'
    );

    // Navigate to media tab
    await page.goto(`/demouser/dark-media/media`);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.media-grid', {
      state: 'visible',
      timeout: 5000,
    });
    await page.waitForTimeout(500);

    // Take dark mode screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-dark.png'),
      fullPage: true,
    });
  });
});
