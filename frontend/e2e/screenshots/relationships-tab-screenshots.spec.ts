/**
 * Relationships Tab Screenshot Tests
 *
 * Captures comprehensive screenshots demonstrating the relationship types
 * management feature and per-character relationships panel.
 *
 * Consolidated from 18 → 9 tests by sharing the heavy project-setup step
 * across all artifacts that target the same project. Tests are still split
 * per color scheme (light vs dark) and per scenario where the seeded data
 * differs (e.g. characters created vary by scenario).
 */

import type { Page } from '@playwright/test';
import { join } from 'node:path';

import { expect, test } from './fixtures';

import { createProjectWithTwoSteps } from '../common/test-helpers';
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

  // -------- Helpers --------

  async function setupProjectAndRelationshipsTab(
    page: Page,
    projectSlug: string,
    projectTitle: string
  ): Promise<void> {
    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(page, projectTitle, projectSlug);
    await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

    await page.click('[data-testid="sidebar-settings-button"]');
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    await page.getByTestId('nav-relationships').click();
    await page.getByTestId('relationships-tab').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    await createSampleRelationshipType(page);
  }

  async function createSampleRelationshipType(page: Page): Promise<void> {
    const createButton = page.getByRole('button', { name: /new type/i });
    await createButton.click();

    await page
      .getByTestId('edit-relationship-type-dialog-content')
      .waitFor({ state: 'visible' });

    await page.getByTestId('rel-name-input').fill('Parent');
    await page.getByTestId('rel-inverse-input').fill('Child');
    await page.getByTestId('rel-icon-option-8').click();
    await page.getByTestId('rel-color-option-3').click();
    await page.getByTestId('rel-dialog-save').click();

    await page
      .getByTestId('edit-relationship-type-dialog-content')
      .waitFor({ state: 'hidden' });
    await page
      .locator('[data-testid="relationship-type-card"]')
      .first()
      .waitFor({ state: 'visible' });
  }

  /**
   * Captures every artifact that targets the relationship-types settings tab
   * for a given color scheme. All screenshots share one project + one
   * sample relationship type.
   */
  async function captureRelationshipTypesArtifacts(
    page: Page,
    suffix: 'light' | 'dark'
  ): Promise<void> {
    await page.waitForSelector('[data-testid="relationship-type-card"]', {
      state: 'visible',
    });
    await page.waitForTimeout(300);

    await test.step('overview (sidebar + settings)', async () => {
      const projectTree = page.locator('[data-testid="project-tree"]');
      const settingsContent = page.locator(
        '[data-testid="settings-tab-content"]'
      );
      const typesGrid = page.locator('.types-grid').first();

      await captureElementScreenshot(
        page,
        [projectTree, settingsContent, typesGrid],
        join(screenshotsDir, `relationships-tab-overview-${suffix}.png`),
        16
      );
    });

    await test.step('types grid section', async () => {
      const typesSection = page.locator('.types-grid').first();
      await captureElementScreenshot(
        page,
        [typesSection],
        join(screenshotsDir, `relationships-types-${suffix}.png`),
        16
      );
    });

    await test.step('viewport with type cards', async () => {
      // Used as both "card-details" (light) and "type-card" (dark).
      const cardArtifactName =
        suffix === 'light'
          ? 'relationships-card-details-light.png'
          : 'relationships-type-card-dark.png';
      await page.screenshot({
        path: join(screenshotsDir, cardArtifactName),
        fullPage: false,
      });
    });

    await test.step('action menu / type card crop', async () => {
      // Light only — original suite did not produce a dark counterpart.
      if (suffix === 'light') {
        const typeCard = page
          .locator('[data-testid="relationship-type-card"]')
          .first();
        await captureElementScreenshot(
          page,
          [typeCard],
          join(screenshotsDir, 'relationships-action-menu-light.png'),
          24
        );
      }
    });

    await test.step('edit relationship type dialog', async () => {
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
        join(screenshotsDir, `relationships-edit-dialog-${suffix}.png`),
        32
      );

      await page.getByTestId('rel-dialog-cancel').click();
      await page
        .getByTestId('edit-relationship-type-dialog-content')
        .waitFor({ state: 'hidden' });
    });

    await test.step('create / new relationship type dialog', async () => {
      // Light only — original suite did not produce a dark counterpart for
      // the create dialog. Original light variants were two near-duplicates
      // (`relationships-create-dialog-light` and
      // `relationships-new-dialog-light`); we capture both with the same
      // dialog state to preserve docs references.
      if (suffix !== 'light') return;

      await page.click('[data-testid="create-type-button"]');
      await page
        .getByTestId('edit-relationship-type-dialog-content')
        .waitFor({ state: 'visible' });
      await page.waitForTimeout(200);

      await page.fill('[data-testid="rel-name-input"]', 'Nemesis of');
      await page.fill('[data-testid="rel-inverse-input"]', 'Hunted by');

      await captureElementScreenshot(
        page,
        [page.locator('mat-dialog-container')],
        join(screenshotsDir, 'relationships-create-dialog-light.png'),
        32
      );

      // Re-fill with the alternate label set used by the original
      // "new dialog" test so the two artifacts differ as expected.
      await page.fill('[data-testid="rel-name-input"]', 'Rival of');
      await page.fill('[data-testid="rel-inverse-input"]', 'Rivalled by');

      await captureElementScreenshot(
        page,
        [page.locator('mat-dialog-container')],
        join(screenshotsDir, 'relationships-new-dialog-light.png'),
        32
      );

      await page.click('[data-testid="rel-dialog-cancel"]');
      await page
        .getByTestId('edit-relationship-type-dialog-content')
        .waitFor({ state: 'hidden' });
    });

    await test.step('feature showcase (light only)', async () => {
      if (suffix !== 'light') return;

      await page.screenshot({
        path: join(screenshotsDir, 'relationships-feature-showcase.png'),
        fullPage: false,
      });

      const typesContainer = page.getByTestId('relationships-tab');
      await captureElementScreenshot(
        page,
        [typesContainer],
        join(screenshotsDir, 'relationships-types-grid.png'),
        8
      );
    });
  }

  // -------- Tests: Relationship-Types Settings Tab --------

  test('relationship types settings — light mode', async ({
    offlinePage: page,
  }) => {
    await setupProjectAndRelationshipsTab(
      page,
      'rel-types-light',
      'Relationship Types Demo'
    );
    await captureRelationshipTypesArtifacts(page, 'light');

    await expect(page).toHaveTitle(/.+/);
  });

  test('relationship types settings — dark mode', async ({
    offlinePage: page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupProjectAndRelationshipsTab(
      page,
      'rel-types-dark',
      'Relationship Types Demo Dark'
    );
    await captureRelationshipTypesArtifacts(page, 'dark');

    await expect(page).toHaveTitle(/.+/);
  });

  // -------- Character Relationships Panel --------

  test.describe('Character Relationships Panel', () => {
    async function setupProjectWithCharacters(
      page: Page,
      projectSlug: string,
      projectTitle: string,
      characters: string[]
    ): Promise<void> {
      await page.goto('/');
      await page.waitForSelector('.empty-state', { state: 'visible' });

      await createProjectWithTwoSteps(
        page,
        projectTitle,
        projectSlug,
        undefined,
        'worldbuilding-empty'
      );
      await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

      await page.waitForSelector('app-project-tree', { state: 'visible' });
      await page.waitForTimeout(500);

      for (const charName of characters) {
        await page.getByTestId('create-new-element').click();
        await page.getByTestId('element-type-character-v1').click();
        await page.getByTestId('element-name-input').fill(charName);
        await page.getByTestId('create-element-button').click();
        await page.waitForTimeout(400);
      }
    }

    async function openCharacterAndShowRelationships(
      page: Page,
      characterName: string
    ): Promise<void> {
      await page.click(`text="${characterName}"`);
      await page.waitForTimeout(500);

      const navRelationships = page.getByTestId('nav-relationships');
      if (await navRelationships.isVisible().catch(() => false)) {
        await navRelationships.click();
        await page.waitForTimeout(300);
      }

      const expandButton = page.getByTestId('expand-panel-button');
      if (await expandButton.isVisible().catch(() => false)) {
        await expandButton.click();
        await page.waitForTimeout(300);
      }

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

    /**
     * Captures the per-character "panel + dialog + empty-state" trio for
     * a given color scheme. Shares one project + one set of characters
     * across all three artifacts.
     */
    async function captureCharacterPanelArtifacts(
      page: Page,
      suffix: 'light' | 'dark'
    ): Promise<void> {
      await test.step('character relationships panel (empty state)', async () => {
        const relationshipsPanel = page.locator('.relationships-panel');
        if (await relationshipsPanel.isVisible().catch(() => false)) {
          await captureElementScreenshot(
            page,
            [relationshipsPanel],
            join(screenshotsDir, `character-relationships-panel-${suffix}.png`),
            16
          );
        }

        await page.screenshot({
          path: join(
            screenshotsDir,
            `character-relationships-overview-${suffix}.png`
          ),
          fullPage: false,
        });
      });

      await test.step('add relationship dialog', async () => {
        await openAddRelationshipDialogAndCapture(
          page,
          `add-relationship-dialog-${suffix}.png`
        );
      });
    }

    test('character panel + add dialog — light mode', async ({
      offlinePage: page,
    }) => {
      await setupProjectWithCharacters(
        page,
        'char-rel-light',
        'Fantasy Novel',
        ['Elena Blackwood', 'Marcus Sterling', 'Lord Aldric', 'Sarah Chen']
      );
      await openCharacterAndShowRelationships(page, 'Elena Blackwood');
      await page.waitForTimeout(500);

      await expect(page).toHaveTitle(/.+/);

      await captureCharacterPanelArtifacts(page, 'light');
    });

    test('character panel + add dialog — dark mode', async ({
      offlinePage: page,
    }) => {
      await page.emulateMedia({ colorScheme: 'dark' });

      await setupProjectWithCharacters(
        page,
        'char-rel-dark',
        'Fantasy Novel Dark',
        ['Elena Blackwood', 'Marcus Sterling', 'Lord Aldric']
      );
      await openCharacterAndShowRelationships(page, 'Elena Blackwood');
      await page.waitForTimeout(500);

      await expect(page).toHaveTitle(/.+/);

      await captureCharacterPanelArtifacts(page, 'dark');
    });

    test('empty relationships state', async ({ offlinePage: page }) => {
      await setupProjectWithCharacters(
        page,
        'empty-rel',
        'Empty Relationships Demo',
        ['Lone Character']
      );
      await openCharacterAndShowRelationships(page, 'Lone Character');
      await page.waitForTimeout(500);

      const relationshipsPanel = page.locator('.relationships-panel');
      if (await relationshipsPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [relationshipsPanel],
          join(screenshotsDir, 'relationships-empty-state-light.png'),
          16
        );
      }

      await expect(page).toHaveTitle(/.+/);
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
        if (parentChildScenario.darkMode) {
          await page.emulateMedia({ colorScheme: 'dark' });
        }

        await setupProjectWithCharacters(
          page,
          parentChildScenario.projectSlug,
          parentChildScenario.projectTitle,
          parentChildScenario.characters
        );
        await openCharacterAndShowRelationships(
          page,
          parentChildScenario.parentCharacter
        );
        await page.waitForTimeout(500);

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

        await expect(page).toHaveTitle(/.+/);
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
        if (multipleScenario.darkMode) {
          await page.emulateMedia({ colorScheme: 'dark' });
        }

        await setupProjectWithCharacters(
          page,
          multipleScenario.projectSlug,
          multipleScenario.projectTitle,
          ['Hero Knight', 'Wise Mentor', 'Dark Villain', 'Loyal Friend']
        );
        await openCharacterAndShowRelationships(page, 'Hero Knight');
        await page.waitForTimeout(500);

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

        await expect(page).toHaveTitle(/.+/);
      });
    }
  });
});
