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

  // Safeguard against invalid clip dimensions
  if (clipWidth <= 0 || clipHeight <= 0) {
    await page.screenshot({ path, fullPage: false });
    return;
  }

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
   * (Relationship Types is now a sub-tab within Project Settings)
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

    // Step 1: Template selection - click Next to proceed
    const nextButton = page.getByRole('button', { name: /next/i });
    await nextButton.waitFor({ state: 'visible', timeout: 5000 });
    await nextButton.click();

    // Step 2: Fill in project details
    await page.waitForSelector('input[data-testid="project-title-input"]', {
      state: 'visible',
      timeout: 3000,
    });

    await page.fill('input[data-testid="project-title-input"]', projectTitle);
    await page.fill('input[data-testid="project-slug-input"]', projectSlug);

    await page.click('button[data-testid="create-project-button"]');

    await page.waitForURL(new RegExp(`/demouser/${projectSlug}`), {
      timeout: 5000,
    });

    // Navigate to Settings tab first via sidebar button (keeps sidenav visible)
    await page.click('[data-testid="sidebar-settings-button"]');
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
      timeout: 10000,
    });

    // Click on the "Relationship Types" inner tab
    await page.getByRole('tab', { name: 'Relationship Types' }).click();

    // Wait for relationships container
    await page.waitForSelector('.relationships-tab-container', {
      state: 'visible',
      timeout: 5000,
    });
    await page.waitForTimeout(500);

    // Create a sample relationship type so screenshots have content
    await createSampleRelationshipType(page);
  }

  /**
   * Helper to create a sample relationship type for screenshots
   */
  async function createSampleRelationshipType(page: Page) {
    // Click the "New Type" button (handles both empty state and populated state)
    const createButton = page.getByRole('button', { name: /new type/i });
    await createButton.click();

    // First dialog: Enter the type name
    await page.waitForSelector('app-rename-dialog', { state: 'visible' });
    await page.locator('app-rename-dialog input').clear();
    await page.locator('app-rename-dialog input').fill('Parent');
    await page.locator('app-rename-dialog button:has-text("Rename")').click();

    // Second dialog: Enter the inverse label
    await page
      .locator('app-rename-dialog h2:has-text("Inverse Label")')
      .waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('app-rename-dialog input').clear();
    await page.locator('app-rename-dialog input').fill('Child');
    await page.locator('app-rename-dialog button:has-text("Rename")').click();

    // Wait for dialog to close and type to appear
    await page
      .locator('app-rename-dialog')
      .waitFor({ state: 'hidden', timeout: 5000 });
    await page
      .locator('[data-testid="relationship-type-card"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 });
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

      // Capture cropped view showing sidebar and settings content
      const projectTree = page.locator('[data-testid="project-tree"]');
      const settingsContent = page.locator(
        '[data-testid="settings-tab-content"]'
      );
      const typesGrid = page.locator('.types-grid').first();

      await captureElementScreenshot(
        page,
        [projectTree, settingsContent, typesGrid],
        join(screenshotsDir, 'relationships-tab-overview-light.png'),
        16
      );
    });

    test('relationship types section', async ({ offlinePage: page }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-types-light',
        'Relationship Types Demo'
      );

      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
        timeout: 5000,
      });
      await page.waitForTimeout(300);

      // Capture the types grid section
      const typesSection = page.locator('.types-grid').first();

      await captureElementScreenshot(
        page,
        [typesSection],
        join(screenshotsDir, 'relationships-types-light.png'),
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

      // Wait for type cards to load
      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
        timeout: 5000,
      });
      await page.waitForTimeout(300);

      // Screenshot the viewport showing the type cards
      await page.screenshot({
        path: join(screenshotsDir, 'relationships-card-details-light.png'),
        fullPage: false,
      });
    });

    test('type action menu', async ({ offlinePage: page }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-menu-light',
        'Action Menu Demo'
      );

      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
        timeout: 5000,
      });
      await page.waitForTimeout(300);

      // Open the menu on a type card
      const typeCard = page
        .locator('[data-testid="relationship-type-card"]')
        .first();
      await typeCard.locator('button[mat-icon-button]').click();
      await page.waitForTimeout(200);

      // Screenshot with menu open
      await captureElementScreenshot(
        page,
        [typeCard, page.locator('.mat-mdc-menu-panel')],
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

      // Capture cropped view showing sidebar and settings content
      const projectTree = page.locator('[data-testid="project-tree"]');
      const settingsContent = page.locator(
        '[data-testid="settings-tab-content"]'
      );
      const typesGrid = page.locator('.types-grid').first();

      await captureElementScreenshot(
        page,
        [projectTree, settingsContent, typesGrid],
        join(screenshotsDir, 'relationships-tab-overview-dark.png'),
        16
      );
    });

    test('relationship types section dark', async ({ offlinePage: page }) => {
      // Set dark mode via media emulation
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectAndRelationshipsTab(
        page,
        'rel-types-dark',
        'Relationship Types Demo'
      );

      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
        timeout: 5000,
      });

      const typesSection = page.locator('.types-grid').first();

      await captureElementScreenshot(
        page,
        [typesSection],
        join(screenshotsDir, 'relationships-types-dark.png'),
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

      // Wait for type cards to load
      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
        timeout: 5000,
      });
      await page.waitForTimeout(300);

      // Screenshot the viewport showing the type cards
      await page.screenshot({
        path: join(screenshotsDir, 'relationships-type-card-dark.png'),
        fullPage: false,
      });
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

      // Step 1: Template selection - select worldbuilding-empty template
      // which includes relationship types with proper schema constraints
      const wbTemplate = page.getByTestId('template-worldbuilding-empty');
      await wbTemplate.waitFor({ state: 'visible', timeout: 5000 });
      await wbTemplate.click();

      const nextButton = page.getByRole('button', { name: /next/i });
      await nextButton.waitFor({ state: 'visible', timeout: 5000 });
      await nextButton.click();

      // Step 2: Fill in project details
      await page.waitForSelector('input[data-testid="project-title-input"]', {
        state: 'visible',
        timeout: 3000,
      });

      await page.fill('input[data-testid="project-title-input"]', projectTitle);
      await page.fill('input[data-testid="project-slug-input"]', projectSlug);

      await page.click('button[data-testid="create-project-button"]');

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
        await page.getByTestId('element-type-character-v1').click();
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

      // Expand the meta panel (panel is always visible but starts collapsed)
      const expandButton = page.getByTestId('expand-panel-button');
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click();
        await page.waitForTimeout(300);
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

      // Expand the meta panel (panel is always visible but starts collapsed)
      const expandButton = page.getByTestId('expand-panel-button');
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click();
        await page.waitForTimeout(300);
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

      // Capture the relationships panel showing the relationship (if any was created)
      const relationshipsPanel = page.locator('.relationships-panel');
      if (await relationshipsPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [relationshipsPanel],
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

      // Expand the meta panel on the child character
      const childExpandButton = page.getByTestId('expand-panel-button');
      if (await childExpandButton.isVisible().catch(() => false)) {
        await childExpandButton.click();
        await page.waitForTimeout(300);
      }

      // The child should show "Child of" relationship (backlink) if relationship was created
      const childRelationshipsPanel = page.locator('.relationships-panel');
      if (await childRelationshipsPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [childRelationshipsPanel],
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

      // Expand the meta panel (panel is always visible but starts collapsed)
      const expandButton = page.getByTestId('expand-panel-button');
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click();
        await page.waitForTimeout(300);
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

      // Expand the meta panel (panel is always visible but starts collapsed)
      const expandButton = page.getByTestId('expand-panel-button');
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click();
        await page.waitForTimeout(300);
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
      const relationshipsPanel = page.locator('.relationships-panel');
      if (await relationshipsPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [relationshipsPanel],
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

      // Expand the meta panel on the child character
      const childExpandButton = page.getByTestId('expand-panel-button');
      if (await childExpandButton.isVisible().catch(() => false)) {
        await childExpandButton.click();
        await page.waitForTimeout(300);
      }

      const childRelationshipsPanel = page.locator('.relationships-panel');
      if (await childRelationshipsPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [childRelationshipsPanel],
          join(screenshotsDir, 'character-child-relationship-dark.png'),
          16
        );
      }

      await page.screenshot({
        path: join(screenshotsDir, 'character-child-overview-dark.png'),
        fullPage: false,
      });
    });

    test('multiple relationship types on one character - dark mode', async ({
      offlinePage: page,
    }) => {
      // Set dark mode
      await page.emulateMedia({ colorScheme: 'dark' });

      // Create a project with several characters for complex relationships
      await setupProjectWithCharacters(
        page,
        'multi-rel-dark',
        'Complex Relationships Dark',
        ['Hero Knight', 'Wise Mentor', 'Dark Villain', 'Loyal Friend']
      );

      // Open the Hero character
      await page.click('text="Hero Knight"');
      await page.waitForTimeout(500);

      // Expand the meta panel (panel is always visible but starts collapsed)
      const expandButton = page.getByTestId('expand-panel-button');
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click();
        await page.waitForTimeout(300);
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
          join(screenshotsDir, 'character-multiple-relationships-dark.png'),
          16
        );
      }

      // Full page screenshot
      await page.screenshot({
        path: join(
          screenshotsDir,
          'character-multiple-relationships-overview-dark.png'
        ),
        fullPage: false,
      });
    });
  });
});
