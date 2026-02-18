/**
 * Element Reference Screenshot Tests
 *
 * Captures comprehensive screenshots demonstrating the @ mention feature:
 * - Full e2e flow: typing @, searching, selecting, final result
 * - Tooltip on hover
 * - Both light and dark mode variants
 *
 * Screenshots are cropped to show only the relevant UI elements with padding
 * for cleaner documentation images.
 */

import { Page } from '@playwright/test';
import { join } from 'path';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

test.describe('Element Reference Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  /**
   * Helper to create a project and navigate to editor
   */
  async function setupProjectAndEditor(
    page: Page,
    projectSlug: string,
    projectTitle: string
  ) {
    // Navigate to root
    await page.goto('/');

    // Wait for the empty state and create a project
    await page.waitForSelector('.empty-state', {
      state: 'visible',
    });

    // Create project using worldbuilding-demo template for rich content
    await createProjectWithTwoSteps(
      page,
      projectTitle,
      projectSlug,
      undefined,
      'worldbuilding-demo'
    );

    // Wait for project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });

    // Expand the "Chronicles" folder (from worldbuilding-demo template)
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.locator('text="The Moonveil Accord"').first().waitFor({
        state: 'visible',
      });
    }

    // Click on "The Moonveil Accord" to open it
    await page.click('text="The Moonveil Accord"').catch(() => {
      return page.locator('.tree-node-item').first().click();
    });

    // Wait for editor to load and click into it
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible' });
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
    });

    // Create project using worldbuilding-demo template for rich content
    await createProjectWithTwoSteps(
      page,
      projectTitle,
      projectSlug,
      undefined,
      'worldbuilding-demo'
    );

    // Wait for project tree to be visible
    await page.waitForSelector('app-project-tree', {
      state: 'visible',
    });

    // Create a character element at the root level
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-character-v1').click();
    await page.getByTestId('element-name-input').fill(characterName);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });
    await page
      .locator(`[data-testid="element-${characterName}"]`)
      .first()
      .waitFor({ state: 'visible' });

    // Expand the "Chronicles" folder to access The Moonveil Accord
    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page.locator('text="The Moonveil Accord"').first().waitFor({
        state: 'visible',
      });
    }

    // Click on "The Moonveil Accord" to open it
    await page.click('text="The Moonveil Accord"').catch(() => {
      return page.locator('.tree-node-item').first().click();
    });

    // Wait for editor to load and click into it
    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible' });
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

    if (await themeToggle.isVisible().catch(() => false)) {
      await themeToggle.click();
      await page.waitForFunction(() => {
        return (
          document.body.classList.contains('dark-theme') ||
          document.documentElement.classList.contains('dark-theme')
        );
      });
    } else {
      // Fallback: add dark-theme class directly to body
      await page.evaluate(() => {
        document.body.classList.add('dark-theme');
        document.documentElement.classList.add('dark-theme');
      });
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

      // Wait for the popup to appear and initial results to populate
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
        });
      await page
        .locator('[data-testid="element-ref-result-item"]')
        .first()
        .waitFor({ state: 'visible' });

      // Screenshot 1: Popup just opened (showing all elements)
      // Crop to show editor area with popup
      await captureElementScreenshot(
        page,
        [editor, page.locator('[data-testid="element-ref-popup"]')],
        join(screenshotsDir, 'element-ref-01-popup-light.png'),
        32
      );

      // Step 3: Type search query - 'el' matches Elara Nightwhisper, Silverhollow
      await page.keyboard.type('el');
      await page
        .locator('[data-testid="element-ref-result-item"]')
        .first()
        .waitFor({ state: 'visible' });

      // Screenshot 2: Search in progress
      await captureElementScreenshot(
        page,
        [editor, page.locator('[data-testid="element-ref-popup"]')],
        join(screenshotsDir, 'element-ref-02-search-light.png'),
        32
      );

      // Step 4: Select the first result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
        await resultItem.click();
      } else {
        // Press Enter to select first result
        await page.keyboard.press('Enter');
      }
      await page
        .locator('[data-testid="element-ref-popup"]')
        .waitFor({ state: 'hidden' })
        .catch(() => {});

      // Continue typing after the reference
      await editor.pressSequentially(' at the crossroads.', { delay: 20 });

      // Screenshot 3: Link in document
      await captureElementScreenshot(
        page,
        [editor],
        join(screenshotsDir, 'element-ref-03-link-light.png'),
        32
      );

      // Step 5: Hover over the link to show tooltip
      const elementRef = page.locator('.element-ref').first();
      if (await elementRef.isVisible().catch(() => false)) {
        await elementRef.hover();
        await page
          .locator('.element-ref-tooltip')
          .waitFor({ state: 'visible' });

        // Screenshot 4: Tooltip visible
        await captureElementScreenshot(
          page,
          [elementRef, page.locator('.element-ref-tooltip')],
          join(screenshotsDir, 'element-ref-04-tooltip-light.png'),
          24
        );
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
        })
        .catch(() => {});

      // Type to search for the character
      await page.keyboard.type('aria');
      await page
        .locator('[data-testid="element-ref-result-item"]')
        .first()
        .waitFor({ state: 'visible' });

      // Select the character result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page
        .locator('[data-testid="element-ref-popup"]')
        .waitFor({ state: 'hidden' })
        .catch(() => {});

      // Continue typing
      await editor.pressSequentially(
        ' appeared, the world knew that destiny had arrived.',
        { delay: 15 }
      );

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
        })
        .catch(() => {});

      // Search for Elena
      await page.keyboard.type('elena');
      await page
        .locator('[data-testid="element-ref-result-item"]')
        .first()
        .waitFor({ state: 'visible' });

      // Screenshot: Searching for a character
      await captureElementScreenshot(
        page,
        [editor, page.locator('[data-testid="element-ref-popup"]')],
        join(screenshotsDir, 'element-ref-character-search-light.png'),
        32
      );

      // Select the character result
      const characterResult = page
        .locator('[data-testid="element-ref-result-item"]')
        .filter({ hasText: characterName });
      if (await characterResult.isVisible().catch(() => false)) {
        await characterResult.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page
        .locator('[data-testid="element-ref-popup"]')
        .waitFor({ state: 'hidden' })
        .catch(() => {});

      // Continue typing
      await editor.pressSequentially(
        ' stepped out of the ancient tower, her silver cloak billowing in the wind.',
        { delay: 15 }
      );

      // Screenshot: Character reference in text
      await captureElementScreenshot(
        page,
        [editor],
        join(screenshotsDir, 'element-ref-character-link-light.png'),
        32
      );

      // Hover over the character reference to show tooltip
      const characterRef = page.locator('.element-ref').first();
      if (await characterRef.isVisible().catch(() => false)) {
        await characterRef.hover();
        await page
          .locator('.element-ref-tooltip')
          .waitFor({ state: 'visible' });

        // Screenshot: Character tooltip with character icon
        await captureElementScreenshot(
          page,
          [characterRef, page.locator('.element-ref-tooltip')],
          join(screenshotsDir, 'element-ref-character-tooltip-light.png'),
          24
        );
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

      // Step 1: Type some content before the @ mention
      await editor.pressSequentially('The shadows whispered of ', {
        delay: 20,
      });

      // Step 2: Type @ to trigger the popup
      await page.keyboard.type('@');

      // Wait for the popup to appear and initial results to populate
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
        });
      await page
        .locator('[data-testid="element-ref-result-item"]')
        .first()
        .waitFor({ state: 'visible' });

      // Screenshot 1: Popup just opened (dark mode)
      await captureElementScreenshot(
        page,
        [editor, page.locator('[data-testid="element-ref-popup"]')],
        join(screenshotsDir, 'element-ref-01-popup-dark.png'),
        32
      );

      // Step 3: Type search query - 'el' matches Elara Nightwhisper, Silverhollow
      await page.keyboard.type('el');
      await page
        .locator('[data-testid="element-ref-result-item"]')
        .first()
        .waitFor({ state: 'visible' });

      // Screenshot 2: Search in progress (dark mode)
      await captureElementScreenshot(
        page,
        [editor, page.locator('[data-testid="element-ref-popup"]')],
        join(screenshotsDir, 'element-ref-02-search-dark.png'),
        32
      );

      // Step 4: Select the first result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      // Continue typing after the reference
      await editor.pressSequentially(' in the moonlight.', { delay: 20 });
      await page.waitForTimeout(300);

      // Screenshot 3: Link in document (dark mode)
      await captureElementScreenshot(
        page,
        [editor],
        join(screenshotsDir, 'element-ref-03-link-dark.png'),
        32
      );

      // Step 5: Hover over the link to show tooltip
      const elementRef = page.locator('.element-ref').first();
      if (await elementRef.isVisible().catch(() => false)) {
        await elementRef.hover();
        await page.waitForTimeout(800);

        // Screenshot 4: Tooltip visible (dark mode)
        await captureElementScreenshot(
          page,
          [elementRef, page.locator('.element-ref-tooltip')],
          join(screenshotsDir, 'element-ref-04-tooltip-dark.png'),
          24
        );
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
        })
        .catch(() => {});

      // Type to search for the character
      await page.keyboard.type('kira');
      await page.waitForTimeout(300);

      // Select the character result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
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
        })
        .catch(() => {});

      // Search for Marcus
      await page.keyboard.type('marcus');
      await page.waitForTimeout(400);

      // Screenshot: Searching for a character in dark mode
      await captureElementScreenshot(
        page,
        [editor, page.locator('[data-testid="element-ref-popup"]')],
        join(screenshotsDir, 'element-ref-character-search-dark.png'),
        32
      );

      // Select the character result
      const characterResult = page
        .locator('[data-testid="element-ref-result-item"]')
        .filter({ hasText: characterName });
      if (await characterResult.isVisible().catch(() => false)) {
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
      await captureElementScreenshot(
        page,
        [editor],
        join(screenshotsDir, 'element-ref-character-link-dark.png'),
        32
      );

      // Hover over the character reference to show tooltip
      const characterRef = page.locator('.element-ref').first();
      if (await characterRef.isVisible().catch(() => false)) {
        await characterRef.hover();
        await page.waitForTimeout(800);

        // Screenshot: Character tooltip with character icon (dark mode)
        await captureElementScreenshot(
          page,
          [characterRef, page.locator('.element-ref-tooltip')],
          join(screenshotsDir, 'element-ref-character-tooltip-dark.png'),
          24
        );
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
        })
        .catch(() => {});

      // Type to search for character
      await page.keyboard.type('lyra');
      await page.waitForTimeout(500);

      // Take the final combined screenshot
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-feature.png'),
        fullPage: false,
      });
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
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('theron');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
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
      await expect(tooltip).toBeVisible();
      await page.waitForTimeout(200);

      // Screenshot with rich tooltip visible
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-tooltip-light.png'),
        fullPage: false,
      });
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
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('vesper');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
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
      await expect(tooltip).toBeVisible();
      await page.waitForTimeout(200);

      // Screenshot with rich tooltip visible
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-tooltip-dark.png'),
        fullPage: false,
      });
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
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('orion');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(' to see options.', { delay: 20 });
      await page.waitForTimeout(300);

      // Find the element reference and right-click
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible();
      await elementRef.click({ button: 'right' });

      // Wait for context menu
      const contextMenu = page.locator(
        '[data-testid="element-ref-context-menu"]'
      );
      await expect(contextMenu).toBeVisible();
      await page.waitForTimeout(200);

      // Screenshot with context menu open
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-context-menu-light.png'),
        fullPage: false,
      });
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
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('raven');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(' for more actions.', { delay: 20 });
      await page.waitForTimeout(300);

      // Find the element reference and right-click
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible();
      await elementRef.click({ button: 'right' });

      // Wait for context menu
      const contextMenu = page.locator(
        '[data-testid="element-ref-context-menu"]'
      );
      await expect(contextMenu).toBeVisible();
      await page.waitForTimeout(200);

      // Screenshot with context menu open
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-context-menu-dark.png'),
        fullPage: false,
      });
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
        })
        .catch(() => {});

      // Search for and select the character
      await page.keyboard.type('sage');
      await page.waitForTimeout(300);

      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(' here.', { delay: 20 });
      await page.waitForTimeout(300);

      // Find the element reference and right-click
      const elementRef = page.locator('.element-ref').first();
      await expect(elementRef).toBeVisible();
      await elementRef.click({ button: 'right' });

      // Wait for context menu
      const contextMenu = page.locator(
        '[data-testid="element-ref-context-menu"]'
      );
      await expect(contextMenu).toBeVisible();

      // Click edit button
      const editBtn = page.locator('[data-testid="context-menu-edit"]');
      await editBtn.click();

      // Wait for edit input
      const editInput = page.locator('[data-testid="context-menu-edit-input"]');
      await expect(editInput).toBeVisible();
      await page.waitForTimeout(200);

      // Screenshot with edit mode open
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-edit-mode-light.png'),
        fullPage: false,
      });
    });
  });

  test.describe('Backlinks/Inverse Relationships Screenshots', () => {
    test('capture character backlinks from story references - light mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      const characterName = 'Elara Moonwhisper';
      const projectSlug = 'backlinks-light-' + Date.now();
      const editor = await setupProjectWithCharacter(
        page,
        projectSlug,
        'The Silver Saga',
        characterName
      );

      // Create a reference to the character in Chapter 1
      await editor.pressSequentially('In the beginning, there was ', {
        delay: 15,
      });

      // Trigger @ and search for the character
      await page.keyboard.type('@');
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
        })
        .catch(() => {});

      await page.keyboard.type('elara');
      await page.waitForTimeout(400);

      // Select the character result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(', the keeper of ancient secrets.', {
        delay: 15,
      });
      await page.waitForTimeout(500);

      // Now navigate to the character to see the backlink
      // Click on the character in the project tree (using treeitem role selector)
      const characterNode = page.getByRole('treeitem', {
        name: characterName,
      });
      await characterNode.click();
      await page.waitForTimeout(500);

      // Wait for worldbuilding editor to load
      await page
        .waitForSelector('[data-testid="worldbuilding-editor"]', {
          state: 'visible',
        })
        .catch(() => {});

      // Open the meta panel to see relationships
      const metaPanelToggle = page.locator('[data-testid="meta-panel-toggle"]');
      if (await metaPanelToggle.isVisible().catch(() => false)) {
        await metaPanelToggle.click();
        await page.waitForTimeout(400);
      }

      // Expand the relationships section if needed
      const relationshipsSection = page.locator(
        '[data-testid="relationships-section"]'
      );
      if (await relationshipsSection.isVisible().catch(() => false)) {
        await relationshipsSection.click();
        await page.waitForTimeout(300);
      }

      // Wait for relationships to load
      await page.waitForTimeout(500);

      // Screenshot: Full page showing worldbuilding editor with backlinks panel
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-backlinks-character-light.png'),
        fullPage: false,
      });

      // Capture a focused view of the worldbuilding editor container with meta panel
      const worldbuildingContainer = page.locator(
        '.worldbuilding-editor-container'
      );
      if (await worldbuildingContainer.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [worldbuildingContainer],
          join(screenshotsDir, 'element-ref-backlinks-worldbuilding-light.png'),
          16
        );
      }

      // Also capture a cropped version focusing on just the meta panel
      const metaPanel = page.locator('app-meta-panel');
      if (await metaPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [metaPanel],
          join(screenshotsDir, 'element-ref-backlinks-panel-light.png'),
          16
        );
      }
    });

    test('capture character backlinks from story references - dark mode', async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      const characterName = 'Kael Shadowmere';
      const projectSlug = 'backlinks-dark-' + Date.now();
      const editor = await setupProjectWithCharacter(
        page,
        projectSlug,
        'Chronicles of Darkness',
        characterName
      );

      // Enable dark mode
      await enableDarkMode(page);
      await page.waitForTimeout(300);

      // Create a reference to the character in Chapter 1
      await editor.pressSequentially('The darkness spoke through ', {
        delay: 15,
      });

      // Trigger @ and search for the character
      await page.keyboard.type('@');
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
        })
        .catch(() => {});

      await page.keyboard.type('kael');
      await page.waitForTimeout(400);

      // Select the character result
      const resultItem = page
        .locator('[data-testid="element-ref-result-item"]')
        .first();
      if (await resultItem.isVisible().catch(() => false)) {
        await resultItem.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(300);

      await editor.pressSequentially(', the harbinger of twilight.', {
        delay: 15,
      });
      await page.waitForTimeout(500);

      // Now navigate to the character to see the backlink
      // Click on the character in the project tree (using treeitem role selector)
      const characterNode = page.getByRole('treeitem', {
        name: characterName,
      });
      await characterNode.click();
      await page.waitForTimeout(500);

      // Wait for worldbuilding editor to load
      await page
        .waitForSelector('[data-testid="worldbuilding-editor"]', {
          state: 'visible',
        })
        .catch(() => {});

      // Open the meta panel to see relationships
      const metaPanelToggle = page.locator('[data-testid="meta-panel-toggle"]');
      if (await metaPanelToggle.isVisible().catch(() => false)) {
        await metaPanelToggle.click();
        await page.waitForTimeout(400);
      }

      // Expand the relationships section if needed
      const relationshipsSection = page.locator(
        '[data-testid="relationships-section"]'
      );
      if (await relationshipsSection.isVisible().catch(() => false)) {
        await relationshipsSection.click();
        await page.waitForTimeout(300);
      }

      // Wait for relationships to load
      await page.waitForTimeout(500);

      // Screenshot: Full page showing worldbuilding editor with backlinks panel (dark mode)
      await page.screenshot({
        path: join(screenshotsDir, 'element-ref-backlinks-character-dark.png'),
        fullPage: false,
      });

      // Capture a focused view of the worldbuilding editor container with meta panel
      const worldbuildingContainer = page.locator(
        '.worldbuilding-editor-container'
      );
      if (await worldbuildingContainer.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [worldbuildingContainer],
          join(screenshotsDir, 'element-ref-backlinks-worldbuilding-dark.png'),
          16
        );
      }

      // Also capture a cropped version focusing on just the meta panel
      const metaPanel = page.locator('app-meta-panel');
      if (await metaPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [metaPanel],
          join(screenshotsDir, 'element-ref-backlinks-panel-dark.png'),
          16
        );
      }
    });
  });
});
