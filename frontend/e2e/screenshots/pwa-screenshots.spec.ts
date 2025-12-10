import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import {
  DEMO_ASSETS,
  storeRealEpubInIndexedDB,
  storeRealMediaInIndexedDB,
} from '../common/test-helpers';
import { test } from './fixtures';

test.describe('PWA Screenshots', () => {
  test.beforeAll(async () => {
    // Ensure screenshots directory exists in docs/site/static/img
    const screenshotsDir = join(
      process.cwd(),
      '..',
      'docs',
      'site',
      'static',
      'img'
    );
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true });
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
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'bookshelf-desktop.png'
      ),
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
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'bookshelf-desktop-dark.png'
      ),
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
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'bookshelf-mobile.png'
      ),
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
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'bookshelf-mobile-dark.png'
      ),
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

    // Click the "Create Project" button in the empty state
    await page.click('button:has-text("Create Project")');

    // Wait for create project form to load
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    // Fill in project details
    await page.fill('input[data-testid="project-title-input"]', 'My Novel');
    await page.fill(
      'textarea[formcontrolname="description"]',
      'A captivating story about creativity and collaboration'
    );
    await page.fill('input[data-testid="project-slug-input"]', 'my-novel');

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for navigation to the project page
    await page.waitForURL(/\/demouser\/my-novel/, { timeout: 3000 });

    // Wait for the project tree to be visible (not just app-project component)
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    await page.waitForTimeout(1500);

    // The default structure creates "Chapters" folder with "Chapter 1" inside
    // First, expand the "Chapters" folder by clicking the chevron button
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Now "Chapter 1" should be visible - click on it to open
    await page.click('text="Chapter 1"');
    await page.waitForTimeout(300);

    // Wait for editor to load and click into it
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    // Type some compelling content
    await editor.pressSequentially(
      'The rain hammered against the windowpane as Sarah opened her laptop, ready to pour her imagination onto the digital page. ',
      { delay: 10 }
    );
    await editor.pressSequentially(
      'Inkweld made it effortless—her characters, plot notes, and chapters all organized in one place.\n\n',
      { delay: 10 }
    );
    await editor.pressSequentially(
      'She smiled, knowing that collaboration with her co-author would be seamless, even across continents.',
      { delay: 10 }
    );

    // Wait for content to settle
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'editor-desktop.png'
      ),
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

    // Click the create project button
    await page.click('button:has-text("Create Project")');

    // Wait for create project form
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    // Fill in project details
    await page.fill('input[data-testid="project-title-input"]', 'Mobile Story');
    await page.fill(
      'textarea[formcontrolname="description"]',
      'Writing on the go'
    );
    await page.fill('input[data-testid="project-slug-input"]', 'mobile-story');

    // Submit form
    await page.click('button[type="submit"]');

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

    // Expand "Chapters" folder by clicking the chevron
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Click on "Chapter 1" from default structure
    await page.click('text="Chapter 1"');
    await page.waitForTimeout(300);

    // Type into editor - multiple paragraphs
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    // Type first paragraph
    await editor.pressSequentially(
      'Writing on mobile has never been easier. Inkweld adapts to your screen, letting you craft stories wherever inspiration strikes.',
      { delay: 10 }
    );
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // Type second paragraph
    await editor.pressSequentially(
      "Whether you're on the bus, waiting in line, or relaxing in a café, your stories are always at your fingertips.",
      { delay: 10 }
    );
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // Type third paragraph
    await editor.pressSequentially(
      'Start writing today and bring your ideas to life.',
      { delay: 10 }
    );

    await page.waitForTimeout(500);

    // Select the last paragraph by triple-clicking (this worked before)
    // Triple-click selects the entire paragraph and triggers the inline menu
    const editorElement = page.locator('.ProseMirror').first();
    await editorElement.click({ clickCount: 3 });
    await page.waitForTimeout(300); // Wait for inline menu to appear

    // Take screenshot with text selected and formatting menu visible
    await page.screenshot({
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'editor-mobile.png'
      ),
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

    // Click the "Create Project" button in the empty state
    await page.click('button:has-text("Create Project")');

    // Wait for create project form to load
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    // Fill in project details
    await page.fill('input[data-testid="project-title-input"]', 'My Novel');
    await page.fill(
      'textarea[formcontrolname="description"]',
      'A captivating story about creativity and collaboration'
    );
    await page.fill('input[data-testid="project-slug-input"]', 'my-novel');

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for navigation to the project page
    await page.waitForURL(/\/demouser\/my-novel/, { timeout: 3000 });

    // Wait for the project tree to be visible (not just app-project component)
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    await page.waitForTimeout(1500);

    // The default structure creates "Chapters" folder with "Chapter 1" inside
    // First, expand the "Chapters" folder by clicking the chevron button
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Now "Chapter 1" should be visible - click on it to open
    await page.click('text="Chapter 1"');
    await page.waitForTimeout(300);

    // Wait for editor to load and click into it
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    // Type some compelling content
    await editor.pressSequentially(
      'The rain hammered against the windowpane as Sarah opened her laptop, ready to pour her imagination onto the digital page. ',
      { delay: 10 }
    );
    await editor.pressSequentially(
      'Inkweld made it effortless—her characters, plot notes, and chapters all organized in one place.\n\n',
      { delay: 10 }
    );
    await editor.pressSequentially(
      'She smiled, knowing that collaboration with her co-author would be seamless, even across continents.',
      { delay: 10 }
    );

    // Wait for content to settle
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'editor-desktop-dark.png'
      ),
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

    // Click the create project button
    await page.click('button:has-text("Create Project")');

    // Wait for create project form
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    // Fill in project details
    await page.fill('input[data-testid="project-title-input"]', 'Mobile Story');
    await page.fill(
      'textarea[formcontrolname="description"]',
      'Writing on the go'
    );
    await page.fill('input[data-testid="project-slug-input"]', 'mobile-story');

    // Submit form
    await page.click('button[type="submit"]');

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

    // Expand "Chapters" folder by clicking the chevron
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(500);

    // Click on "Chapter 1" from default structure
    await page.click('text="Chapter 1"');
    await page.waitForTimeout(300);

    // Type into editor - multiple paragraphs
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    // Type first paragraph
    await editor.pressSequentially(
      'Writing on mobile has never been easier. Inkweld adapts to your screen, letting you craft stories wherever inspiration strikes.',
      { delay: 10 }
    );
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // Type second paragraph
    await editor.pressSequentially(
      "Whether you're on the bus, waiting in line, or relaxing in a café, your stories are always at your fingertips.",
      { delay: 10 }
    );
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');

    // Type third paragraph
    await editor.pressSequentially(
      'Start writing today and bring your ideas to life.',
      { delay: 10 }
    );

    await page.waitForTimeout(500);

    // Select the last paragraph by triple-clicking (this worked before)
    // Triple-click selects the entire paragraph and triggers the inline menu
    const editorElement = page.locator('.ProseMirror').first();
    await editorElement.click({ clickCount: 3 });
    await page.waitForTimeout(300); // Wait for inline menu to appear

    // Take screenshot with text selected and formatting menu visible
    await page.screenshot({
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'editor-mobile-dark.png'
      ),
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
    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    await page.fill(
      'input[data-testid="project-title-input"]',
      'Media Showcase'
    );
    await page.fill(
      'textarea[formcontrolname="description"]',
      'A project demonstrating media storage'
    );
    await page.fill(
      'input[data-testid="project-slug-input"]',
      'media-showcase'
    );
    await page.click('button[type="submit"]');
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
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'media-tab-desktop.png'
      ),
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
    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    await page.fill(
      'input[data-testid="project-title-input"]',
      'Filtered Media'
    );
    await page.fill(
      'input[data-testid="project-slug-input"]',
      'filtered-media'
    );
    await page.click('button[type="submit"]');
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
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'media-tab-filtered.png'
      ),
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
    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    await page.fill('input[data-testid="project-title-input"]', 'Empty Media');
    await page.fill('input[data-testid="project-slug-input"]', 'empty-media');
    await page.click('button[type="submit"]');
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
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'media-tab-empty.png'
      ),
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
    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    await page.fill('input[data-testid="project-title-input"]', 'Mobile Media');
    await page.fill('input[data-testid="project-slug-input"]', 'mobile-media');
    await page.click('button[type="submit"]');
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
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'media-tab-mobile.png'
      ),
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
    await page.click('button:has-text("Create Project")');
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    await page.fill('input[data-testid="project-title-input"]', 'Dark Media');
    await page.fill('input[data-testid="project-slug-input"]', 'dark-media');
    await page.click('button[type="submit"]');
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
      path: join(
        process.cwd(),
        '..',
        'docs',
        'site',
        'static',
        'img',
        'media-tab-dark.png'
      ),
      fullPage: true,
    });
  });
});
