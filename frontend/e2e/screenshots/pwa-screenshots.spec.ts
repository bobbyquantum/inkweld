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
    });

    // Wait for project cards to render
    await page.waitForSelector('[data-testid="project-card"]', {
      state: 'visible',
    });

    // Brief pause for images and animations to settle
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'bookshelf-desktop-light.png'),
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
    });

    // Wait a bit for project cards and images to load
    await page.waitForTimeout(500);

    // No carousel clicking needed - grid shows all projects
    const projectCards = page.locator('[data-testid="project-card"]');
    await projectCards.first().waitFor({ state: 'visible' });

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
    });

    // Wait for project cards to load
    await page.waitForTimeout(500);

    // No carousel clicking needed - grid shows all projects
    const projectCards = page.locator('[data-testid="project-card"]');
    await projectCards.first().waitFor({ state: 'visible' });

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'bookshelf-mobile-light.png'),
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
    });

    // Wait for project cards to load
    await page.waitForTimeout(500);

    // No carousel clicking needed - grid shows all projects
    const projectCards = page.locator('[data-testid="project-card"]');
    await projectCards.first().waitFor({ state: 'visible' });

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'bookshelf-mobile-dark.png'),
      fullPage: true,
    });
  });

  test('capture project home - desktop', async ({ offlinePage: page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the home tab to be visible (project home page)
    await page.waitForSelector('.home-tab-content', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Take screenshot of project home page
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'project-home-desktop-light.png'),
      fullPage: true,
    });
  });

  test('capture element type chooser dialog - light mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click the "Create" button at the bottom of the tree
    await page.click('[data-testid="create-new-element"]');
    await page.waitForTimeout(300);

    // Wait for the dialog to appear
    await page.waitForSelector('mat-dialog-container', {
      state: 'visible',
    });

    // Take screenshot of the element type chooser
    const dialog = page.locator('mat-dialog-container');
    await dialog.screenshot({
      path: join(SCREENSHOTS_DIR, 'element-type-chooser-light.png'),
    });
  });

  test('capture element type chooser dialog - dark mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Enable dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click the "Create" button at the bottom of the tree
    await page.click('[data-testid="create-new-element"]');
    await page.waitForTimeout(300);

    // Wait for the dialog to appear
    await page.waitForSelector('mat-dialog-container', {
      state: 'visible',
    });

    // Take screenshot of the element type chooser
    const dialog = page.locator('mat-dialog-container');
    await dialog.screenshot({
      path: join(SCREENSHOTS_DIR, 'element-type-chooser-dark.png'),
    });
  });

  test('capture folder context menu - light mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Right-click on the "Chronicles" folder to open context menu
    const folder = page.locator('[data-testid="element-Chronicles"]');
    await folder.click({ button: 'right' });
    await page.waitForTimeout(300);

    // Wait for context menu to appear
    await page.waitForSelector('.context-menu', {
      state: 'visible',
    });

    // Take cropped screenshot including the folder and context menu
    const folderBox = await folder.boundingBox();
    const menu = page.locator('.context-menu');
    const menuBox = await menu.boundingBox();

    if (folderBox && menuBox) {
      const padding = 16;
      const x = Math.min(folderBox.x, menuBox.x) - padding;
      const y = Math.min(folderBox.y, menuBox.y) - padding;
      const right =
        Math.max(folderBox.x + folderBox.width, menuBox.x + menuBox.width) +
        padding;
      const bottom =
        Math.max(folderBox.y + folderBox.height, menuBox.y + menuBox.height) +
        padding;

      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'folder-context-menu-light.png'),
        clip: {
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: right - x,
          height: bottom - y,
        },
      });
    }
  });

  test('capture folder context menu - dark mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Enable dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Right-click on the "Chronicles" folder to open context menu
    const folder = page.locator('[data-testid="element-Chronicles"]');
    await folder.click({ button: 'right' });
    await page.waitForTimeout(300);

    // Wait for context menu to appear
    await page.waitForSelector('.context-menu', {
      state: 'visible',
    });

    // Take cropped screenshot including the folder and context menu
    const folderBox = await folder.boundingBox();
    const menu = page.locator('.context-menu');
    const menuBox = await menu.boundingBox();

    if (folderBox && menuBox) {
      const padding = 16;
      const x = Math.min(folderBox.x, menuBox.x) - padding;
      const y = Math.min(folderBox.y, menuBox.y) - padding;
      const right =
        Math.max(folderBox.x + folderBox.width, menuBox.x + menuBox.width) +
        padding;
      const bottom =
        Math.max(folderBox.y + folderBox.height, menuBox.y + menuBox.height) +
        padding;

      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'folder-context-menu-dark.png'),
        clip: {
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: right - x,
          height: bottom - y,
        },
      });
    }
  });

  test('capture tags tab in settings - light mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    // Create project using worldbuilding-demo template (includes sample tags)
    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click the Settings button in sidebar
    await page.click('[data-testid="sidebar-settings-button"]');
    await page.waitForTimeout(300);

    // Wait for settings to load
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    // Click the Tags sub-tab
    await page.click('[data-testid="settings-tab-tags"]');
    await page.waitForTimeout(500);

    // Wait for tags tab to be visible
    await page.waitForSelector('[data-testid="new-tag-button"]', {
      state: 'visible',
    });

    // Screenshot of the tags management tab
    const settingsContent = page.locator(
      '[data-testid="settings-tab-content"]'
    );
    await settingsContent.screenshot({
      path: join(SCREENSHOTS_DIR, 'tags-tab-light.png'),
    });
  });

  test('capture tags tab in settings - dark mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Enable dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    // Create project using worldbuilding-demo template (includes sample tags)
    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click the Settings button in sidebar
    await page.click('[data-testid="sidebar-settings-button"]');
    await page.waitForTimeout(300);

    // Wait for settings to load
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    // Click the Tags sub-tab
    await page.click('[data-testid="settings-tab-tags"]');
    await page.waitForTimeout(500);

    // Wait for tags tab to be visible
    await page.waitForSelector('[data-testid="new-tag-button"]', {
      state: 'visible',
    });

    // Screenshot of the tags management tab
    const settingsContent = page.locator(
      '[data-testid="settings-tab-content"]'
    );
    await settingsContent.screenshot({
      path: join(SCREENSHOTS_DIR, 'tags-tab-dark.png'),
    });
  });

  test('capture tag edit dialog - light mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    // Create project using worldbuilding-demo template (includes sample tags)
    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click the Settings button in sidebar
    await page.click('[data-testid="sidebar-settings-button"]');
    await page.waitForTimeout(300);

    // Wait for settings to load
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    // Click the Tags sub-tab
    await page.click('[data-testid="settings-tab-tags"]');
    await page.waitForTimeout(500);

    // Click the New Tag button
    await page.click('[data-testid="new-tag-button"]');
    await page.waitForTimeout(300);

    // Wait for dialog to appear
    await page.waitForSelector('mat-dialog-container', {
      state: 'visible',
    });

    // Screenshot of the tag edit dialog
    const dialog = page.locator('mat-dialog-container');
    await dialog.screenshot({
      path: join(SCREENSHOTS_DIR, 'tag-edit-dialog-light.png'),
    });
  });

  test('capture tag edit dialog - dark mode', async ({ offlinePage: page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Enable dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    // Create project using worldbuilding-demo template (includes sample tags)
    await createProjectWithTwoSteps(
      page,
      'My Novel',
      'my-novel',
      'A captivating story about creativity and collaboration',
      'worldbuilding-demo'
    );

    // Wait for navigation to the project page
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click the Settings button in sidebar
    await page.click('[data-testid="sidebar-settings-button"]');
    await page.waitForTimeout(300);

    // Wait for settings to load
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    // Click the Tags sub-tab
    await page.click('[data-testid="settings-tab-tags"]');
    await page.waitForTimeout(500);

    // Click the New Tag button
    await page.click('[data-testid="new-tag-button"]');
    await page.waitForTimeout(300);

    // Wait for dialog to appear
    await page.waitForSelector('mat-dialog-container', {
      state: 'visible',
    });

    // Screenshot of the tag edit dialog
    const dialog = page.locator('mat-dialog-container');
    await dialog.screenshot({
      path: join(SCREENSHOTS_DIR, 'tag-edit-dialog-dark.png'),
    });
  });

  test('capture new document naming dialog - light mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click the "Create" button at the bottom of the tree
    await page.click('[data-testid="create-new-element"]');
    await page.waitForTimeout(300);

    // Wait for the dialog to appear
    await page.waitForSelector('mat-dialog-container', {
      state: 'visible',
    });

    // Click on Document type to proceed to step 2
    await page.click('[data-testid="element-type-item"]');
    await page.waitForTimeout(300);

    // Wait for the name input to appear
    const nameInput = page.getByTestId('element-name-input');
    await nameInput.waitFor({ state: 'visible' });

    // Fill in a sample name
    await nameInput.fill('Chapter 1: The Beginning');
    await page.waitForTimeout(200);

    // Take screenshot of the naming dialog
    const dialog = page.locator('mat-dialog-container');
    await dialog.screenshot({
      path: join(SCREENSHOTS_DIR, 'new-document-dialog-light.png'),
    });
  });

  test('capture new document naming dialog - dark mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Enable dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Click the "Create" button at the bottom of the tree
    await page.click('[data-testid="create-new-element"]');
    await page.waitForTimeout(300);

    // Wait for the dialog to appear
    await page.waitForSelector('mat-dialog-container', {
      state: 'visible',
    });

    // Click on Document type to proceed to step 2
    await page.click('[data-testid="element-type-item"]');
    await page.waitForTimeout(300);

    // Wait for the name input to appear
    const nameInput = page.getByTestId('element-name-input');
    await nameInput.waitFor({ state: 'visible' });

    // Fill in a sample name
    await nameInput.fill('Chapter 1: The Beginning');
    await page.waitForTimeout(200);

    // Take screenshot of the naming dialog
    const dialog = page.locator('mat-dialog-container');
    await dialog.screenshot({
      path: join(SCREENSHOTS_DIR, 'new-document-dialog-dark.png'),
    });
  });

  test('capture project home - desktop dark mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Enable dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the home tab to be visible (project home page)
    await page.waitForSelector('.home-tab-content', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Take screenshot of project home page
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'project-home-desktop-dark.png'),
      fullPage: true,
    });
  });

  test('capture tab context menu - light mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Expand the "Chronicles" folder
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Open "The Moonveil Accord" document to create a tab
    await page.click('text="The Moonveil Accord"');
    await page.waitForTimeout(500);

    // Wait for the document tab to appear
    await page.waitForSelector('[data-testid="tab-The Moonveil Accord"]', {
      state: 'visible',
    });

    // Right-click on the document tab to open context menu
    const docTab = page.locator('[data-testid="tab-The Moonveil Accord"]');
    await docTab.click({ button: 'right' });
    await page.waitForTimeout(300);

    // Wait for context menu to appear
    await page.waitForSelector('.tab-context-menu', {
      state: 'visible',
    });

    // Capture tab bar and context menu together for context
    const tabBar = page.locator('.tab-bar-container');
    const menu = page.locator('.tab-context-menu');

    const tabBarBox = await tabBar.boundingBox();
    const menuBox = await menu.boundingBox();

    if (tabBarBox && menuBox) {
      // Calculate bounding box that includes both elements with padding
      const padding = 16;
      const x = Math.min(tabBarBox.x, menuBox.x) - padding;
      const y = Math.min(tabBarBox.y, menuBox.y) - padding;
      const right =
        Math.max(tabBarBox.x + tabBarBox.width, menuBox.x + menuBox.width) +
        padding;
      const bottom =
        Math.max(tabBarBox.y + tabBarBox.height, menuBox.y + menuBox.height) +
        padding;

      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'tab-context-menu-light.png'),
        clip: {
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: right - x,
          height: bottom - y,
        },
      });
    }
  });

  test('capture tab context menu - dark mode', async ({
    offlinePage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Enable dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });
    await page.waitForTimeout(500);

    // Expand the "Chronicles" folder
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    await expandButton.click();
    await page.waitForTimeout(300);

    // Open "The Moonveil Accord" document to create a tab
    await page.click('text="The Moonveil Accord"');
    await page.waitForTimeout(500);

    // Wait for the document tab to appear
    await page.waitForSelector('[data-testid="tab-The Moonveil Accord"]', {
      state: 'visible',
    });

    // Right-click on the document tab to open context menu
    const docTab = page.locator('[data-testid="tab-The Moonveil Accord"]');
    await docTab.click({ button: 'right' });
    await page.waitForTimeout(300);

    // Wait for context menu to appear
    await page.waitForSelector('.tab-context-menu', {
      state: 'visible',
    });

    // Capture tab bar and context menu together for context
    const tabBar = page.locator('.tab-bar-container');
    const menu = page.locator('.tab-context-menu');

    const tabBarBox = await tabBar.boundingBox();
    const menuBox = await menu.boundingBox();

    if (tabBarBox && menuBox) {
      // Calculate bounding box that includes both elements with padding
      const padding = 16;
      const x = Math.min(tabBarBox.x, menuBox.x) - padding;
      const y = Math.min(tabBarBox.y, menuBox.y) - padding;
      const right =
        Math.max(tabBarBox.x + tabBarBox.width, menuBox.x + menuBox.width) +
        padding;
      const bottom =
        Math.max(tabBarBox.y + tabBarBox.height, menuBox.y + menuBox.height) +
        padding;

      await page.screenshot({
        path: join(SCREENSHOTS_DIR, 'tab-context-menu-dark.png'),
        clip: {
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: right - x,
          height: bottom - y,
        },
      });
    }
  });

  test('capture project editor - desktop', async ({ offlinePage: page }) => {
    // Set viewport to desktop size - tighter focus at 1280px
    await page.setViewportSize({ width: 1280, height: 720 });

    // Navigate to root - should go straight to home since configured
    await page.goto('/');

    // Wait for the empty state (since no projects exist in offline mode initially)
    await page.waitForSelector('.empty-state', {
      state: 'visible',
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible (not just app-project component)
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
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
    await editor.waitFor({ state: 'visible' });

    // Wait for content to settle
    await page.waitForTimeout(300);

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'editor-desktop-light.png'),
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
    await page.waitForURL(/\/demouser\/mobile-story/);

    // On mobile, the project tree is in a sidebar - click hamburger menu to open it
    await page.waitForSelector(
      'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))',
      { state: 'visible' }
    );
    await page.click(
      'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))'
    );
    await page.waitForTimeout(500);

    // Wait for project tree to appear in sidebar
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
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
    await editor.waitFor({ state: 'visible' });

    await page.waitForTimeout(500);

    // Select some text by triple-clicking to trigger the inline menu
    const editorElement = page.locator('.ProseMirror').first();
    await editorElement.click({ clickCount: 3 });
    await page.waitForTimeout(300); // Wait for inline menu to appear

    // Take screenshot with text selected and formatting menu visible
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'editor-mobile-light.png'),
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
    await page.waitForURL(/\/demouser\/my-novel/);

    // Wait for the project tree to be visible (not just app-project component)
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
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
    await editor.waitFor({ state: 'visible' });

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
    await page.waitForURL(/\/demouser\/mobile-story/);

    // On mobile, the project tree is in a sidebar - click hamburger menu to open it
    await page.waitForSelector(
      'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))',
      { state: 'visible' }
    );
    await page.click(
      'button[aria-label*="menu" i], button:has(mat-icon:text("menu"))'
    );
    await page.waitForTimeout(500);

    // Wait for project tree to appear in sidebar
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
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
    await editor.waitFor({ state: 'visible' });

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
    });

    // Create a project first
    await createProjectWithTwoSteps(
      page,
      'Media Showcase',
      'media-showcase',
      'A project demonstrating media storage'
    );
    await page.waitForURL(/\/demouser\/media-showcase/);
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
    });
    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-desktop-light.png'),
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
    });

    // Create a project first
    await createProjectWithTwoSteps(page, 'Filtered Media', 'filtered-media');
    await page.waitForURL(/\/demouser\/filtered-media/);
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
    });

    // Click the "Inline Images" filter
    await page.click('button:has-text("Inline Images")');
    await page.waitForTimeout(300);

    // Take screenshot showing filtered view
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-filtered-light.png'),
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
    });

    // Create a project
    await createProjectWithTwoSteps(page, 'Empty Media', 'empty-media');
    await page.waitForURL(/\/demouser\/empty-media/);
    await page.waitForTimeout(500);

    // Navigate directly to media tab (no media stored)
    await page.goto(`/demouser/empty-media/media`);
    await page.waitForLoadState('networkidle');

    // Wait for empty state to appear
    await page.waitForSelector('.empty-card', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    // Take screenshot of empty state
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-empty-light.png'),
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
    });

    // Create a project
    await createProjectWithTwoSteps(page, 'Mobile Media', 'mobile-media');
    await page.waitForURL(/\/demouser\/mobile-media/);
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
    });
    await page.waitForTimeout(300);

    // Take mobile screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-mobile-light.png'),
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
    });

    // Create a project
    await createProjectWithTwoSteps(page, 'Dark Media', 'dark-media');
    await page.waitForURL(/\/demouser\/dark-media/);
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
    });
    await page.waitForTimeout(500);

    // Take dark mode screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'media-tab-dark.png'),
      fullPage: true,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Create Project Flow Screenshots
  // ─────────────────────────────────────────────────────────────────────────────

  test('capture create button in nav bar - light mode', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Wait for the page to load
    await page.waitForSelector('.covers-grid', {
      state: 'visible',
    });

    // Take a cropped screenshot of just the header area with the Create button
    const headerSection = page.locator('.header-section');
    await headerSection.waitFor({ state: 'visible' });

    await headerSection.screenshot({
      path: join(SCREENSHOTS_DIR, 'create-button-nav-light.png'),
    });
  });

  test('capture create button in nav bar - dark mode', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 720 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Wait for the page to load
    await page.waitForSelector('.covers-grid', {
      state: 'visible',
    });

    // Take a cropped screenshot of just the header area with the Create button
    const headerSection = page.locator('.header-section');
    await headerSection.waitFor({ state: 'visible' });

    await headerSection.screenshot({
      path: join(SCREENSHOTS_DIR, 'create-button-nav-dark.png'),
    });
  });

  test('capture template selection step - light mode', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Click the Create button to go to create project page
    await page.click('.create-btn');

    // Wait for the template selection page to load
    await page.waitForURL(/\/create-project/);
    await page.waitForSelector('.template-grid', {
      state: 'visible',
    });

    // Wait for templates to render
    await page.waitForTimeout(300);

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'create-project-templates-light.png'),
      fullPage: true,
    });
  });

  test('capture template selection step - dark mode', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Click the Create button to go to create project page
    await page.click('.create-btn');

    // Wait for the template selection page to load
    await page.waitForURL(/\/create-project/);
    await page.waitForSelector('.template-grid', {
      state: 'visible',
    });

    // Wait for templates to render
    await page.waitForTimeout(300);

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'create-project-templates-dark.png'),
      fullPage: true,
    });
  });

  test('capture project details step - light mode', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Click the Create button to go to create project page
    await page.click('.create-btn');

    // Wait for the template selection page to load
    await page.waitForURL(/\/create-project/);
    await page.waitForSelector('.template-grid', {
      state: 'visible',
    });

    // Select a template and click Next
    await page.click('[data-testid="template-worldbuilding-demo"]');
    await page.click('[data-testid="next-step-button"]');

    // Wait for step 2 form to appear
    await page.waitForSelector('[data-testid="project-title-input"]', {
      state: 'visible',
    });

    // Fill in the form with sample data
    await page.fill('[data-testid="project-title-input"]', 'My Fantasy Novel');
    await page.waitForTimeout(200);

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'create-project-details-light.png'),
      fullPage: true,
    });
  });

  test('capture project details step - dark mode', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Click the Create button to go to create project page
    await page.click('.create-btn');

    // Wait for the template selection page to load
    await page.waitForURL(/\/create-project/);
    await page.waitForSelector('.template-grid', {
      state: 'visible',
    });

    // Select a template and click Next
    await page.click('[data-testid="template-worldbuilding-demo"]');
    await page.click('[data-testid="next-step-button"]');

    // Wait for step 2 form to appear
    await page.waitForSelector('[data-testid="project-title-input"]', {
      state: 'visible',
    });

    // Fill in the form with sample data
    await page.fill('[data-testid="project-title-input"]', 'My Fantasy Novel');
    await page.waitForTimeout(200);

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'create-project-details-dark.png'),
      fullPage: true,
    });
  });

  // =====================
  // Setup Screen Screenshots
  // =====================

  test('capture setup mode selection - light mode', async ({
    unconfiguredPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Set light mode
    await page.emulateMedia({ colorScheme: 'light' });

    // Navigate to home - should redirect to /setup
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for setup card to be visible
    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    // Wait for mode selection buttons to appear
    await page.waitForSelector('[data-testid="local-mode-button"]', {
      state: 'visible',
    });
    await page.waitForSelector('[data-testid="server-mode-button"]', {
      state: 'visible',
    });

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-mode-selection-light.png'),
      fullPage: true,
    });
  });

  test('capture setup mode selection - dark mode', async ({
    unconfiguredPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to home - should redirect to /setup
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for setup card to be visible
    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    // Wait for mode selection buttons to appear
    await page.waitForSelector('[data-testid="local-mode-button"]', {
      state: 'visible',
    });
    await page.waitForSelector('[data-testid="server-mode-button"]', {
      state: 'visible',
    });

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-mode-selection-dark.png'),
      fullPage: true,
    });
  });

  test('capture setup offline profile - light mode', async ({
    unconfiguredPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Set light mode
    await page.emulateMedia({ colorScheme: 'light' });

    // Navigate to home - should redirect to /setup
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for setup card to be visible
    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    // Click the offline mode button
    await page.click('[data-testid="local-mode-button"]');

    // Wait for offline setup form to appear
    await page.waitForSelector('[data-testid="local-username-input"]', {
      state: 'visible',
    });

    // Fill in sample data for the screenshot
    await page.fill('[data-testid="local-username-input"]', 'writer');
    await page.fill('[data-testid="local-displayname-input"]', 'Jane Writer');

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-offline-light.png'),
      fullPage: true,
    });
  });

  test('capture setup offline profile - dark mode', async ({
    unconfiguredPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to home - should redirect to /setup
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for setup card to be visible
    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    // Click the offline mode button
    await page.click('[data-testid="local-mode-button"]');

    // Wait for offline setup form to appear
    await page.waitForSelector('[data-testid="local-username-input"]', {
      state: 'visible',
    });

    // Fill in sample data for the screenshot
    await page.fill('[data-testid="local-username-input"]', 'writer');
    await page.fill('[data-testid="local-displayname-input"]', 'Jane Writer');

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-offline-dark.png'),
      fullPage: true,
    });
  });

  test('capture setup server connection - light mode', async ({
    unconfiguredPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Set light mode
    await page.emulateMedia({ colorScheme: 'light' });

    // Navigate to home - should redirect to /setup
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for setup card to be visible
    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    // Click the server mode button
    await page.click('[data-testid="server-mode-button"]');

    // Wait for server setup form to appear
    await page.waitForSelector('[data-testid="server-url-input"]', {
      state: 'visible',
    });

    // The default URL should already be shown (localhost:8333)
    // Clear and set a more realistic example URL
    await page.fill(
      '[data-testid="server-url-input"]',
      'https://inkweld.example.com'
    );

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-server-light.png'),
      fullPage: true,
    });
  });

  test('capture setup server connection - dark mode', async ({
    unconfiguredPage: page,
  }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1280, height: 800 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Navigate to home - should redirect to /setup
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Wait for setup card to be visible
    await page.waitForSelector('[data-testid="setup-card"]', {
      state: 'visible',
    });

    // Click the server mode button
    await page.click('[data-testid="server-mode-button"]');

    // Wait for server setup form to appear
    await page.waitForSelector('[data-testid="server-url-input"]', {
      state: 'visible',
    });

    // The default URL should already be shown (localhost:8333)
    // Clear and set a more realistic example URL
    await page.fill(
      '[data-testid="server-url-input"]',
      'https://inkweld.example.com'
    );

    // Take full page screenshot
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'setup-server-dark.png'),
      fullPage: true,
    });
  });
});
