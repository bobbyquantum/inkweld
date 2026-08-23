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

import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';
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
    await page.waitForSelector('[data-testid="empty-state"]', {
      state: 'visible',
    });

    await createProjectWithTwoSteps(page, projectTitle, projectSlug);
    await page.waitForURL(new RegExp(`/demouser/${projectSlug}`));

    await page.click('[data-testid="sidebar-settings-button"]');
    await page.waitForSelector('[data-testid="settings-tab-content"]', {
      state: 'visible',
    });

    await page.getByTestId('nav-relationships').click();
    await page.getByTestId('relationships-tab').waitFor({ state: 'visible' });

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
    await expect(
      page.getByTestId('relationship-types-list').first()
    ).toBeVisible();

    await test.step('overview (sidebar + settings)', async () => {
      const projectTree = page.locator('[data-testid="project-tree"]');
      const settingsContent = page.locator(
        '[data-testid="settings-tab-content"]'
      );
      const typesGrid = page.getByTestId('relationship-types-list').first();

      await captureElementScreenshot(
        page,
        [projectTree, settingsContent, typesGrid],
        join(screenshotsDir, `relationships-tab-overview-${suffix}.png`),
        16
      );
    });

    await test.step('types grid section', async () => {
      const typesSection = page.getByTestId('relationship-types-list').first();
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
      // The dialog is opened in edit mode, so the existing values must be
      // populated before the screenshot.
      await expect(page.getByTestId('rel-name-input')).toHaveValue('Parent');

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
});
