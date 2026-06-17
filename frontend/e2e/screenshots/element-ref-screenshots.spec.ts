/**
 * Element Reference Screenshot Tests
 *
 * Captures comprehensive screenshots demonstrating the @ mention feature:
 * - Full e2e flow: typing @, searching, selecting, final result
 * - Tooltip on hover, context menu, edit mode
 * - Character reference showcase + editor view
 * - Backlinks/inverse relationships
 *
 * Consolidated from 14 → 7 tests by sharing the heavy
 * setupProjectWithCharacter + create-reference setup across artifacts that
 * target the same character + scheme. Tests are still split per color
 * scheme (light/dark) and per scenario where the seeded data differs
 * (full-flow, character-with-ref, backlinks, overview).
 */

import { type Page } from '@playwright/test';
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

  // -------- Helpers --------

  async function setupProjectAndEditor(
    page: Page,
    projectSlug: string,
    projectTitle: string
  ) {
    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      projectTitle,
      projectSlug,
      undefined,
      'worldbuilding-demo'
    );

    await page.waitForSelector('app-project-tree', { state: 'visible' });

    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page
        .locator('text="The Moonveil Accord"')
        .first()
        .waitFor({ state: 'visible' });
    }

    await page.click('text="The Moonveil Accord"').catch(() => {
      return page.locator('.tree-node-item').first().click();
    });

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible' });
    await editor.click();

    return editor;
  }

  async function setupProjectWithCharacter(
    page: Page,
    projectSlug: string,
    projectTitle: string,
    characterName: string
  ) {
    await page.goto('/');
    await page.waitForSelector('.empty-state', { state: 'visible' });

    await createProjectWithTwoSteps(
      page,
      projectTitle,
      projectSlug,
      undefined,
      'worldbuilding-demo'
    );

    await page.waitForSelector('app-project-tree', { state: 'visible' });

    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-character-v1').click();
    await page.getByTestId('element-name-input').fill(characterName);
    await page.getByTestId('create-element-button').click();
    await page.locator('mat-dialog-container').waitFor({ state: 'hidden' });
    await page
      .locator(`[data-testid="element-${characterName}"]`)
      .first()
      .waitFor({ state: 'visible' });

    const expandButton = page
      .locator('[data-testid="expand-folder-button"]')
      .first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
      await page
        .locator('text="The Moonveil Accord"')
        .first()
        .waitFor({ state: 'visible' });
    }

    await page.click('text="The Moonveil Accord"').catch(() => {
      return page.locator('.tree-node-item').first().click();
    });

    const editor = page.locator('.ProseMirror').first();
    await editor.waitFor({ state: 'visible' });
    await editor.click();

    return editor;
  }

  async function enableDarkMode(page: Page) {
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
      await page.evaluate(() => {
        document.body.classList.add('dark-theme');
        document.documentElement.classList.add('dark-theme');
      });
    }
  }

  /** Trigger @, type a search term, and pick a result by name. */
  async function insertReference(
    page: Page,
    searchTerm: string,
    targetName?: string
  ) {
    await page.keyboard.type('@');
    await page
      .waitForSelector('[data-testid="element-ref-popup"]', {
        state: 'visible',
      })
      .catch(() => {});
    await page.keyboard.type(searchTerm);
    await page.waitForTimeout(300);

    const filterTarget = targetName
      ? page
          .locator('[data-testid="element-ref-result-item"]')
          .filter({ hasText: targetName })
      : page.locator('[data-testid="element-ref-result-item"]').first();

    if (await filterTarget.isVisible().catch(() => false)) {
      await filterTarget.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await page
      .locator('[data-testid="element-ref-popup"]')
      .waitFor({ state: 'hidden' })
      .catch(() => {});
  }

  // -------- Full @ mention flow (light + dark) --------

  for (const flowScenario of [
    {
      mode: 'light' as const,
      slugPrefix: 'light-demo-',
      projectTitle: 'Fantasy Novel',
      preText: 'The journey began when Elena met ',
      postText: ' at the crossroads.',
    },
    {
      mode: 'dark' as const,
      slugPrefix: 'dark-demo-',
      projectTitle: 'Dark Fantasy',
      preText: 'The shadows whispered of ',
      postText: ' in the moonlight.',
    },
  ]) {
    test(`capture full @ mention flow - ${flowScenario.mode} mode`, async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const editor = await setupProjectAndEditor(
        page,
        `${flowScenario.slugPrefix}${Date.now()}`,
        flowScenario.projectTitle
      );

      if (flowScenario.mode === 'dark') {
        await enableDarkMode(page);
      }

      await editor.pressSequentially(flowScenario.preText, { delay: 20 });

      // Step 1: open popup
      await page.keyboard.type('@');
      await expect(
        page.locator('[data-testid="element-ref-popup"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-testid="element-ref-result-item"]').first()
      ).toBeVisible();

      await captureElementScreenshot(
        page,
        [editor, page.locator('[data-testid="element-ref-popup"]')],
        join(screenshotsDir, `element-ref-01-popup-${flowScenario.mode}.png`),
        32
      );

      // Step 2: search
      await page.keyboard.type('el');
      await expect(
        page.locator('[data-testid="element-ref-result-item"]').first()
      ).toBeVisible();

      await captureElementScreenshot(
        page,
        [editor, page.locator('[data-testid="element-ref-popup"]')],
        join(screenshotsDir, `element-ref-02-search-${flowScenario.mode}.png`),
        32
      );

      // Step 3: select first result
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

      await editor.pressSequentially(flowScenario.postText, { delay: 20 });

      await captureElementScreenshot(
        page,
        [editor],
        join(screenshotsDir, `element-ref-03-link-${flowScenario.mode}.png`),
        32
      );

      // Step 4: tooltip
      const elementRef = page.locator('.element-ref').first();
      if (await elementRef.isVisible().catch(() => false)) {
        await elementRef.hover();
        await page
          .locator('.element-ref-tooltip')
          .waitFor({ state: 'visible' })
          .catch(() => {});

        await captureElementScreenshot(
          page,
          [elementRef, page.locator('.element-ref-tooltip')],
          join(
            screenshotsDir,
            `element-ref-04-tooltip-${flowScenario.mode}.png`
          ),
          24
        );
      }
    });
  }

  // -------- Character reference + editor + tooltip + context menu --------

  for (const refScenario of [
    {
      mode: 'light' as const,
      slugPrefix: 'char-ref-light-',
      projectTitle: 'The Enchanted Kingdom',
      characterName: 'Elena Blackwood',
      searchTerm: 'elena',
      // pre/post text variants come from the ORIGINAL artifacts. We capture
      // the "showcase" pre/post for character-search/character-link, then a
      // simpler insertion for the editor view artifact.
      showcasePreText: 'The morning sun broke through the mist as ',
      showcasePostText:
        ' stepped out of the ancient tower, her silver cloak billowing in the wind.',
      includeEditMode: true,
    },
    {
      mode: 'dark' as const,
      slugPrefix: 'char-ref-dark-',
      projectTitle: 'Shadows of the Realm',
      characterName: 'Marcus Nightshade',
      searchTerm: 'marcus',
      showcasePreText: 'In the depths of the ancient forest, ',
      showcasePostText:
        ' watched from the shadows, his dark cloak blending with the night.',
      includeEditMode: false,
    },
  ]) {
    test(`character reference + tooltip + context menu - ${refScenario.mode} mode`, async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const editor = await setupProjectWithCharacter(
        page,
        `${refScenario.slugPrefix}${Date.now()}`,
        refScenario.projectTitle,
        refScenario.characterName
      );

      if (refScenario.mode === 'dark') {
        await enableDarkMode(page);
        await page.waitForTimeout(300);
      }

      // ---- Character search popup screenshot (showcase pre-text) ----
      await editor.pressSequentially(refScenario.showcasePreText, {
        delay: 15,
      });

      await page.keyboard.type('@');
      await page
        .waitForSelector('[data-testid="element-ref-popup"]', {
          state: 'visible',
        })
        .catch(() => {});
      await page.keyboard.type(refScenario.searchTerm);
      await page
        .locator('[data-testid="element-ref-result-item"]')
        .first()
        .waitFor({ state: 'visible' });

      await captureElementScreenshot(
        page,
        [editor, page.locator('[data-testid="element-ref-popup"]')],
        join(
          screenshotsDir,
          `element-ref-character-search-${refScenario.mode}.png`
        ),
        32
      );

      // Select character
      const characterResult = page
        .locator('[data-testid="element-ref-result-item"]')
        .filter({ hasText: refScenario.characterName });
      if (await characterResult.isVisible().catch(() => false)) {
        await characterResult.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page
        .locator('[data-testid="element-ref-popup"]')
        .waitFor({ state: 'hidden' })
        .catch(() => {});

      await editor.pressSequentially(refScenario.showcasePostText, {
        delay: 15,
      });

      // ---- Character link in text screenshot ----
      await captureElementScreenshot(
        page,
        [editor],
        join(
          screenshotsDir,
          `element-ref-character-link-${refScenario.mode}.png`
        ),
        32
      );

      // ---- Character tooltip (cropped) ----
      const characterRef = page.locator('.element-ref').first();
      if (await characterRef.isVisible().catch(() => false)) {
        await characterRef.hover();
        await page
          .locator('.element-ref-tooltip')
          .waitFor({ state: 'visible' })
          .catch(() => {});

        await captureElementScreenshot(
          page,
          [characterRef, page.locator('.element-ref-tooltip')],
          join(
            screenshotsDir,
            `element-ref-character-tooltip-${refScenario.mode}.png`
          ),
          24
        );
      }

      // ---- Editor focused view artifact ----
      // Move cursor outside any tooltip context.
      await editor.click();
      const editorContainer = page.locator('.document-editor').first();
      if (await editorContainer.isVisible().catch(() => false)) {
        await editorContainer.screenshot({
          path: join(
            screenshotsDir,
            `element-ref-editor-${refScenario.mode}.png`
          ),
        });
      } else {
        await page.screenshot({
          path: join(
            screenshotsDir,
            `element-ref-editor-${refScenario.mode}.png`
          ),
          fullPage: false,
        });
      }

      // ---- Tooltip full-page screenshot ----
      if (await characterRef.isVisible().catch(() => false)) {
        await characterRef.hover();
        const tooltip = page.locator('.element-ref-tooltip');
        await tooltip.waitFor({ state: 'visible' }).catch(() => {});
        await page.waitForTimeout(200);

        await page.screenshot({
          path: join(
            screenshotsDir,
            `element-ref-tooltip-${refScenario.mode}.png`
          ),
          fullPage: false,
        });
      }

      // ---- Context menu screenshot ----
      if (await characterRef.isVisible().catch(() => false)) {
        await characterRef.click({ button: 'right' });
        const contextMenu = page.locator(
          '[data-testid="element-ref-context-menu"]'
        );
        await expect(contextMenu).toBeVisible();
        await page.waitForTimeout(200);

        await page.screenshot({
          path: join(
            screenshotsDir,
            `element-ref-context-menu-${refScenario.mode}.png`
          ),
          fullPage: false,
        });

        // ---- Context menu edit mode (light only in original) ----
        if (refScenario.includeEditMode) {
          const editBtn = page.locator('[data-testid="context-menu-edit"]');
          if (await editBtn.isVisible().catch(() => false)) {
            await editBtn.click();
            const editInput = page.locator(
              '[data-testid="context-menu-edit-input"]'
            );
            await expect(editInput).toBeVisible();
            await page.waitForTimeout(200);

            await page.screenshot({
              path: join(
                screenshotsDir,
                `element-ref-edit-mode-${refScenario.mode}.png`
              ),
              fullPage: false,
            });
          }
        } else {
          // dismiss the context menu
          await page.keyboard.press('Escape');
        }
      }
    });
  }

  // -------- Combined feature showcase (light only) --------

  test('capture combined feature showcase', async ({ offlinePage: page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const characterName = 'Lyra Silverfall';
    const editor = await setupProjectWithCharacter(
      page,
      'showcase-' + Date.now(),
      'The Crimson Chronicles',
      characterName
    );

    await editor.pressSequentially(
      'The ancient prophecy spoke of a hero who would rise from the ashes. When ',
      { delay: 10 }
    );

    await page.keyboard.type('@');
    await page
      .waitForSelector('[data-testid="element-ref-popup"]', {
        state: 'visible',
      })
      .catch(() => {});
    await page.keyboard.type('lyra');
    await page.waitForTimeout(500);

    await expect(
      page.locator('[data-testid="element-ref-popup"]')
    ).toBeVisible();

    await page.screenshot({
      path: join(screenshotsDir, 'element-ref-feature.png'),
      fullPage: false,
    });
  });

  // -------- Backlinks / inverse relationships --------

  for (const backlinksScenario of [
    {
      mode: 'light' as const,
      slugPrefix: 'backlinks-light-',
      projectTitle: 'The Silver Saga',
      characterName: 'Elara Moonwhisper',
      searchTerm: 'elara',
      preText: 'In the beginning, there was ',
      postText: ', the keeper of ancient secrets.',
    },
    {
      mode: 'dark' as const,
      slugPrefix: 'backlinks-dark-',
      projectTitle: 'Chronicles of Darkness',
      characterName: 'Kael Shadowmere',
      searchTerm: 'kael',
      preText: 'The darkness spoke through ',
      postText: ', the harbinger of twilight.',
    },
  ]) {
    test(`capture character backlinks from story references - ${backlinksScenario.mode} mode`, async ({
      offlinePage: page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });

      const editor = await setupProjectWithCharacter(
        page,
        `${backlinksScenario.slugPrefix}${Date.now()}`,
        backlinksScenario.projectTitle,
        backlinksScenario.characterName
      );

      if (backlinksScenario.mode === 'dark') {
        await enableDarkMode(page);
        await page.waitForTimeout(300);
      }

      await editor.pressSequentially(backlinksScenario.preText, { delay: 15 });
      await insertReference(
        page,
        backlinksScenario.searchTerm,
        backlinksScenario.characterName
      );
      await editor.pressSequentially(backlinksScenario.postText, { delay: 15 });
      await page.waitForTimeout(500);

      // Navigate to character node
      const characterNode = page.getByRole('treeitem', {
        name: backlinksScenario.characterName,
      });
      await characterNode.click();
      await page.waitForTimeout(500);

      await expect(
        page.locator('[data-testid="worldbuilding-editor"]')
      ).toBeVisible();

      const metaPanelToggle = page.locator('[data-testid="meta-panel-toggle"]');
      if (await metaPanelToggle.isVisible().catch(() => false)) {
        await metaPanelToggle.click();
        await page.waitForTimeout(400);
      }

      const relationshipsSection = page.locator(
        '[data-testid="relationships-section"]'
      );
      if (await relationshipsSection.isVisible().catch(() => false)) {
        await relationshipsSection.click();
        await page.waitForTimeout(300);
      }

      await page.waitForTimeout(500);

      await page.screenshot({
        path: join(
          screenshotsDir,
          `element-ref-backlinks-character-${backlinksScenario.mode}.png`
        ),
        fullPage: false,
      });

      const worldbuildingContainer = page.locator(
        '.worldbuilding-editor-container'
      );
      if (await worldbuildingContainer.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [worldbuildingContainer],
          join(
            screenshotsDir,
            `element-ref-backlinks-worldbuilding-${backlinksScenario.mode}.png`
          ),
          16
        );
      }

      const metaPanel = page.locator('app-meta-panel');
      if (await metaPanel.isVisible().catch(() => false)) {
        await captureElementScreenshot(
          page,
          [metaPanel],
          join(
            screenshotsDir,
            `element-ref-backlinks-panel-${backlinksScenario.mode}.png`
          ),
          16
        );
      }
    });
  }
});
