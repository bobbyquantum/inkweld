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

import { join } from 'node:path';

import { type Page } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

test.describe('Relationships Tab Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
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
    });

    await createProjectWithTwoSteps(page, projectTitle, projectSlug);
    await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

    // Navigate to Settings tab first via sidebar button (keeps sidenav visible)
    await page.click('[data-testid="sidebar-settings-button"]');
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    // Click on the Relationships section in sidenav
    await page.getByTestId('nav-relationships').click();

    // Wait for relationships container
    await page.getByTestId('relationships-tab').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    // Create a sample relationship type so screenshots have content
    await createSampleRelationshipType(page);
  }

  /**
   * Helper to create a sample relationship type for screenshots using the
   * new full editor dialog.
   */
  async function createSampleRelationshipType(page: Page) {
    // Click the "New Type" button (handles both empty state and populated state)
    const createButton = page.getByRole('button', { name: /new type/i });
    await createButton.click();

    // Wait for the full editor dialog
    await page
      .getByTestId('edit-relationship-type-dialog-content')
      .waitFor({ state: 'visible' });

    // Fill in name and inverse label
    await page.getByTestId('rel-name-input').fill('Parent');
    await page.getByTestId('rel-inverse-input').fill('Child');

    // Pick an icon (index 8 = family_restroom)
    await page.getByTestId('rel-icon-option-8').click();

    // Pick a color (index 3 = Dark orange)
    await page.getByTestId('rel-color-option-3').click();

    // Submit
    await page.getByTestId('rel-dialog-save').click();

    // Wait for dialog to close and type to appear
    await page
      .getByTestId('edit-relationship-type-dialog-content')
      .waitFor({ state: 'hidden' });
    await page
      .locator('[data-testid="relationship-type-card"]')
      .first()
      .waitFor({ state: 'visible' });
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
      await page
        .getByTestId('edit-relationship-type-dialog-content')
        .waitFor({ state: 'visible' });
      await page.waitForTimeout(200);

      // Type a name
      await page.fill('[data-testid="rel-name-input"]', 'Nemesis of');
      await page.fill('[data-testid="rel-inverse-input"]', 'Hunted by');

      // Screenshot of the dialog
      await captureElementScreenshot(
        page,
        [page.locator('mat-dialog-container')],
        join(screenshotsDir, 'relationships-create-dialog-light.png'),
        32
      );

      // Cancel the dialog
      await page.click('[data-testid="rel-dialog-cancel"]');
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
      });
      await page.waitForTimeout(300);

      // Capture a type card with inline action controls visible
      const typeCard = page
        .locator('[data-testid="relationship-type-card"]')
        .first();

      // Screenshot focused on card actions
      await captureElementScreenshot(
        page,
        [typeCard],
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
      });
      await page.waitForTimeout(500);

      // Full page screenshot for documentation hero image
      await page.screenshot({
        path: join(screenshotsDir, 'relationships-feature-showcase.png'),
        fullPage: false,
      });

      // Cropped version focusing on the types grid
      const typesContainer = page.getByTestId('relationships-tab');
      await captureElementScreenshot(
        page,
        [typesContainer],
        join(screenshotsDir, 'relationships-types-grid.png'),
        8
      );
    });

    test('edit relationship type dialog - light mode', async ({
      offlinePage: page,
    }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-edit-dialog-light',
        'Edit Dialog Demo'
      );

      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
      });

      // Open the edit dialog for the first type card
      await page
        .locator('[data-testid="relationship-type-card"]')
        .first()
        .getByTestId('edit-type-button')
        .click();

      await page
        .getByTestId('edit-relationship-type-dialog-content')
        .waitFor({ state: 'visible' });
      await page.waitForTimeout(300);

      await captureElementScreenshot(
        page,
        [page.locator('mat-dialog-container')],
        join(screenshotsDir, 'relationships-edit-dialog-light.png'),
        32
      );

      await page.getByTestId('rel-dialog-cancel').click();
    });

    test('edit relationship type dialog - dark mode', async ({
      offlinePage: page,
    }) => {
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectAndRelationshipsTab(
        page,
        'rel-edit-dialog-dark',
        'Edit Dialog Demo Dark'
      );

      await page.waitForSelector('[data-testid="relationship-type-card"]', {
        state: 'visible',
      });

      await page
        .locator('[data-testid="relationship-type-card"]')
        .first()
        .getByTestId('edit-type-button')
        .click();

      await page
        .getByTestId('edit-relationship-type-dialog-content')
        .waitFor({ state: 'visible' });
      await page.waitForTimeout(300);

      await captureElementScreenshot(
        page,
        [page.locator('mat-dialog-container')],
        join(screenshotsDir, 'relationships-edit-dialog-dark.png'),
        32
      );

      await page.getByTestId('rel-dialog-cancel').click();
    });

    test('new relationship type dialog - light mode', async ({
      offlinePage: page,
    }) => {
      await setupProjectAndRelationshipsTab(
        page,
        'rel-new-dialog-light',
        'New Dialog Demo'
      );

      await page.getByTestId('create-type-button').click();
      await page
        .getByTestId('edit-relationship-type-dialog-content')
        .waitFor({ state: 'visible' });
      await page.waitForTimeout(300);

      // Fill in some values so the screenshot looks like real usage
      await page.getByTestId('rel-name-input').fill('Rival of');
      await page.getByTestId('rel-inverse-input').fill('Rivalled by');

      await captureElementScreenshot(
        page,
        [page.locator('mat-dialog-container')],
        join(screenshotsDir, 'relationships-new-dialog-light.png'),
        32
      );

      await page.getByTestId('rel-dialog-cancel').click();
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
      });

      await createProjectWithTwoSteps(
        page,
        projectTitle,
        projectSlug,
        undefined,
        'worldbuilding-empty'
      );
      await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

      // Wait for project tree to be visible
      await page.waitForSelector('app-project-tree', {
        state: 'visible',
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

      // In sidenav mode, click Relationships nav to show the meta panel
      const navRelationships = page.getByTestId('nav-relationships');
      if (await navRelationships.isVisible().catch(() => false)) {
        await navRelationships.click();
        await page.waitForTimeout(300);
      }

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

    /**
     * Helper to add a relationship in the character meta panel.
     */
    async function addRelationship(
      page: Page,
      typeName: string,
      targetName: string
    ): Promise<boolean> {
      const addButton = page
        .locator('.meta-panel')
        .getByTestId('add-relationship-button');
      await addButton.click();
      await page.waitForTimeout(400);

      const dialog = page.locator('mat-dialog-container');
      await dialog.waitFor({ state: 'visible' }).catch(() => {});

      if (!(await dialog.isVisible().catch(() => false))) {
        return false;
      }

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

      const submitButton = dialog.locator(
        'button:has-text("Add Relationship")'
      );
      await page.waitForTimeout(200);
      if (await submitButton.isEnabled().catch(() => false)) {
        await submitButton.click();
        await page.waitForTimeout(400);
        return true;
      }

      const cancelButton = dialog.getByTestId('cancel-button');
      await cancelButton.click().catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(200);
      return false;
    }

    async function setupCharacterScenario(
      page: Page,
      options: {
        darkMode: boolean;
        projectSlug: string;
        projectTitle: string;
        characters: string[];
        activeCharacter: string;
      }
    ): Promise<void> {
      if (options.darkMode) {
        await page.emulateMedia({ colorScheme: 'dark' });
      }

      await setupProjectWithCharacters(
        page,
        options.projectSlug,
        options.projectTitle,
        options.characters
      );

      await openCharacterAndShowRelationships(page, options.activeCharacter);
      await page.waitForTimeout(500);
    }

    async function captureRelationshipOverview(
      page: Page,
      panelFile: string,
      overviewFile: string
    ): Promise<void> {
      const relationshipsPanel = page.locator('.relationships-panel');
      if (await relationshipsPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [relationshipsPanel],
          join(screenshotsDir, panelFile),
          16
        );
      }

      await page.screenshot({
        path: join(screenshotsDir, overviewFile),
        fullPage: false,
      });
    }

    async function openAddRelationshipDialogAndCapture(
      page: Page,
      outputFile: string
    ): Promise<void> {
      const addButton = page.getByTestId('add-relationship-button');
      if (!(await addButton.isVisible().catch(() => false))) {
        return;
      }

      await addButton.click();
      await page.waitForTimeout(500);

      const dialog = page.locator('mat-dialog-container');
      if (await dialog.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [dialog],
          join(screenshotsDir, outputFile),
          32
        );
      }

      await page
        .locator('button:has-text("Cancel")')
        .click()
        .catch(() => page.keyboard.press('Escape'));
    }

    async function addParentRelationshipThroughDialog(
      page: Page,
      options: {
        typeName: string;
        searchTerm: string;
        targetOptionText: string;
        debugScreenshot?: string;
      }
    ): Promise<void> {
      const addButton = page
        .locator('.meta-panel')
        .getByTestId('add-relationship-button');
      await addButton.click();
      await page.waitForTimeout(500);

      const dialog = page.locator('mat-dialog-container');
      await dialog.waitFor({ state: 'visible' }).catch(() => {});

      if (!(await dialog.isVisible().catch(() => false))) {
        return;
      }

      const typeSelect = dialog.getByTestId('relationship-type-select');
      if (await typeSelect.isVisible().catch(() => false)) {
        await typeSelect.click();
        await page.waitForTimeout(200);
        await page.click(`mat-option:has-text("${options.typeName}")`);
        await page.waitForTimeout(300);
      }

      const searchInput = dialog.getByTestId('element-search-input');
      if (await searchInput.isVisible().catch(() => false)) {
        await searchInput.click();
        await searchInput.fill(options.searchTerm);
        await page.waitForTimeout(500);

        const option = page.locator(
          `mat-option:has-text("${options.targetOptionText}")`
        );
        if (await option.isVisible().catch(() => false)) {
          await option.click();
          await page.waitForTimeout(300);
        }
      }

      const submitButton = dialog.locator(
        'button:has-text("Add Relationship")'
      );
      await page.waitForTimeout(200);

      if (await submitButton.isEnabled().catch(() => false)) {
        await submitButton.click();
        await page.waitForTimeout(500);
        return;
      }

      if (options.debugScreenshot) {
        await page.screenshot({
          path: join(screenshotsDir, options.debugScreenshot),
          fullPage: false,
        });
      }

      const cancelButton = dialog.getByTestId('cancel-button');
      await cancelButton.click().catch(() => page.keyboard.press('Escape'));
      await page.waitForTimeout(300);
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

    for (const dialogScenario of [
      {
        testName: 'add relationship dialog',
        darkMode: false,
        projectSlug: 'add-rel-dialog',
        projectTitle: 'Dialog Demo',
        outputFile: 'add-relationship-dialog-light.png',
      },
      {
        testName: 'add relationship dialog - dark mode',
        darkMode: true,
        projectSlug: 'add-rel-dialog-dark',
        projectTitle: 'Dialog Demo Dark',
        outputFile: 'add-relationship-dialog-dark.png',
      },
    ]) {
      test(dialogScenario.testName, async ({ offlinePage: page }) => {
        await setupCharacterScenario(page, {
          darkMode: dialogScenario.darkMode,
          projectSlug: dialogScenario.projectSlug,
          projectTitle: dialogScenario.projectTitle,
          characters: ['Hero', 'Mentor', 'Villain'],
          activeCharacter: 'Hero',
        });

        await openAddRelationshipDialogAndCapture(
          page,
          dialogScenario.outputFile
        );
      });
    }

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

    for (const parentChildScenario of [
      {
        testName: 'parent-child relationship between characters',
        darkMode: false,
        projectSlug: 'parent-child-demo',
        projectTitle: 'Family Story',
        characters: ['Lord Aldric Stormwind', 'Elena Stormwind'],
        parentCharacter: 'Lord Aldric Stormwind',
        childCharacter: 'Elena Stormwind',
        childSearchTerm: 'Elena',
        parentPanelFile: 'character-parent-relationship-light.png',
        parentOverviewFile: 'character-parent-overview-light.png',
        childPanelFile: 'character-child-relationship-light.png',
        childOverviewFile: 'character-child-overview-light.png',
        debugScreenshot: 'debug-dialog-state.png',
      },
      {
        testName: 'parent-child relationship - dark mode',
        darkMode: true,
        projectSlug: 'parent-child-dark',
        projectTitle: 'Family Story Dark',
        characters: ['King Aldric', 'Prince Marcus'],
        parentCharacter: 'King Aldric',
        childCharacter: 'Prince Marcus',
        childSearchTerm: 'Prince',
        parentPanelFile: 'character-parent-relationship-dark.png',
        parentOverviewFile: 'character-parent-overview-dark.png',
        childPanelFile: 'character-child-relationship-dark.png',
        childOverviewFile: 'character-child-overview-dark.png',
      },
    ]) {
      test(parentChildScenario.testName, async ({ offlinePage: page }) => {
        await setupCharacterScenario(page, {
          darkMode: parentChildScenario.darkMode,
          projectSlug: parentChildScenario.projectSlug,
          projectTitle: parentChildScenario.projectTitle,
          characters: parentChildScenario.characters,
          activeCharacter: parentChildScenario.parentCharacter,
        });

        await addParentRelationshipThroughDialog(page, {
          typeName: 'Parent',
          searchTerm: parentChildScenario.childSearchTerm,
          targetOptionText: parentChildScenario.childCharacter,
          debugScreenshot: parentChildScenario.debugScreenshot,
        });

        await page.waitForTimeout(300);
        await captureRelationshipOverview(
          page,
          parentChildScenario.parentPanelFile,
          parentChildScenario.parentOverviewFile
        );

        await openCharacterAndShowRelationships(
          page,
          parentChildScenario.childCharacter
        );

        await captureRelationshipOverview(
          page,
          parentChildScenario.childPanelFile,
          parentChildScenario.childOverviewFile
        );
      });
    }

    for (const multipleScenario of [
      {
        testName: 'multiple relationship types on one character',
        darkMode: false,
        projectSlug: 'multi-rel-demo',
        projectTitle: 'Complex Relationships',
        outputFile: 'character-multiple-relationships-light.png',
        overviewFile: 'character-multiple-relationships-overview-light.png',
      },
      {
        testName: 'multiple relationship types on one character - dark mode',
        darkMode: true,
        projectSlug: 'multi-rel-dark',
        projectTitle: 'Complex Relationships Dark',
        outputFile: 'character-multiple-relationships-dark.png',
        overviewFile: 'character-multiple-relationships-overview-dark.png',
      },
    ]) {
      test(multipleScenario.testName, async ({ offlinePage: page }) => {
        await setupCharacterScenario(page, {
          darkMode: multipleScenario.darkMode,
          projectSlug: multipleScenario.projectSlug,
          projectTitle: multipleScenario.projectTitle,
          characters: [
            'Hero Knight',
            'Wise Mentor',
            'Dark Villain',
            'Loyal Friend',
          ],
          activeCharacter: 'Hero Knight',
        });

        await addRelationship(page, 'Mentor', 'Wise Mentor');
        await addRelationship(page, 'Rival', 'Dark Villain');
        await addRelationship(page, 'Friend', 'Loyal Friend');

        await page.waitForTimeout(300);

        const metaPanel = page.locator('.meta-panel');
        if (await metaPanel.isVisible().catch(() => false)) {
          await captureElementScreenshot(
            page,
            [metaPanel],
            join(screenshotsDir, multipleScenario.outputFile),
            16
          );
        }

        await page.screenshot({
          path: join(screenshotsDir, multipleScenario.overviewFile),
          fullPage: false,
        });
      });
    }
  });
});
