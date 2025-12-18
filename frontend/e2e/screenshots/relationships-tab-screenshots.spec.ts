/**
 * Relationships Tab Screenshot Tests
 *
 * Captures comprehensive screenshots demonstrating the relationship types management feature:
 * - Full list view with built-in and custom types
 * - Create custom type flow
 * - Edit and delete operations
 * - Type details and constraints
 *
 * Screenshots are cropped to show only the relevant UI elements with padding
 * for cleaner documentation images.
 */

import { Locator, Page } from '@playwright/test';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';

import { test } from './fixtures';

/**
 * Helper to capture a cropped screenshot around specific elements with padding
 */
async function captureElementScreenshot(
  page: Page,
  elements: Locator[],
  path: string,
  padding = 24
): Promise<void> {
  const boxes: { x: number; y: number; width: number; height: number }[] = [];

  for (const element of elements) {
    if (await element.isVisible().catch(() => false)) {
      const box = await element.boundingBox();
      if (box) {
        boxes.push(box);
      }
    }
  }

  if (boxes.length === 0) {
    await page.screenshot({ path, fullPage: false });
    return;
  }

  const minX = Math.max(0, Math.min(...boxes.map(b => b.x)) - padding);
  const minY = Math.max(0, Math.min(...boxes.map(b => b.y)) - padding);
  const maxX = Math.max(...boxes.map(b => b.x + b.width)) + padding;
  const maxY = Math.max(...boxes.map(b => b.y + b.height)) + padding;

  const viewport = page.viewportSize();
  const clipWidth = Math.min(maxX - minX, (viewport?.width || 1280) - minX);
  const clipHeight = Math.min(maxY - minY, (viewport?.height || 800) - minY);

  await page.screenshot({
    path,
    clip: {
      x: minX,
      y: minY,
      width: clipWidth,
      height: clipHeight,
    },
  });
}

