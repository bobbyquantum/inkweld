/**
 * Timeline Tab Screenshot Tests
 *
 * Captures screenshots demonstrating the Timeline element type:
 * - Full timeline tab (overview) with multiple tracks, events, and an era
 * - Toolbar showing time system picker + add/zoom/fit controls
 * - Both light and dark mode variants
 *
 * Uses local (offline) mode since timeline configs are persisted in element
 * metadata that syncs through the local Yjs/IndexedDB stack.
 */

import { type Page } from '@playwright/test';
import { join } from 'path';

import { dismissToastIfPresent } from '../common/test-helpers';
import { expect, test } from './fixtures';
import {
  captureElementScreenshot,
  ensureDirectory,
  getScreenshotsDir,
} from './screenshot-helpers';

test.describe('Timeline Tab Screenshots', () => {
  const screenshotsDir = getScreenshotsDir();

  test.beforeAll(async () => {
    await ensureDirectory(screenshotsDir);
  });

  /**
   * Helper: set up a project with a populated timeline in local mode.
   */
  async function setupTimeline(page: Page): Promise<void> {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Create a project
    const createButton = page.getByTestId('create-first-project-button');
    await createButton.waitFor({ timeout: 15_000 });
    await createButton.click();

    const nextButton = page.getByTestId('next-step-button');
    await nextButton.waitFor({ timeout: 10_000 });
    await nextButton.click();

    const titleInput = page.getByTestId('project-title-input');
    await titleInput.waitFor({ timeout: 10_000 });
    await titleInput.fill('Chronicle Saga');

    const slugInput = page.getByTestId('project-slug-input');
    await slugInput.fill('chronicle-saga');

    await page.getByTestId('create-project-button').click();

    await page.waitForURL(/chronicle-saga/, { timeout: 15_000 });
    await page.waitForLoadState('domcontentloaded');

    await dismissToastIfPresent(page);

    // Create a timeline element
    await page.getByTestId('create-new-element').click();
    await page.getByTestId('element-type-timeline').click();

    const nameInput = page.getByTestId('element-name-input');
    await nameInput.waitFor({ state: 'visible', timeout: 10_000 });
    await nameInput.fill('Main Timeline');

    await page.getByTestId('create-element-button').click();

    // When a timeline is first created, it enters a "choose a time system"
    // setup state — the canvas is hidden until the user commits a system
    // (lock-in is intentional so events/eras can't silently disappear when
    // the system changes). The default `worldbuilding-empty` template
    // ships with no time systems installed, so we install Gregorian first.
    await page
      .getByTestId('timeline-setup')
      .waitFor({ state: 'visible', timeout: 15_000 });

    // Install a time system via the settings page. The setup overlay offers
    // a shortcut button for this when the project has no systems yet.
    const timelineUrl = page.url();
    const settingsUrl = timelineUrl.replace(
      /\/(timeline|documents|canvas|worldbuilding)\/.*$/,
      '/settings?section=time-systems'
    );
    await page.goto(settingsUrl);

    const installTemplate = page.getByTestId('time-systems-install-template');
    await installTemplate.waitFor({ state: 'visible', timeout: 10_000 });
    await installTemplate.click();

    const gregorianItem = page.getByTestId('time-systems-template-gregorian');
    await gregorianItem.waitFor({ state: 'visible', timeout: 5000 });
    await gregorianItem.click();

    // Confirm the install persisted by waiting for the list row to appear.
    await page
      .getByTestId('time-systems-row-gregorian')
      .waitFor({ state: 'visible', timeout: 5000 });

    // Navigate back to the timeline tab. The setup overlay should now offer
    // Gregorian in its picker (it's pre-selected as the first installed
    // system by the setup effect).
    await page.goto(timelineUrl);
    await page
      .getByTestId('timeline-setup')
      .waitFor({ state: 'visible', timeout: 10_000 });

    // Commit Gregorian — this is the lock-in step. Afterwards the timeline
    // canvas is rendered and the toolbar exposes the add-event/add-era
    // buttons.
    const commit = page.getByTestId('timeline-setup-commit');
    await expect(commit).toBeEnabled({ timeout: 5000 });
    await commit.click();

    await page.waitForSelector('[data-testid="timeline-canvas"]', {
      state: 'visible',
      timeout: 10_000,
    });

    const addEventBtn = page.getByTestId('timeline-add-event');
    await expect(addEventBtn).toBeEnabled({ timeout: 10_000 });

    // Rename the default track via the in-app rename dialog.
    await page
      .locator('[data-testid^="timeline-track-label-"]')
      .first()
      .click();
    const renameInput = page.getByTestId('rename-input');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('Main story');
    await page.getByTestId('rename-confirm-button').click();
    await expect(renameInput).toBeHidden();

    // Add a couple more tracks so the tracks pane looks populated.
    for (const name of ['Villains', 'World events']) {
      await page.getByTestId('timeline-add-track').click();
      const input = page.getByTestId('rename-input');
      await expect(input).toBeVisible();
      await input.fill(name);
      await page.getByTestId('rename-confirm-button').click();
      await expect(input).toBeHidden();
    }

    // Add three events across different tracks. Dates use yyyy-mm-dd format
    // since the Gregorian event dialog exposes a native HTML `type="date"` input.
    const events: { title: string; start: string; trackIdx: number }[] = [
      { title: 'Founding of the realm', start: '2020-03-01', trackIdx: 2 },
      { title: 'The great war', start: '2023-06-15', trackIdx: 1 },
      { title: 'Hero departs homeland', start: '2024-01-10', trackIdx: 0 },
    ];

    for (const ev of events) {
      await page.getByTestId('timeline-add-event').click();
      const titleInput = page.getByTestId('timeline-event-title');
      await titleInput.waitFor({ state: 'visible', timeout: 5000 });
      await titleInput.click();
      await titleInput.fill(ev.title);
      await expect(titleInput).toHaveValue(ev.title);

      // Select the target track
      await page.getByTestId('timeline-event-track').click();
      await page
        .locator('[data-testid^="timeline-track-option-"]')
        .nth(ev.trackIdx)
        .click({ timeout: 5000 });

      await page.getByTestId('timeline-event-start-date').fill(ev.start);

      const save = page.getByTestId('timeline-event-save');
      await expect(save).toBeEnabled({ timeout: 5000 });
      await save.click();

      // Wait for dialog to close so the next iteration picks up a fresh one.
      await titleInput.waitFor({ state: 'detached', timeout: 5000 });
    }

    // Add an era spanning part of the timeline.
    await page.getByTestId('timeline-add-era').click();
    const eraName = page.getByTestId('timeline-era-name');
    await eraName.waitFor({ state: 'visible', timeout: 5000 });
    await eraName.click();
    await eraName.fill('Age of Heroes');
    await expect(eraName).toHaveValue('Age of Heroes');
    await page.getByTestId('timeline-era-start-date').fill('2020-01-01');
    await page.getByTestId('timeline-era-end-date').fill('2025-12-31');
    const eraSave = page.getByTestId('timeline-era-save');
    await expect(eraSave).toBeEnabled({ timeout: 5000 });
    await eraSave.click();
    await eraName.waitFor({ state: 'detached', timeout: 5000 });

    // Fit so the composition is framed nicely.
    await page.getByTestId('timeline-fit').click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
  }

  // ── Light mode ─────────────────────────────────────────────────────────────

  test('timeline tab overview (light)', async ({ offlinePage: page }) => {
    await setupTimeline(page);

    const canvas = page.getByTestId('timeline-canvas');
    await captureElementScreenshot(
      page,
      [canvas],
      join(screenshotsDir, 'timeline-tab-overview-light.png'),
      0
    );
  });

  test('timeline toolbar (light)', async ({ offlinePage: page }) => {
    await setupTimeline(page);

    const toolbar = page.getByTestId('timeline-toolbar');
    await captureElementScreenshot(
      page,
      [toolbar],
      join(screenshotsDir, 'timeline-tab-toolbar-light.png'),
      8
    );
  });

  // ── Dark mode ──────────────────────────────────────────────────────────────

  test('timeline tab overview (dark)', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupTimeline(page);

    const canvas = page.getByTestId('timeline-canvas');
    await captureElementScreenshot(
      page,
      [canvas],
      join(screenshotsDir, 'timeline-tab-overview-dark.png'),
      0
    );
  });

  test('timeline toolbar (dark)', async ({ offlinePage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setupTimeline(page);

    const toolbar = page.getByTestId('timeline-toolbar');
    await captureElementScreenshot(
      page,
      [toolbar],
      join(screenshotsDir, 'timeline-tab-toolbar-dark.png'),
      8
    );
  });
});
