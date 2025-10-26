import { existsSync } from 'fs';import { existsSync } from 'fs';

import { mkdir } from 'fs/promises';import { mkdir } from 'fs/promises';

import { join } from 'path';import { join } from 'path';



import { test } from './fixtures';import { test } from './fixtures';

import { mockProjects } from './mock-api/projects';import { mockProjects } from './mock-api/projects';



// Only run screenshot tests when explicitly requested// Only run screenshot tests when explicitly requested

const shouldGenerateScreenshots = process.env['GENERATE_SCREENSHOTS'] === 'true';const shouldGenerateScreenshots = process.env['GENERATE_SCREENSHOTS'] === 'true';

const describeScreenshots = shouldGenerateScreenshots ? test.describe : test.describe.skip;const describeScreenshots = shouldGenerateScreenshots ? test.describe : test.describe.skip;



describeScreenshots('PWA Screenshots', () => {describeScreenshots('PWA Screenshots', () => {

  const demoProjects = [  const demoProjects = [

    {    {

      id: 'screenshot-1',      id: 'screenshot-1',

      title: 'The Worldbuilding Chronicles',      title: 'The Worldbuilding Chronicles',

      description: 'An epic fantasy world with detailed lore and characters',      description: 'An epic fantasy world with detailed lore and characters',

      username: 'testuser',      username: 'testuser',

      slug: 'worldbuilding-chronicles',      slug: 'worldbuilding-chronicles',

      coverImageUrl: '/assets/demo_covers/worldbuilding_cover_1.png',      coverImageUrl: '/assets/demo_covers/worldbuilding_cover_1.png',

      createdAt: new Date('2025-01-15').toISOString(),      createdAt: new Date('2025-01-15').toISOString(),

      updatedAt: new Date('2025-10-20').toISOString(),      updatedAt: new Date('2025-10-20').toISOString(),

    },    },

    {    {

      id: 'screenshot-2',      id: 'screenshot-2',

      title: 'Inkweld Demo Project',      title: 'Inkweld Demo Project',

      description: 'A sample project showcasing collaborative writing features',      description: 'A sample project showcasing collaborative writing features',

      username: 'testuser',      username: 'testuser',

      slug: 'inkweld-demo',      slug: 'inkweld-demo',

      coverImageUrl: '/assets/demo_covers/inkweld_cover_1.png',      coverImageUrl: '/assets/demo_covers/inkweld_cover_1.png',

      createdAt: new Date('2025-02-10').toISOString(),      createdAt: new Date('2025-02-10').toISOString(),

      updatedAt: new Date('2025-10-18').toISOString(),      updatedAt: new Date('2025-10-18').toISOString(),

    },    },

    {    {

      id: 'screenshot-3',      id: 'screenshot-3',

      title: 'Mystery Novel Draft',      title: 'Mystery Novel Draft',

      description: 'A thrilling detective story set in Victorian London',      description: 'A thrilling detective story set in Victorian London',

      username: 'testuser',      username: 'testuser',

      slug: 'mystery-novel',      slug: 'mystery-novel',

      coverImageUrl: '/assets/demo_covers/demo_cover_1.png',      coverImageUrl: '/assets/demo_covers/demo_cover_1.png',

      createdAt: new Date('2025-03-05').toISOString(),      createdAt: new Date('2025-03-05').toISOString(),

      updatedAt: new Date('2025-10-15').toISOString(),      updatedAt: new Date('2025-10-15').toISOString(),

    },    },

  ];  ];



  const colorSchemes = ['light', 'dark'] as const;  const colorSchemes = ['light', 'dark'] as const;



  test.beforeAll(async () => {  test.beforeAll(async () => {

    // Ensure screenshots directory exists at project root    // Ensure screenshots directory exists at project root

    const screenshotsDir = join(process.cwd(), '..', 'assets', 'screenshots');    const screenshotsDir = join(process.cwd(), '..', 'assets', 'screenshots');

    if (!existsSync(screenshotsDir)) {    if (!existsSync(screenshotsDir)) {

      await mkdir(screenshotsDir, { recursive: true });      await mkdir(screenshotsDir, { recursive: true });

    }    }

  });  });



  test.beforeEach(async () => {  test.beforeEach(async () => {

    // Set up demo projects before EACH test    // Set up demo projects before EACH test

    // This needs to run before the fixture navigates    // This needs to run before the fixture navigates

    mockProjects.resetProjects();    mockProjects.resetProjects();

    demoProjects.forEach(project => {    demoProjects.forEach(project => {

      mockProjects.addProject(project);      mockProjects.addProject(project);

    });    });

  });  });



  for (const colorScheme of colorSchemes) {  for (const colorScheme of colorSchemes) {

    test(`capture project bookshelf - desktop - ${colorScheme}`, async ({ authenticatedPage: page }) => {    test(`capture project bookshelf - desktop - ${colorScheme}`, async ({ authenticatedPage: page }) => {

      // Set color scheme      // Set color scheme

      await page.emulateMedia({ colorScheme });      await page.emulateMedia({ colorScheme });

            

      // Set viewport to desktop size - tighter focus at 1280px      // Set viewport to desktop size - tighter focus at 1280px

      await page.setViewportSize({ width: 1280, height: 720 });      await page.setViewportSize({ width: 1280, height: 720 });



      // Wait for the bookshelf to load      // Wait for the bookshelf to load

      await page.waitForSelector('app-bookshelf', { state: 'visible', timeout: 10000 });      await page.waitForSelector('app-bookshelf', { state: 'visible', timeout: 10000 });



      // Wait a bit for project cards and images to load      // Wait a bit for project cards and images to load

      await page.waitForTimeout(2000);      await page.waitForTimeout(2000);



      // Click on the middle project to shift carousel and show all 3 covers      // Click on the middle project to shift carousel and show all 3 covers

      const projectCards = page.locator('.project-card');      const projectCards = page.locator('.project-card');

      const cardCount = await projectCards.count();      const cardCount = await projectCards.count();

      if (cardCount >= 2) {      if (cardCount >= 2) {

        await projectCards.nth(1).click();        await projectCards.nth(1).click();

        await page.waitForTimeout(500); // Wait for animation        await page.waitForTimeout(500); // Wait for animation

      }      }



      // Take screenshot      // Take screenshot

      await page.screenshot({      await page.screenshot({

        path: join(process.cwd(), '..', 'assets', 'screenshots', `bookshelf-desktop-${colorScheme}.png`),        path: join(process.cwd(), '..', 'assets', 'screenshots', `bookshelf-desktop-${colorScheme}.png`),

        fullPage: true,        fullPage: true,

      });      });

    });    });



    test(`capture project bookshelf - mobile - ${colorScheme}`, async ({ authenticatedPage: page }) => {    test(`capture project bookshelf - mobile - ${colorScheme}`, async ({ authenticatedPage: page }) => {

      // Set color scheme      // Set color scheme

      await page.emulateMedia({ colorScheme });      await page.emulateMedia({ colorScheme });

            

      // Set viewport to mobile size - smaller for tighter focus      // Set viewport to mobile size - smaller for tighter focus

      await page.setViewportSize({ width: 375, height: 667 });      await page.setViewportSize({ width: 375, height: 667 });



      // Wait for bookshelf to load      // Wait for bookshelf to load

      await page.waitForSelector('app-bookshelf', { state: 'visible', timeout: 10000 });      await page.waitForSelector('app-bookshelf', { state: 'visible', timeout: 10000 });



      // Wait for project cards to load      // Wait for project cards to load

      await page.waitForTimeout(2000);      await page.waitForTimeout(2000);



      // On mobile, click middle card for carousel      // On mobile, click middle card for carousel

      const projectCards = page.locator('.project-card');      const projectCards = page.locator('.project-card');

      const cardCount = await projectCards.count();      const cardCount = await projectCards.count();

      if (cardCount >= 2) {      if (cardCount >= 2) {

        await projectCards.nth(1).click();        await projectCards.nth(1).click();

        await page.waitForTimeout(500);        await page.waitForTimeout(500);

      }      }



      // Take screenshot      // Take screenshot

      await page.screenshot({      await page.screenshot({

        path: join(process.cwd(), '..', 'assets', 'screenshots', `bookshelf-mobile-${colorScheme}.png`),        path: join(process.cwd(), '..', 'assets', 'screenshots', `bookshelf-mobile-${colorScheme}.png`),

        fullPage: true,        fullPage: true,

      });      });

    });    });



    test(`capture project editor - desktop - ${colorScheme}`, async ({ page }) => {    test(`capture project editor - desktop - ${colorScheme}`, async ({ page }) => {

      // Set color scheme      // Set color scheme

      await page.emulateMedia({ colorScheme });      await page.emulateMedia({ colorScheme });

            

      // Set viewport to desktop size - tighter focus at 1280px      // Set viewport to desktop size - tighter focus at 1280px

      await page.setViewportSize({ width: 1280, height: 720 });      await page.setViewportSize({ width: 1280, height: 720 });



      // Configure offline mode to avoid WebSocket connection attempts    // Wait for bookshelf to load

      await page.addInitScript(() => {    await page.waitForSelector('app-bookshelf', { state: 'visible', timeout: 10000 });

        localStorage.setItem('inkweld-app-config', JSON.stringify({

          mode: 'offline',    // Wait for project cards to load

          userProfile: {    await page.waitForTimeout(2000);

            name: 'Demo User',

            username: 'demouser'    // On mobile, click middle card for carousel

          }    const projectCards = page.locator('.project-card');

        }));    const cardCount = await projectCards.count();

      });    if (cardCount >= 2) {

      await projectCards.nth(1).click();

      // Navigate to root - should go straight to home since configured      await page.waitForTimeout(500);

      await page.goto('/');    }



      // Wait for the empty state (since no projects exist in offline mode initially)    // Take screenshot

      await page.waitForSelector('.empty-state', { state: 'visible', timeout: 10000 });    await page.screenshot({

      path: join(process.cwd(), '..', 'assets', 'screenshots', 'bookshelf-mobile.png'),

      // Click the "Create Project" button in the empty state      fullPage: true,

      await page.click('button:has-text("Create Project")');    });

  });

      // Wait for create project form to load

      await page.waitForSelector('input[data-testid="project-title-input"]', { state: 'visible', timeout: 10000 });  test('capture project editor - desktop', async ({ page }) => {

    // Set viewport to desktop size - tighter focus at 1280px

      // Fill in project details    await page.setViewportSize({ width: 1280, height: 720 });

      await page.fill('input[data-testid="project-title-input"]', 'My Novel');

      await page.fill('textarea[formcontrolname="description"]', 'A captivating story about creativity and collaboration');    // Configure offline mode to avoid WebSocket connection attempts

      await page.fill('input[data-testid="project-slug-input"]', 'my-novel');    await page.addInitScript(() => {

      localStorage.setItem('inkweld-app-config', JSON.stringify({

      // Submit the form        mode: 'offline',

      await page.click('button[type="submit"]');        userProfile: {

          name: 'Demo User',

      // Wait for navigation to the project page          username: 'demouser'

      await page.waitForURL(/\/demouser\/my-novel/, { timeout: 10000 });        }

      }));

      // Wait for the project tree to be visible (not just app-project component)    });

      await page.waitForSelector('app-project-tree', { state: 'visible', timeout: 10000 });

      await page.waitForTimeout(1500);    // Navigate to root - should go straight to home since configured

    await page.goto('/');

      // The default structure creates "Chapters" folder with "Chapter 1" inside

      // First, expand the "Chapters" folder by clicking the chevron button    // Wait for the empty state (since no projects exist in offline mode initially)

      const expandButton = page.locator('[data-testid="expand-folder-button"]').first();    await page.waitForSelector('.empty-state', { state: 'visible', timeout: 10000 });

      await expandButton.click();

      await page.waitForTimeout(500);    // Click the "Create Project" button in the empty state

    await page.click('button:has-text("Create Project")');

      // Now "Chapter 1" should be visible - click on it to open

      await page.click('text="Chapter 1"');    // Wait for create project form to load

      await page.waitForTimeout(1000);    await page.waitForSelector('input[data-testid="project-title-input"]', { state: 'visible', timeout: 10000 });



      // Wait for editor to load and click into it    // Fill in project details

      const editor = page.locator('.ProseMirror').first();    await page.fill('input[data-testid="project-title-input"]', 'My Novel');

      await editor.waitFor({ state: 'visible', timeout: 5000 });    await page.fill('textarea[formcontrolname="description"]', 'A captivating story about creativity and collaboration');

      await editor.click();    await page.fill('input[data-testid="project-slug-input"]', 'my-novel');



      // Type some compelling content    // Submit the form

      await editor.pressSequentially('The rain hammered against the windowpane as Sarah opened her laptop, ready to pour her imagination onto the digital page. ', { delay: 10 });    await page.click('button[type="submit"]');

      await editor.pressSequentially('Inkweld made it effortless—her characters, plot notes, and chapters all organized in one place.\n\n', { delay: 10 });

      await editor.pressSequentially('She smiled, knowing that collaboration with her co-author would be seamless, even across continents.', { delay: 10 });    // Wait for navigation to the project page

    await page.waitForURL(/\/demouser\/my-novel/, { timeout: 10000 });

      // Wait for content to settle

      await page.waitForTimeout(1000);    // Wait for the project tree to be visible (not just app-project component)

    await page.waitForSelector('app-project-tree', { state: 'visible', timeout: 10000 });

      // Take screenshot    await page.waitForTimeout(1500);

      await page.screenshot({

        path: join(process.cwd(), '..', 'assets', 'screenshots', `editor-desktop-${colorScheme}.png`),    // The default structure creates "Chapters" folder with "Chapter 1" inside

        fullPage: true,    // First, expand the "Chapters" folder by clicking the chevron button

      });    const expandButton = page.locator('[data-testid="expand-folder-button"]').first();

    });    await expandButton.click();

    await page.waitForTimeout(500);

    test(`capture project editor - mobile - ${colorScheme}`, async ({ page }) => {

      // Set color scheme    // Now "Chapter 1" should be visible - click on it to open

      await page.emulateMedia({ colorScheme });    await page.click('text="Chapter 1"');

          await page.waitForTimeout(1000);

      // Set viewport to mobile size - smaller for tighter focus

      await page.setViewportSize({ width: 375, height: 667 });    // Wait for editor to load and click into it

    const editor = page.locator('.ProseMirror').first();

      // Configure offline mode    await editor.waitFor({ state: 'visible', timeout: 5000 });

      await page.addInitScript(() => {    await editor.click();

        localStorage.setItem('inkweld-app-config', JSON.stringify({

          mode: 'offline',    // Type some compelling content

          userProfile: {    await editor.pressSequentially('The rain hammered against the windowpane as Sarah opened her laptop, ready to pour her imagination onto the digital page. ', { delay: 10 });

            name: 'Demo User',    await editor.pressSequentially('Inkweld made it effortless—her characters, plot notes, and chapters all organized in one place.\n\n', { delay: 10 });

            username: 'demouser'    await editor.pressSequentially('She smiled, knowing that collaboration with her co-author would be seamless, even across continents.', { delay: 10 });

          }

        }));    // Wait for content to settle

      });    await page.waitForTimeout(1000);



      // Navigate to root    // Take screenshot

      await page.goto('/');    await page.screenshot({

      path: join(process.cwd(), '..', 'assets', 'screenshots', 'editor-desktop.png'),

      // Wait for the empty state (no projects initially)      fullPage: true,

      await page.waitForSelector('.empty-state', { state: 'visible', timeout: 10000 });    });

  });

      // Click the create project button

      await page.click('button:has-text("Create Project")');  test('capture project editor - mobile', async ({ page }) => {

    // Set viewport to mobile size - smaller for tighter focus

      // Wait for create project form    await page.setViewportSize({ width: 375, height: 667 });

      await page.waitForSelector('input[data-testid="project-title-input"]', { state: 'visible', timeout: 10000 });

    // Configure offline mode

      // Fill in project details    await page.addInitScript(() => {

      await page.fill('input[data-testid="project-title-input"]', 'Mobile Story');      localStorage.setItem('inkweld-app-config', JSON.stringify({

      await page.fill('textarea[formcontrolname="description"]', 'Writing on the go');        mode: 'offline',

      await page.fill('input[data-testid="project-slug-input"]', 'mobile-story');        userProfile: {

          name: 'Demo User',

      // Submit form          username: 'demouser'

      await page.click('button[type="submit"]');        }

      }));

      // Wait for navigation to project page    });

      await page.waitForURL(/\/demouser\/mobile-story/, { timeout: 10000 });

    // Navigate to root

      // On mobile, the project tree is in a sidebar - click hamburger menu to open it    await page.goto('/');

      await page.waitForSelector('button[aria-label*="menu" i], button:has(mat-icon:text("menu"))', { state: 'visible', timeout: 5000 });

      await page.click('button[aria-label*="menu" i], button:has(mat-icon:text("menu"))');    // Wait for the empty state (no projects initially)

      await page.waitForTimeout(500);    await page.waitForSelector('.empty-state', { state: 'visible', timeout: 10000 });



      // Wait for project tree to appear in sidebar    // Click the create project button

      await page.waitForSelector('app-project-tree', { state: 'visible', timeout: 10000 });    await page.click('button:has-text("Create Project")');

      await page.waitForTimeout(500);

    // Wait for create project form

      // Expand "Chapters" folder by clicking the chevron    await page.waitForSelector('input[data-testid="project-title-input"]', { state: 'visible', timeout: 10000 });

      const expandButton = page.locator('[data-testid="expand-folder-button"]').first();

      await expandButton.click();    // Fill in project details

      await page.waitForTimeout(500);    await page.fill('input[data-testid="project-title-input"]', 'Mobile Story');

    await page.fill('textarea[formcontrolname="description"]', 'Writing on the go');

      // Click on "Chapter 1" from default structure    await page.fill('input[data-testid="project-slug-input"]', 'mobile-story');

      await page.click('text="Chapter 1"');

      await page.waitForTimeout(1000);    // Submit form

    await page.click('button[type="submit"]');

      // Type into editor - multiple paragraphs

      const editor = page.locator('.ProseMirror').first();    // Wait for navigation to project page

      await editor.waitFor({ state: 'visible', timeout: 5000 });    await page.waitForURL(/\/demouser\/mobile-story/, { timeout: 10000 });

      await editor.click();

          // On mobile, the project tree is in a sidebar - click hamburger menu to open it

      // Type first paragraph    await page.waitForSelector('button[aria-label*="menu" i], button:has(mat-icon:text("menu"))', { state: 'visible', timeout: 5000 });

      await editor.pressSequentially('Writing on mobile has never been easier. Inkweld adapts to your screen, letting you craft stories wherever inspiration strikes.', { delay: 10 });    await page.click('button[aria-label*="menu" i], button:has(mat-icon:text("menu"))');

      await page.keyboard.press('Enter');    await page.waitForTimeout(500);

      await page.keyboard.press('Enter');

          // Wait for project tree to appear in sidebar

      // Type second paragraph    await page.waitForSelector('app-project-tree', { state: 'visible', timeout: 10000 });

      await editor.pressSequentially('Whether you\'re on the bus, waiting in line, or relaxing in a café, your stories are always at your fingertips.', { delay: 10 });    await page.waitForTimeout(500);

      await page.keyboard.press('Enter');

      await page.keyboard.press('Enter');    // Expand "Chapters" folder by clicking the chevron

          const expandButton = page.locator('[data-testid="expand-folder-button"]').first();

      // Type third paragraph    await expandButton.click();

      await editor.pressSequentially('Start writing today and bring your ideas to life.', { delay: 10 });    await page.waitForTimeout(500);



      await page.waitForTimeout(500);    // Click on "Chapter 1" from default structure

    await page.click('text="Chapter 1"');

      // Select the last paragraph by triple-clicking (this worked before)    await page.waitForTimeout(1000);

      // Triple-click selects the entire paragraph and triggers the inline menu

      const editorElement = page.locator('.ProseMirror').first();    // Type into editor - multiple paragraphs

      await editorElement.click({ clickCount: 3 });    const editor = page.locator('.ProseMirror').first();

      await page.waitForTimeout(1000); // Wait for inline menu to appear    await editor.waitFor({ state: 'visible', timeout: 5000 });

    await editor.click();

      // Take screenshot with text selected and formatting menu visible    

      await page.screenshot({    // Type first paragraph

        path: join(process.cwd(), '..', 'assets', 'screenshots', `editor-mobile-${colorScheme}.png`),    await editor.pressSequentially('Writing on mobile has never been easier. Inkweld adapts to your screen, letting you craft stories wherever inspiration strikes.', { delay: 10 });

        fullPage: true,    await page.keyboard.press('Enter');

      });    await page.keyboard.press('Enter');

    });    

  }    // Type second paragraph

});    await editor.pressSequentially('Whether you\'re on the bus, waiting in line, or relaxing in a café, your stories are always at your fingertips.', { delay: 10 });

    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    
    // Type third paragraph
    await editor.pressSequentially('Start writing today and bring your ideas to life.', { delay: 10 });

    await page.waitForTimeout(500);

    // Select the last paragraph by triple-clicking (this worked before)
    // Triple-click selects the entire paragraph and triggers the inline menu
    const editorElement = page.locator('.ProseMirror').first();
    await editorElement.click({ clickCount: 3 });
    await page.waitForTimeout(1000); // Wait for inline menu to appear

    // Take screenshot with text selected and formatting menu visible
    await page.screenshot({
      path: join(process.cwd(), '..', 'assets', 'screenshots', 'editor-mobile.png'),
      fullPage: true,
    });
  });
});
