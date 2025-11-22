import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { test } from './fixtures';
import { mockProjects } from './mock-api/projects';

// Only run screenshot tests when explicitly requested
const shouldGenerateScreenshots =
  process.env['GENERATE_SCREENSHOTS'] === 'true';
const describeScreenshots = shouldGenerateScreenshots
  ? test.describe
  : test.describe.skip;

describeScreenshots('PWA Screenshots', () => {
  const demoProjects = [
    {
      id: 'screenshot-1',
      title: 'The Worldbuilding Chronicles',
      description: 'An epic fantasy world with detailed lore and characters',
      username: 'testuser',
      slug: 'worldbuilding-chronicles',
      coverImageUrl: '/assets/demo_covers/worldbuilding_cover_1.png',
      createdAt: new Date('2025-01-15').toISOString(),
      updatedAt: new Date('2025-10-20').toISOString(),
    },
    {
      id: 'screenshot-2',
      title: 'Inkweld Demo Project',
      description: 'A sample project showcasing collaborative writing features',
      username: 'testuser',
      slug: 'inkweld-demo',
      coverImageUrl: '/assets/demo_covers/inkweld_cover_1.png',
      createdAt: new Date('2025-02-10').toISOString(),
      updatedAt: new Date('2025-10-18').toISOString(),
    },
    {
      id: 'screenshot-3',
      title: 'Mystery Novel Draft',
      description: 'A thrilling detective story set in Victorian London',
      username: 'testuser',
      slug: 'mystery-novel',
      coverImageUrl: '/assets/demo_covers/demo_cover_1.png',
      createdAt: new Date('2025-03-05').toISOString(),
      updatedAt: new Date('2025-10-15').toISOString(),
    },
  ];

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

  test.beforeEach(() => {
    // Set up demo projects before EACH test
    // This needs to run before the fixture navigates
    mockProjects.resetProjects();
    demoProjects.forEach(project => {
      mockProjects.addProject(project);
    });
  });

  test('capture project bookshelf - desktop', async ({
    authenticatedPage: page,
  }) => {
    // Set viewport to desktop size - tighter focus at 1280px
    await page.setViewportSize({ width: 1280, height: 720 });

    // Wait for the bookshelf to load
    await page.waitForSelector('app-bookshelf', {
      state: 'visible',
      timeout: 10000,
    });

    // Wait a bit for project cards and images to load
    await page.waitForTimeout(2000);

    // Click on the middle project to shift carousel and show all 3 covers
    const projectCards = page.locator('.project-card');
    const cardCount = await projectCards.count();
    if (cardCount >= 2) {
      await projectCards.nth(1).click();
      await page.waitForTimeout(500); // Wait for animation
    }

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
    // Set viewport to desktop size - tighter focus at 1280px
    await page.setViewportSize({ width: 1280, height: 720 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Wait for the bookshelf to load
    await page.waitForSelector('app-bookshelf', {
      state: 'visible',
      timeout: 10000,
    });

    // Wait a bit for project cards and images to load
    await page.waitForTimeout(2000);

    // Click on the middle project to shift carousel and show all 3 covers
    const projectCards = page.locator('.project-card');
    const cardCount = await projectCards.count();
    if (cardCount >= 2) {
      await projectCards.nth(1).click();
      await page.waitForTimeout(500); // Wait for animation
    }

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
    // Set viewport to mobile size - smaller for tighter focus
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for bookshelf to load
    await page.waitForSelector('app-bookshelf', {
      state: 'visible',
      timeout: 10000,
    });

    // Wait for project cards to load
    await page.waitForTimeout(2000);

    // On mobile, click middle card for carousel
    const projectCards = page.locator('.project-card');
    const cardCount = await projectCards.count();
    if (cardCount >= 2) {
      await projectCards.nth(1).click();
      await page.waitForTimeout(500);
    }

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
    // Set viewport to mobile size - smaller for tighter focus
    await page.setViewportSize({ width: 375, height: 667 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Wait for bookshelf to load
    await page.waitForSelector('app-bookshelf', {
      state: 'visible',
      timeout: 10000,
    });

    // Wait for project cards to load
    await page.waitForTimeout(2000);

    // On mobile, click middle card for carousel
    const projectCards = page.locator('.project-card');
    const cardCount = await projectCards.count();
    if (cardCount >= 2) {
      await projectCards.nth(1).click();
      await page.waitForTimeout(500);
    }

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

  test('capture project editor - desktop', async ({ page }) => {
    // Set viewport to desktop size - tighter focus at 1280px
    await page.setViewportSize({ width: 1280, height: 720 });

    // Configure offline mode to avoid WebSocket connection attempts
    await page.addInitScript(() => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile: {
            name: 'Demo User',
            username: 'demouser',
          },
        })
      );
    });

    // Navigate to root - should go straight to home since configured
    await page.goto('/');

    // Wait for the empty state (since no projects exist in offline mode initially)
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 10000,
    });

    // Click the "Create Project" button in the empty state
    await page.click('button:has-text("Create Project")');

    // Wait for create project form to load
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 10000,
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
    await page.waitForURL(/\/demouser\/my-novel/, { timeout: 10000 });

    // Wait for the project tree to be visible (not just app-project component)
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 10000,
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
    await page.waitForTimeout(1000);

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
    await page.waitForTimeout(1000);

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

  test('capture project editor - mobile', async ({ page }) => {
    // Set viewport to mobile size - smaller for tighter focus
    await page.setViewportSize({ width: 375, height: 667 });

    // Configure offline mode
    await page.addInitScript(() => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile: {
            name: 'Demo User',
            username: 'demouser',
          },
        })
      );
    });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state (no projects initially)
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 10000,
    });

    // Click the create project button
    await page.click('button:has-text("Create Project")');

    // Wait for create project form
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 10000,
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
    await page.waitForURL(/\/demouser\/mobile-story/, { timeout: 10000 });

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
      timeout: 10000,
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
    await page.waitForTimeout(1000);

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
    await page.waitForTimeout(1000); // Wait for inline menu to appear

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

  test('capture project editor - desktop dark mode', async ({ page }) => {
    // Set viewport to desktop size - tighter focus at 1280px
    await page.setViewportSize({ width: 1280, height: 720 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Configure offline mode to avoid WebSocket connection attempts
    await page.addInitScript(() => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile: {
            name: 'Demo User',
            username: 'demouser',
          },
        })
      );
    });

    // Navigate to root - should go straight to home since configured
    await page.goto('/');

    // Wait for the empty state (since no projects exist in offline mode initially)
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 10000,
    });

    // Click the "Create Project" button in the empty state
    await page.click('button:has-text("Create Project")');

    // Wait for create project form to load
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 10000,
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
    await page.waitForURL(/\/demouser\/my-novel/, { timeout: 10000 });

    // Wait for the project tree to be visible (not just app-project component)
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 10000,
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
    await page.waitForTimeout(1000);

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
    await page.waitForTimeout(1000);

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

  test('capture project editor - mobile dark mode', async ({ page }) => {
    // Set viewport to mobile size - smaller for tighter focus
    await page.setViewportSize({ width: 375, height: 667 });

    // Set dark mode
    await page.emulateMedia({ colorScheme: 'dark' });

    // Configure offline mode
    await page.addInitScript(() => {
      localStorage.setItem(
        'inkweld-app-config',
        JSON.stringify({
          mode: 'offline',
          userProfile: {
            name: 'Demo User',
            username: 'demouser',
          },
        })
      );
    });

    // Navigate to root
    await page.goto('/');

    // Wait for the empty state (no projects initially)
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 10000,
    });

    // Click the create project button
    await page.click('button:has-text("Create Project")');

    // Wait for create project form
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 10000,
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
    await page.waitForURL(/\/demouser\/mobile-story/, { timeout: 10000 });

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
      timeout: 10000,
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
    await page.waitForTimeout(1000);

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
    await page.waitForTimeout(1000); // Wait for inline menu to appear

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
});