test.describe('Relationships Tab Screenshots', () => {
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
    if (!existsSync(screenshotsDir)) {
      await mkdir(screenshotsDir, { recursive: true });
    }
  });

  /**
   * Helper to create a project and navigate to relationships tab
   */
  async function setupProjectAndRelationshipsTab(
    page: Page,
    projectSlug: string,
    projectTitle: string
  ) {
    await page.goto('/');

    await page.waitForSelector('.empty-state', {
      state: 'visible',
      timeout: 5000,
    });

    await page.click('button:has-text("Create Project")');

    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    await page.fill('input[data-testid="project-title-input"]', projectTitle);
    await page.fill('input[data-testid="project-slug-input"]', projectSlug);

    await page.click('button[type="submit"]');

    await page.waitForURL(new RegExp(`/demouser/${projectSlug}`), {
      timeout: 5000,
    });

    // Navigate to relationships tab
    await page.goto(`/demouser/${projectSlug}/relationships-list`);
    await page.waitForSelector('.relationships-tab-container', {
      state: 'visible',
      timeout: 5000,
    });
    await page.waitForTimeout(500);
  }

  test.describe('Light Mode Screenshots', () => {
    test('relationships tab overview', async ({ offlinePage: page }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-overview-light',
        'Relationship Types Demo'
      );

      // Wait for types to load
      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
        timeout: 5000,
      });
      await page.waitForTimeout(300);

      // Capture full tab view
      await page.screenshot({
        path: join(screenshotsDir, 'relationships-tab-overview-light.png'),
        fullPage: false,
      });
    });

    test('built-in types section', async ({ offlinePage: page }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-builtin-light',
        'Built-in Types Demo'
      );

      await page.waitForSelector('.type-card.built-in', {
        state: 'visible',
        timeout: 5000,
      });
      await page.waitForTimeout(300);

      // Capture just the built-in types section
      const builtInSection = page.locator(
        '.section:has(.section-title:has-text("Built-in Types"))'
      );

      await captureElementScreenshot(
        page,
        [builtInSection],
        join(screenshotsDir, 'relationships-builtin-types-light.png'),
        16
      );
    });

    test('create custom type flow', async ({ offlinePage: page }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-create-light',
        'Create Type Demo'
      );

      // Click create button
      await page.click('[data-testid="create-type-button"]');
      await page.waitForSelector('app-rename-dialog', {
        state: 'visible',
        timeout: 3000,
      });
      await page.waitForTimeout(200);

      // Type a name
      await page.fill('[data-testid="rename-input"]', 'Nemesis of');

      // Screenshot of the dialog
      await captureElementScreenshot(
        page,
        [page.locator('app-rename-dialog')],
        join(screenshotsDir, 'relationships-create-dialog-light.png'),
        32
      );

      // Cancel the dialog (since offline mode doesn't persist custom types)
      await page.click('app-rename-dialog button:has-text("Cancel")');
    });

    test('type card details', async ({ offlinePage: page }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-details-light',
        'Type Details Demo'
      );

      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
        timeout: 5000,
      });
      await page.waitForTimeout(300);

      // Find a card with good details (Parent type has constraints)
      const parentCard = page.locator(
        '.type-card:has(mat-card-title:has-text("Parent"))'
      );

      if (await parentCard.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [parentCard],
          join(screenshotsDir, 'relationships-card-details-light.png'),
          16
        );
      } else {
        // Fallback to first card
        await captureElementScreenshot(
          page,
          [page.locator('[data-testid="relationship-type-card"]').first()],
          join(screenshotsDir, 'relationships-card-details-light.png'),
          16
        );
      }
    });

    test('type action menu', async ({ offlinePage: page }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-menu-light',
        'Action Menu Demo'
      );

      await page.waitForSelector('.type-card.built-in', {
        state: 'visible',
        timeout: 5000,
      });
      await page.waitForTimeout(300);

      // Open the menu on a built-in type to show clone option
      const builtInCard = page.locator('.type-card.built-in').first();
      await builtInCard.locator('button[mat-icon-button]').click();
      await page.waitForTimeout(200);

      // Screenshot with menu open
      await captureElementScreenshot(
        page,
        [builtInCard, page.locator('.mat-mdc-menu-panel')],
        join(screenshotsDir, 'relationships-action-menu-light.png'),
        24
      );
    });
  });

  test.describe('Dark Mode Screenshots', () => {
    test('relationships tab overview dark', async ({ offlinePage: page }) => {
      // Set dark mode via media emulation (same approach as pwa-screenshots.spec.ts)
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectAndRelationshipsTab(
        page,
        'rel-overview-dark',
        'Relationship Types Demo'
      );

      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
        timeout: 5000,
      });

      await page.screenshot({
        path: join(screenshotsDir, 'relationships-tab-overview-dark.png'),
        fullPage: false,
      });
    });

    test('built-in types section dark', async ({ offlinePage: page }) => {
      // Set dark mode via media emulation
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectAndRelationshipsTab(
        page,
        'rel-builtin-dark',
        'Built-in Types Demo'
      );

      await page.waitForSelector('.type-card.built-in', {
        state: 'visible',
        timeout: 5000,
      });

      const builtInSection = page.locator(
        '.section:has(.section-title:has-text("Built-in Types"))'
      );

      await captureElementScreenshot(
        page,
        [builtInSection],
        join(screenshotsDir, 'relationships-builtin-types-dark.png'),
        16
      );
    });

    test('type card dark', async ({ offlinePage: page }) => {
      // Set dark mode via media emulation
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectAndRelationshipsTab(
        page,
        'rel-card-dark',
        'Type Card Demo'
      );

      await page.waitForSelector('.type-card.built-in', {
        state: 'visible',
        timeout: 5000,
      });

      // Screenshot of a built-in type card in dark mode
      const parentCard = page.locator(
        '.type-card:has(mat-card-title:has-text("Parent"))'
      );

      if (await parentCard.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [parentCard],
          join(screenshotsDir, 'relationships-type-card-dark.png'),
          16
        );
      } else {
        await captureElementScreenshot(
          page,
          [page.locator('.type-card.built-in').first()],
          join(screenshotsDir, 'relationships-type-card-dark.png'),
          16
        );
      }
    });
  });

  test.describe('Feature Showcase', () => {
    test('complete relationships overview for docs', async ({
      offlinePage: page,
    }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-showcase',
        'Creative Writing Project'
      );

      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
        timeout: 5000,
      });
      await page.waitForTimeout(500);

      // Full page screenshot for documentation hero image
      await page.screenshot({
        path: join(screenshotsDir, 'relationships-feature-showcase.png'),
        fullPage: false,
      });

      // Cropped version focusing on the types grid
      const typesContainer = page.locator('.relationships-tab-container');
      await captureElementScreenshot(
        page,
        [typesContainer],
        join(screenshotsDir, 'relationships-types-grid.png'),
        8
      );
    });
  });

  test.describe('Character Relationships Panel', () => {
    /**
     * Helper to create a project with multiple characters
     */
    async function setupProjectWithCharacters(
      page: Page,
      projectSlug: string,
      projectTitle: string,
      characters: string[]
    ): Promise<void> {
      await page.goto('/');

      await page.waitForSelector('.empty-state', {
        state: 'visible',
        timeout: 5000,
      });

      await page.click('button:has-text("Create Project")');

      await page.waitForSelector('input[data-testid="project-title-input"]', {
        state: 'visible',
        timeout: 3000,
      });

      await page.fill('input[data-testid="project-title-input"]', projectTitle);
      await page.fill('input[data-testid="project-slug-input"]', projectSlug);

      await page.click('button[type="submit"]');

      await page.waitForURL(new RegExp(`/demouser/${projectSlug}`), {
        timeout: 5000,
      });

      // Wait for project tree to be visible
      await page.waitForSelector('app-project-tree', {
        state: 'visible',
        timeout: 3000,
      });
      await page.waitForTimeout(500);

      // Create each character
      for (const charName of characters) {
        await page.getByTestId('create-new-element').click();
        await page.getByTestId('element-type-character').click();
        await page.getByTestId('element-name-input').fill(charName);
        await page.getByTestId('create-element-button').click();
        await page.waitForTimeout(400);
      }
    }

    /**
     * Helper to open a character and show the relationships panel
     */
    async function openCharacterAndShowRelationships(
      page: Page,
      characterName: string
    ): Promise<void> {
      // Click on the character in the project tree
      await page.click(`text="${characterName}"`);
      await page.waitForTimeout(500);

      // Ensure the meta panel is open (relationships are in meta panel)
      const metaPanelToggle = page.getByTestId('meta-panel-toggle');
      if (await metaPanelToggle.isVisible().catch(() => false)) {
        const metaPanel = page.locator('.meta-panel');
        if (!(await metaPanel.isVisible().catch(() => false))) {
          await metaPanelToggle.click();
          await page.waitForTimeout(300);
        }
      }

      // Expand the relationships section if not already expanded
      const relationshipsSection = page.getByTestId('relationships-section');
      if (await relationshipsSection.isVisible().catch(() => false)) {
        const isExpanded = await relationshipsSection
          .locator('.mat-expansion-panel-header')
          .getAttribute('aria-expanded');
        if (isExpanded !== 'true') {
          await relationshipsSection
            .locator('.mat-expansion-panel-header')
            .click();
          await page.waitForTimeout(300);
        }
      }
    }

    test('character with relationships panel - light mode', async ({
      offlinePage: page,
    }) => {
      // Create project with characters
      await setupProjectWithCharacters(
        page,
        'char-rel-light',
        'Fantasy Novel',
        ['Elena Blackwood', 'Marcus Sterling', 'Lord Aldric', 'Sarah Chen']
      );

      // Open first character and show relationships panel
      await openCharacterAndShowRelationships(page, 'Elena Blackwood');
      await page.waitForTimeout(500);

      // Screenshot of the relationships panel (empty state)
      const relationshipsPanel = page.locator('.relationships-panel');
      if (await relationshipsPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [relationshipsPanel],
          join(screenshotsDir, 'character-relationships-panel-light.png'),
          16
        );
      }

      // Full page screenshot showing character editor with relationships panel
      await page.screenshot({
        path: join(
          screenshotsDir,
          'character-relationships-overview-light.png'
        ),
        fullPage: false,
      });
    });

    test('character with relationships panel - dark mode', async ({
      offlinePage: page,
    }) => {
      // Set dark mode
      await page.emulateMedia({ colorScheme: 'dark' });

      // Create project with characters
      await setupProjectWithCharacters(
        page,
        'char-rel-dark',
        'Fantasy Novel Dark',
        ['Elena Blackwood', 'Marcus Sterling', 'Lord Aldric']
      );

      // Open first character
      await openCharacterAndShowRelationships(page, 'Elena Blackwood');
      await page.waitForTimeout(500);

      // Screenshot of the relationships panel in dark mode
      const relationshipsPanel = page.locator('.relationships-panel');
      if (await relationshipsPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [relationshipsPanel],
          join(screenshotsDir, 'character-relationships-panel-dark.png'),
          16
        );
      }

      // Full page screenshot
      await page.screenshot({
        path: join(screenshotsDir, 'character-relationships-overview-dark.png'),
        fullPage: false,
      });
    });

    test('add relationship dialog', async ({ offlinePage: page }) => {
      // Create project with characters
      await setupProjectWithCharacters(page, 'add-rel-dialog', 'Dialog Demo', [
        'Hero',
        'Mentor',
        'Villain',
      ]);

      // Open character
      await openCharacterAndShowRelationships(page, 'Hero');
      await page.waitForTimeout(500);

      // Open the add relationship dialog
      const addButton = page.getByTestId('add-relationship-button');
      if (await addButton.isVisible().catch(() => false)) {
        await addButton.click();
        await page.waitForTimeout(500);

        // Screenshot of the dialog
        const dialog = page.locator('mat-dialog-container');
        if (await dialog.isVisible().catch(() => false)) {
          await captureElementScreenshot(
            page,
            [dialog],
            join(screenshotsDir, 'add-relationship-dialog-light.png'),
            32
          );
        }

        // Close the dialog
        await page
          .locator('button:has-text("Cancel")')
          .click()
          .catch(() => page.keyboard.press('Escape'));
      }
    });

    test('add relationship dialog - dark mode', async ({
      offlinePage: page,
    }) => {
      // Set dark mode
      await page.emulateMedia({ colorScheme: 'dark' });

      // Create project with characters
      await setupProjectWithCharacters(
        page,
        'add-rel-dialog-dark',
        'Dialog Demo Dark',
        ['Hero', 'Mentor', 'Villain']
      );

      // Open character
      await openCharacterAndShowRelationships(page, 'Hero');
      await page.waitForTimeout(500);

      // Open the add relationship dialog
      const addButton = page.getByTestId('add-relationship-button');
      if (await addButton.isVisible().catch(() => false)) {
        await addButton.click();
        await page.waitForTimeout(500);

        // Screenshot of the dialog in dark mode
        const dialog = page.locator('mat-dialog-container');
        if (await dialog.isVisible().catch(() => false)) {
          await captureElementScreenshot(
            page,
            [dialog],
            join(screenshotsDir, 'add-relationship-dialog-dark.png'),
            32
          );
        }

        // Close dialog
        await page
          .locator('button:has-text("Cancel")')
          .click()
          .catch(() => page.keyboard.press('Escape'));
      }
    });

    test('empty relationships state', async ({ offlinePage: page }) => {
      // Create project with just one character (no relationships yet)
      await setupProjectWithCharacters(
        page,
        'empty-rel',
        'Empty Relationships Demo',
        ['Lone Character']
      );

      // Open character
      await openCharacterAndShowRelationships(page, 'Lone Character');
      await page.waitForTimeout(500);

      // Screenshot of empty state
      const relationshipsPanel = page.locator('.relationships-panel');
      if (await relationshipsPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [relationshipsPanel],
          join(screenshotsDir, 'relationships-empty-state-light.png'),
          16
        );
      }
    });

    test('parent-child relationship between characters', async ({
      offlinePage: page,
    }) => {
      // Create project with two characters - a parent and child
      await setupProjectWithCharacters(
        page,
        'parent-child-demo',
        'Family Story',
        ['Lord Aldric Stormwind', 'Elena Stormwind']
      );

      // Open the parent character first
      await page.click('text="Lord Aldric Stormwind"');
      await page.waitForTimeout(500);

      // Ensure the meta panel is open
      const metaPanelToggle = page.getByTestId('meta-panel-toggle');
      if (await metaPanelToggle.isVisible().catch(() => false)) {
        const metaPanel = page.locator('.meta-panel');
        if (!(await metaPanel.isVisible().catch(() => false))) {
          await metaPanelToggle.click();
          await page.waitForTimeout(300);
        }
      }

      // Click "Add Relationship" button (in the meta panel, not in dialog)
      const addButton = page
        .locator('.meta-panel')
        .getByTestId('add-relationship-button');
      await addButton.click();
      await page.waitForTimeout(500);

      // Wait for dialog to appear
      const dialog = page.locator('mat-dialog-container');
      await dialog.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

      if (await dialog.isVisible().catch(() => false)) {
        // Select "Parent" as the relationship type
        const typeSelect = dialog.getByTestId('relationship-type-select');
        if (await typeSelect.isVisible().catch(() => false)) {
          await typeSelect.click();
          await page.waitForTimeout(200);
          await page.click('mat-option:has-text("Parent")');
          await page.waitForTimeout(300);
        }

        // Search for the child character using the autocomplete
        const searchInput = dialog.getByTestId('element-search-input');
        if (await searchInput.isVisible().catch(() => false)) {
          await searchInput.click();
          await searchInput.fill('Elena');
          await page.waitForTimeout(500);

          // Click on the matching option from autocomplete
          const option = page.locator('mat-option:has-text("Elena Stormwind")');
          if (await option.isVisible().catch(() => false)) {
            await option.click();
            await page.waitForTimeout(300);
          }
        }

        // Try to submit - the button inside dialog has same testid but is in the dialog
        const dialogSubmitButton = dialog.locator(
          'button:has-text("Add Relationship")'
        );
        await page.waitForTimeout(200);

        if (await dialogSubmitButton.isEnabled().catch(() => false)) {
          await dialogSubmitButton.click();
          await page.waitForTimeout(500);
        } else {
          // If we couldn't submit, take a screenshot of the dialog state for debugging
          await page.screenshot({
            path: join(screenshotsDir, 'debug-dialog-state.png'),
            fullPage: false,
          });
          // Close dialog
          const cancelButton = dialog.getByTestId('cancel-button');
          await cancelButton.click().catch(() => page.keyboard.press('Escape'));
          await page.waitForTimeout(300);
        }
      }

      // Now take screenshot of the parent's relationships panel
      await page.waitForTimeout(300);

      // Capture the meta panel showing the relationship (if any was created)
      const metaPanel = page.locator('.meta-panel');
      if (await metaPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [metaPanel],
          join(screenshotsDir, 'character-parent-relationship-light.png'),
          16
        );
      }

      // Full page screenshot showing parent with relationship
      await page.screenshot({
        path: join(screenshotsDir, 'character-parent-overview-light.png'),
        fullPage: false,
      });

      // Now switch to the child character to see the incoming relationship (if created)
      await page.click('text="Elena Stormwind"');
      await page.waitForTimeout(500);

      // The child should show "Child of" relationship (backlink) if relationship was created
      const childMetaPanel = page.locator('.meta-panel');
      if (await childMetaPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [childMetaPanel],
          join(screenshotsDir, 'character-child-relationship-light.png'),
          16
        );
      }

      // Full page screenshot of child showing backlink
      await page.screenshot({
        path: join(screenshotsDir, 'character-child-overview-light.png'),
        fullPage: false,
      });
    });

    test('multiple relationship types on one character', async ({
      offlinePage: page,
    }) => {
      // Create a project with several characters for complex relationships
      await setupProjectWithCharacters(
        page,
        'multi-rel-demo',
        'Complex Relationships',
        ['Hero Knight', 'Wise Mentor', 'Dark Villain', 'Loyal Friend']
      );

      // Open the Hero character
      await page.click('text="Hero Knight"');
      await page.waitForTimeout(500);

      // Ensure the meta panel is open
      const metaPanelToggle = page.getByTestId('meta-panel-toggle');
      if (await metaPanelToggle.isVisible().catch(() => false)) {
        const metaPanel = page.locator('.meta-panel');
        if (!(await metaPanel.isVisible().catch(() => false))) {
          await metaPanelToggle.click();
          await page.waitForTimeout(300);
        }
      }

      // Helper to add a relationship
      async function addRelationship(
        typeName: string,
        targetName: string
      ): Promise<boolean> {
        // Click "Add Relationship" button
        const addButton = page
          .locator('.meta-panel')
          .getByTestId('add-relationship-button');
        await addButton.click();
        await page.waitForTimeout(400);

        const dialog = page.locator('mat-dialog-container');
        await dialog
          .waitFor({ state: 'visible', timeout: 3000 })
          .catch(() => {});

        if (!(await dialog.isVisible().catch(() => false))) {
          return false;
        }

        // Select relationship type
        const typeSelect = dialog.getByTestId('relationship-type-select');
        if (await typeSelect.isVisible().catch(() => false)) {
          await typeSelect.click();
          await page.waitForTimeout(200);
          const typeOption = page.locator(`mat-option:has-text("${typeName}")`);
          if (await typeOption.isVisible().catch(() => false)) {
            await typeOption.click();
            await page.waitForTimeout(300);
          } else {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            return false;
          }
        }

        // Search for target element
        const searchInput = dialog.getByTestId('element-search-input');
        if (await searchInput.isVisible().catch(() => false)) {
          await searchInput.click();
          await searchInput.fill(targetName.split(' ')[0]);
          await page.waitForTimeout(400);
          const targetOption = page.locator(
            `mat-option:has-text("${targetName}")`
          );
          if (await targetOption.isVisible().catch(() => false)) {
            await targetOption.click();
            await page.waitForTimeout(300);
          }
        }

        // Submit
        const submitButton = dialog.locator(
          'button:has-text("Add Relationship")'
        );
        await page.waitForTimeout(200);
        if (await submitButton.isEnabled().catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(400);
          return true;
        } else {
          const cancelButton = dialog.getByTestId('cancel-button');
          await cancelButton.click().catch(() => page.keyboard.press('Escape'));
          await page.waitForTimeout(200);
          return false;
        }
      }

      // Add multiple relationships of different types
      await addRelationship('Mentor', 'Wise Mentor');
      await addRelationship('Rival', 'Dark Villain');
      await addRelationship('Friend', 'Loyal Friend');

      // Screenshot of character with multiple relationship types
      await page.waitForTimeout(300);

      const metaPanel = page.locator('.meta-panel');
      if (await metaPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [metaPanel],
          join(screenshotsDir, 'character-multiple-relationships-light.png'),
          16
        );
      }

      // Full page screenshot
      await page.screenshot({
        path: join(
          screenshotsDir,
          'character-multiple-relationships-overview-light.png'
        ),
        fullPage: false,
      });
    });

    test('parent-child relationship - dark mode', async ({
      offlinePage: page,
    }) => {
      // Set dark mode
      await page.emulateMedia({ colorScheme: 'dark' });

      // Create project with two characters
      await setupProjectWithCharacters(
        page,
        'parent-child-dark',
        'Family Story Dark',
        ['King Aldric', 'Prince Marcus']
      );

      // Open the parent character
      await page.click('text="King Aldric"');
      await page.waitForTimeout(500);

      // Ensure meta panel is open
      const metaPanelToggle = page.getByTestId('meta-panel-toggle');
      if (await metaPanelToggle.isVisible().catch(() => false)) {
        const metaPanel = page.locator('.meta-panel');
        if (!(await metaPanel.isVisible().catch(() => false))) {
          await metaPanelToggle.click();
          await page.waitForTimeout(300);
        }
      }

      // Add parent relationship
      const addButton = page
        .locator('.meta-panel')
        .getByTestId('add-relationship-button');
      await addButton.click();
      await page.waitForTimeout(500);

      const dialog = page.locator('mat-dialog-container');
      await dialog.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

      if (await dialog.isVisible().catch(() => false)) {
        // Select "Parent" type
        const typeSelect = dialog.getByTestId('relationship-type-select');
        if (await typeSelect.isVisible().catch(() => false)) {
          await typeSelect.click();
          await page.waitForTimeout(200);
          await page.click('mat-option:has-text("Parent")');
          await page.waitForTimeout(300);
        }

        // Search for target
        const searchInput = dialog.getByTestId('element-search-input');
        if (await searchInput.isVisible().catch(() => false)) {
          await searchInput.click();
          await searchInput.fill('Prince');
          await page.waitForTimeout(400);
          const option = page.locator('mat-option:has-text("Prince Marcus")');
          if (await option.isVisible().catch(() => false)) {
            await option.click();
            await page.waitForTimeout(300);
          }
        }

        // Submit
        const submitButton = dialog.locator(
          'button:has-text("Add Relationship")'
        );
        await page.waitForTimeout(200);
        if (await submitButton.isEnabled().catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(500);
        } else {
          const cancelButton = dialog.getByTestId('cancel-button');
          await cancelButton.click().catch(() => page.keyboard.press('Escape'));
          await page.waitForTimeout(300);
        }
      }

      // Screenshot of parent's panel in dark mode
      const metaPanel = page.locator('.meta-panel');
      if (await metaPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [metaPanel],
          join(screenshotsDir, 'character-parent-relationship-dark.png'),
          16
        );
      }

      // Full page
      await page.screenshot({
        path: join(screenshotsDir, 'character-parent-overview-dark.png'),
        fullPage: false,
      });

      // Switch to child to see backlink
      await page.click('text="Prince Marcus"');
      await page.waitForTimeout(500);

      const childMetaPanel = page.locator('.meta-panel');
      if (await childMetaPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [childMetaPanel],
          join(screenshotsDir, 'character-child-relationship-dark.png'),
          16
        );
      }

      await page.screenshot({
        path: join(screenshotsDir, 'character-child-overview-dark.png'),
        fullPage: false,
      });
    });
  });
});
