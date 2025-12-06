/**
 * Element Reference Screenshot Tests
 *
 * Captures comprehensive screenshots demonstrating the @ mention feature:
 * - Full e2e flow: typing @, searching, selecting, final result
 * - Tooltip on hover
 * - Both light and dark mode variants
 */

import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { expect, test } from './fixtures';

test.describe('Element Reference Screenshots', () => {
  const screenshotsDir = join(
    process.cwd(),
    '..',
    'docs',
    'site',
    'static',
    'img',
    'features'
  );

  test.beforeAll(async () => {
    // Ensure screenshots directory exists
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true });
    }
  });

  /**
   * Helper to create a project and navigate to editor
   */
  async function setupProjectAndEditor(
    page: import('@playwright/test').Page,
    projectSlug: string,
    projectTitle: string
  ) {
    // Navigate to root
    await page.goto('/');

    // Wait for the empty state and create a project
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 5000,
    });

    // Click the create project button
    await page.click('button:has-text("Create Project")');

    // Wait for create project form
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    // Fill in project details
    await page.fill('input[data-testid="project-title-input"]', projectTitle);
    await page.fill('input[data-testid="project-slug-input"]', projectSlug);

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for navigation to the project page
    await page.waitForURL(new RegExp(`/demouser/${projectSlug}`), {
      timeout: 5000,
    });

    // Wait for project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    await page.waitForTimeout(500);

    // Expand the "Chapters" folder
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(400);
    }

    // Click on "Chapter 1" to open it
    await page.click('text="Chapter 1"').catch(() => {
      return page.locator('.tree-node-item').first().click();
    });
    await page.waitForTimeout(400);

    // Wait for editor to load and click into it
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    return editor;
  }

  /**
   * Helper to create a project with a character element for showcasing character references
   */
  async function setupProjectWithCharacter(
    page: import('@playwright/test').Page,
    projectSlug: string,
    projectTitle: string,
    characterName: string
  ) {
    // Navigate to root
    await page.goto('/');

    // Wait for the empty state and create a project
    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 5000,
    });

    // Click the create project button
    await page.click('button:has-text("Create Project")');

    // Wait for create project form
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    // Fill in project details
    await page.fill('input[data-testid="project-title-input"]', projectTitle);
    await page.fill('input[data-testid="project-slug-input"]', projectSlug);

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for navigation to the project page
    await page.waitForURL(new RegExp(`/demouser/${projectSlug}`), {
      timeout: 5000,
    });

    // Wait for project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
      timeout: 3000,
    });
    await page.waitForTimeout(500);

    // Create a character element at the root level
    await page.getByTestId('add-element-button').click();
    await page.getByTestId('element-type-character').click();
    await page.getByTestId('element-name-input').fill(characterName);
    await page.getByTestId('create-element-button').click();
    await page.waitForTimeout(300);

    // Expand the "Chapters" folder to access Chapter 1
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.waitForTimeout(400);
    }

    // Click on "Chapter 1" to open it
    await page.click('text="Chapter 1"').catch(() => {
      return page.locator('.tree-node-item').first().click();
    });
    await page.waitForTimeout(400);

    // Wait for editor to load and click into it
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible', timeout: 5000 });
    await editor.click();

    return editor;
  }

  /**
   * Helper to toggle dark mode
   */
  async function enableDarkMode(page: import('@playwright/test').Page) {
    // Click on the theme toggle in the toolbar or settings
    // First check if there's a theme toggle button
    const themeToggle = page.locator(
      'button[aria-label*="theme"], button[matTooltip*="theme"], button:has(mat-icon:text("dark_mode")), button:has(mat-icon:text("light_mode"))'
    );

    if (await themeToggle.isVisible({ timeout: 1000 }).catch(() => false)) {
      await themeToggle.click();
      await page.waitForTimeout(300);
    } else {
      // Fallback: add dark-theme class directly to body
      await page.evaluate(() => {
        document.body.classList.add('dark-theme');
        document.documentElement.classList.add('dark-theme');
      });
      await page.waitForTimeout(200);
    }
  }

  test.describe('Light Mode', () => {
    test('capture full @ mention flow - light mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const editor = await setupProjectAndEditor(
        page,
        'light-demo-' + Date.now(),
        'Fantasy Novel'
      );

      // Step 1: Type some content before the @ mention
      await editor.pressSequentially('The journey began when Elena met ', {
        delay: 20,
      });

      // Step 2: Type @ to trigger the popup
      await page.keyboard.type('@');

      // Wait for the popup to appear
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => {
          console.log('Popup not visible - may need elements');
        });

      await page.waitForTimeout(400);

      // Screenshot 1: Popup just opened (showing all elements)
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-01-popup-light.png'),
        fullPage: false,
      });
      console.log('✓ Captured popup opening (light mode)');

      // Step 3: Type search query
      await page.keyboard.type('chap');
      await page.waitForTimeout(300);

      // Screenshot 2: Search in progress
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-02-search-light.png'),
        fullPage: false,
      });
      console.log('✓ Captured search in progress (light mode)');

      // Step 4: Select the first result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        await resultItem.click();
      } else {
        // Press Enter to select first result
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      // Continue typing after the reference
      await editor.pressSequentially(' at the crossroads.', { delay: 20 });
      await page.waitForTimeout(300);

      // Screenshot 3: Link in document
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-03-link-light.png'),
        fullPage: false,
      });
      console.log('✓ Captured link in document (light mode)');

      // Step 5: Hover over the link to show tooltip
      const elementRef = page.locator('.element-ref').first();
      if (await elementRef.isVisible().catch(() => false)) {
        await elementRef.hover();
        // Wait for native tooltip to show (takes a moment)
        await page.waitForTimeout(800);

        // Screenshot 4: Tooltip visible
        await page.screenshot({
          path: join(screenshotsDir, 'element-ref-04-tooltip-light.png'),
          fullPage: false,
        });
        console.log('✓ Captured tooltip on hover (light mode)');
      }
    });

    test('capture editor focused view - light mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      // Use setupProjectWithCharacter so we have a meaningful reference
      const characterName = 'Aria Stormwind';
      const editor = await setupProjectWithCharacter(
        page,
        'editor-light-' + Date.now(),
        'Writing Demo',
        characterName
      );

      // Type content with an @ mention to a character
      await editor.pressSequentially(
        'The ancient prophecy spoke of a hero who would rise. When ',
        { delay: 15 }
      );

      // Trigger @ and search for character
      await page.keyboard.type('@');
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 2000,
        })
        .catch(() => {});

      // Type to search for the character
      await page.keyboard.type('aria');
      await page.waitForTimeout(300);

      // Select the character result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(200);

      // Continue typing
      await editor.pressSequentially(
        ' appeared, the world knew that destiny had arrived.',
        { delay: 15 }
      );
      await page.waitForTimeout(300);

      // Try to capture just the editor container
      const editorContainer = page.locator('.document-editor').first();
      if (await editorContainer.isVisible().catch(() => false)) {
        await editorContainer.screenshot({
          path: join(screenshotsDir, 'element-ref-editor-light.png'),
        });
      } else {
        await page.screenshot({
          path: join(screenshotsDir, 'element-ref-editor-light.png'),
          fullPage: false,
        });
      }
      console.log('✓ Captured editor focused view (light mode)');
    });

    test('capture character reference showcase - light mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const characterName = 'Elena Blackwood';
      const editor = await setupProjectWithCharacter(
        page,
        'character-demo-' + Date.now(),
        'The Enchanted Kingdom',
        characterName
      );

      // Type story content that will include a character reference
      await editor.pressSequentially(
        'The morning sun broke through the mist as ',
        { delay: 15 }
      );

      // Trigger @ and search for the character
      await page.keyboard.type('@');
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => {});

      // Search for Elena
      await page.keyboard.type('elena');
      await page.waitForTimeout(400);

      // Screenshot: Searching for a character
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-character-search-light.png'),
        fullPage: false,
      });
      console.log('✓ Captured character search (light mode)');

      // Select the character result
      const characterResult = page
        .locator('[data-testid="element-ref-result-item"]')
        .filter({ hasText: characterName });
      if (
        await characterResult.isVisible({ timeout: 1000 }).catch(() => false)
      ) {
        await characterResult.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      // Continue typing
      await editor.pressSequentially(
        ' stepped out of the ancient tower, her silver cloak billowing in the wind.',
        { delay: 15 }
      );
      await page.waitForTimeout(300);

      // Screenshot: Character reference in text
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-character-link-light.png'),
        fullPage: false,
      });
      console.log('✓ Captured character link in text (light mode)');

      // Hover over the character reference to show tooltip
      const characterRef = page.locator('.element-ref').first();
      if (await characterRef.isVisible().catch(() => false)) {
        await characterRef.hover();
        await page.waitForTimeout(800);

        // Screenshot: Character tooltip with character icon
        await page.screenshot({
          path: join(screenshotsDir, 'element-ref-character-tooltip-light.png'),
          fullPage: false,
        });
        console.log('✓ Captured character tooltip (light mode)');
      }
    });
  });

  test.describe('Dark Mode', () => {
    test('capture full @ mention flow - dark mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const editor = await setupProjectAndEditor(
        page,
        'dark-demo-' + Date.now(),
        'Dark Fantasy'
      );

      // Enable dark mode
      await enableDarkMode(page);
      await page.waitForTimeout(300);

      // Step 1: Type some content before the @ mention
      await editor.pressSequentially('The shadows whispered of ', {
        delay: 20,
      });

      // Step 2: Type @ to trigger the popup
      await page.keyboard.type('@');

      // Wait for the popup to appear
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => {
          console.log('Popup not visible');
        });

      await page.waitForTimeout(400);

      // Screenshot 1: Popup just opened (dark mode)
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-01-popup-dark.png'),
        fullPage: false,
      });
      console.log('✓ Captured popup opening (dark mode)');

      // Step 3: Type search query
      await page.keyboard.type('chap');
      await page.waitForTimeout(300);

      // Screenshot 2: Search in progress (dark mode)
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-02-search-dark.png'),
        fullPage: false,
      });
      console.log('✓ Captured search in progress (dark mode)');

      // Step 4: Select the first result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      // Continue typing after the reference
      await editor.pressSequentially(' in the moonlight.', { delay: 20 });
      await page.waitForTimeout(300);

      // Screenshot 3: Link in document (dark mode)
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-03-link-dark.png'),
        fullPage: false,
      });
      console.log('✓ Captured link in document (dark mode)');

      // Step 5: Hover over the link to show tooltip
      const elementRef = page.locator('.element-ref').first();
      if (await elementRef.isVisible().catch(() => false)) {
        await elementRef.hover();
        await page.waitForTimeout(800);

        // Screenshot 4: Tooltip visible (dark mode)
        await page.screenshot({
          path: join(screenshotsDir, 'element-ref-04-tooltip-dark.png'),
          fullPage: false,
        });
        console.log('✓ Captured tooltip on hover (dark mode)');
      }
    });

    test('capture editor focused view - dark mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      // Use setupProjectWithCharacter so we have a meaningful reference
      const characterName = 'Kira Shadowmere';
      const editor = await setupProjectWithCharacter(
        page,
        'editor-dark-' + Date.now(),
        'Night Chronicles',
        characterName
      );

      // Enable dark mode
      await enableDarkMode(page);
      await page.waitForTimeout(300);

      // Type content with an @ mention to a character
      await editor.pressSequentially(
        'When darkness fell upon the realm, only ',
        { delay: 15 }
      );

      // Trigger @ and search for character
      await page.keyboard.type('@');
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 2000,
        })
        .catch(() => {});

      // Type to search for the character
      await page.keyboard.type('kira');
      await page.waitForTimeout(300);

      // Select the character result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(200);

      // Continue typing
      await editor.pressSequentially(' remained to guide the lost.', {
        delay: 15,
      });
      await page.waitForTimeout(300);

      // Try to capture just the editor container
      const editorContainer = page.locator('.document-editor').first();
      if (await editorContainer.isVisible().catch(() => false)) {
        await editorContainer.screenshot({
          path: join(screenshotsDir, 'element-ref-editor-dark.png'),
        });
      } else {
        await page.screenshot({
          path: join(screenshotsDir, 'element-ref-editor-dark.png'),
          fullPage: false,
        });
      }
      console.log('✓ Captured editor focused view (dark mode)');
    });

    test('capture character reference showcase - dark mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const characterName = 'Marcus Nightshade';
      const editor = await setupProjectWithCharacter(
        page,
        'character-dark-' + Date.now(),
        'Shadows of the Realm',
        characterName
      );

      // Enable dark mode
      await enableDarkMode(page);
      await page.waitForTimeout(300);

      // Type story content that will include a character reference
      await editor.pressSequentially('In the depths of the ancient forest, ', {
        delay: 15,
      });

      // Trigger @ and search for the character
      await page.keyboard.type('@');
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => {});

      // Search for Marcus
      await page.keyboard.type('marcus');
      await page.waitForTimeout(400);

      // Screenshot: Searching for a character in dark mode
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-character-search-dark.png'),
        fullPage: false,
      });
      console.log('✓ Captured character search (dark mode)');

      // Select the character result
      const characterResult = page
        .locator('[data-testid="element-ref-result-item"]')
        .filter({ hasText: characterName });
      if (
        await characterResult.isVisible({ timeout: 1000 }).catch(() => false)
      ) {
        await characterResult.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      // Continue typing
      await editor.pressSequentially(
        ' watched from the shadows, his dark cloak blending with the night.',
        { delay: 15 }
      );
      await page.waitForTimeout(300);

      // Screenshot: Character reference in text (dark mode)
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-character-link-dark.png'),
        fullPage: false,
      });
      console.log('✓ Captured character link in text (dark mode)');

      // Hover over the character reference to show tooltip
      const characterRef = page.locator('.element-ref').first();
      if (await characterRef.isVisible().catch(() => false)) {
        await characterRef.hover();
        await page.waitForTimeout(800);

        // Screenshot: Character tooltip with character icon (dark mode)
        await page.screenshot({
          path: join(screenshotsDir, 'element-ref-character-tooltip-dark.png'),
          fullPage: false,
        });
        console.log('✓ Captured character tooltip (dark mode)');
      }
    });
  });

  test.describe('Feature Overview', () => {
    test('capture combined feature showcase', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      const characterName = 'Lyra Silverfall';
      const editor = await setupProjectWithCharacter(
        page,
        'showcase-' + Date.now(),
        'The Crimson Chronicles',
        characterName
      );

      // Type an engaging narrative with @ mention showing
      await editor.pressSequentially(
        'The ancient prophecy spoke of a hero who would rise from the ashes. When ',
        { delay: 10 }
      );

      // Trigger @ popup and search for character
      await page.keyboard.type('@');

      // Wait for popup to fully render
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => console.log('Popup may not be visible'));

      // Type to search for character
      await page.keyboard.type('lyra');
      await page.waitForTimeout(500);

      // Take the final combined screenshot
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-feature.png'),
        fullPage: false,
      });

      console.log('✓ Captured combined feature screenshot');
    });
  });

  test.describe('Tooltip Screenshots', () => {
    test('capture tooltip on hover - light mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const characterName = 'Theron Brightblade';
      const editor = await setupProjectWithCharacter(
        page,
        'tooltip-light-' + Date.now(),
        'Tooltip Demo',
        characterName
      );

      // Create an element reference to the character
      await editor.pressSequentially('The hero met ', { delay: 20 });
      await page.keyboard.type('@');

      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('theron');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(' at the crossroads.', { delay: 20 });
      await page.waitForTimeout(300);

      // Find the element reference
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible();

      // Hover over the element ref to trigger the rich tooltip component
      await elementRef.hover();

      // Wait for the rich Angular tooltip component to appear
      const tooltip = page.locator('.element-ref-tooltip');
      await expect(tooltip).toBeVisible({ timeout: 2000 });
      await page.waitForTimeout(200);

      // Screenshot with rich tooltip visible
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-tooltip-light.png'),
        fullPage: false,
      });
      console.log('✓ Captured rich tooltip screenshot (light mode)');
    });

    test('capture tooltip on hover - dark mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const characterName = 'Vesper Nightingale';
      const editor = await setupProjectWithCharacter(
        page,
        'tooltip-dark-' + Date.now(),
        'Dark Tooltip Demo',
        characterName
      );

      // Enable dark mode
      await enableDarkMode(page);
      await page.waitForTimeout(300);

      // Create an element reference to the character
      await editor.pressSequentially('The shadows spoke of ', { delay: 20 });
      await page.keyboard.type('@');

      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('vesper');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(' in whispered tales.', { delay: 20 });
      await page.waitForTimeout(300);

      // Find the element reference
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible();

      // Hover over the element ref to trigger the rich tooltip component
      await elementRef.hover();

      // Wait for the rich Angular tooltip component to appear
      const tooltip = page.locator('.element-ref-tooltip');
      await expect(tooltip).toBeVisible({ timeout: 2000 });
      await page.waitForTimeout(200);

      // Screenshot with rich tooltip visible
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-tooltip-dark.png'),
        fullPage: false,
      });
      console.log('✓ Captured rich tooltip screenshot (dark mode)');
    });
  });

  test.describe('Context Menu Screenshots', () => {
    test('capture context menu - light mode', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const characterName = 'Orion Starkeeper';
      const editor = await setupProjectWithCharacter(
        page,
        'context-light-' + Date.now(),
        'Context Menu Demo',
        characterName
      );

      // Create an element reference to the character
      await editor.pressSequentially('Click on ', { delay: 20 });
      await page.keyboard.type('@');

      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('orion');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(' to see options.', { delay: 20 });
      await page.waitForTimeout(300);

      // Find the element reference and right-click
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible({ timeout: 2000 });
      await elementRef.click({ button: 'right' });

      // Wait for context menu
      const contextMenu = page.locator(
        '[data-testid="element-ref-context-menu"]'
      );
      await expect(contextMenu).toBeVisible({ timeout: 2000 });
      await page.waitForTimeout(200);

      // Screenshot with context menu open
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-context-menu-light.png'),
        fullPage: false,
      });
      console.log('✓ Captured context menu screenshot (light mode)');
    });

    test('capture context menu - dark mode', async ({ offlinePage: page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const characterName = 'Raven Darkholme';
      const editor = await setupProjectWithCharacter(
        page,
        'context-dark-' + Date.now(),
        'Dark Context Demo',
        characterName
      );

      // Enable dark mode
      await enableDarkMode(page);
      await page.waitForTimeout(300);

      // Create an element reference to the character
      await editor.pressSequentially('Right-click ', { delay: 20 });
      await page.keyboard.type('@');

      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('raven');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(' for more actions.', { delay: 20 });
      await page.waitForTimeout(300);

      // Find the element reference and right-click
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible({ timeout: 2000 });
      await elementRef.click({ button: 'right' });

      // Wait for context menu
      const contextMenu = page.locator(
        '[data-testid="element-ref-context-menu"]'
      );
      await expect(contextMenu).toBeVisible({ timeout: 2000 });
      await page.waitForTimeout(200);

      // Screenshot with context menu open
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-context-menu-dark.png'),
        fullPage: false,
      });
      console.log('✓ Captured context menu screenshot (dark mode)');
    });

    test('capture context menu edit mode - light mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const characterName = 'Sage Thornwood';
      const editor = await setupProjectWithCharacter(
        page,
        'edit-light-' + Date.now(),
        'Edit Mode Demo',
        characterName
      );

      // Create an element reference to the character
      await editor.pressSequentially('Edit the name of ', { delay: 20 });
      await page.keyboard.type('@');

      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
          timeout: 3000,
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('sage');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible({ timeout: 1000 }).catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(' here.', { delay: 20 });
      await page.waitForTimeout(300);

      // Find the element reference and right-click
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible({ timeout: 2000 });
      await elementRef.click({ button: 'right' });

      // Wait for context menu
      const contextMenu = page.locator(
        '[data-testid="element-ref-context-menu"]'
      );
      await expect(contextMenu).toBeVisible({ timeout: 2000 });

      // Click edit button
      const editBtn = page.locator('[data-testid="context-menu-edit"]');
      await editBtn.click();

      // Wait for edit input
      const editInput = page.locator('[data-testid="context-menu-edit-input"]');
      await expect(editInput).toBeVisible({ timeout: 1000 });
      await page.waitForTimeout(200);

      // Screenshot with edit mode open
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-edit-mode-light.png'),
        fullPage: false,
      });
      console.log('✓ Captured edit mode screenshot (light mode)');
    });
  });
});
