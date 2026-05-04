/**
 * Timeline Element E2E Tests - Local Mode
 *
 * Verifies that the Timeline element type works end-to-end:
 *   - Creating a timeline element opens the timeline tab
 *   - Toolbar, SVG canvas, empty state, sticky bands render correctly
 *   - Events can be added through the event dialog and appear on the timeline
 *   - Tracks can be added and renamed
 *   - Zoom controls respond
 *   - Events persist across page reloads
 *
 * Consolidated from 9 individual tests into 3 grouped tests using
 * `test.step()` to share the expensive timeline-setup flow (which
 * involves navigating to settings, installing the Gregorian time
 * system, and committing the timeline).
 */

import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a timeline element and navigate into it
// ─────────────────────────────────────────────────────────────────────────────

async function createTimelineAndOpen(page: Page) {
  await page.getByTestId('project-card').first().click();
  await page.waitForURL(/\/.+\/.+/);

  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-timeline').click();

  const nameInput = page.getByTestId('element-name-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill('My Timeline');
  await page.getByTestId('create-element-button').click();

  await expect(page.getByTestId('element-My Timeline')).toBeVisible();

  // A brand-new timeline enters a "choose a time system" setup overlay and
  // locks in the selection on commit. The worldbuilding-empty template has
  // no installed systems, so install Gregorian via the settings tab first.
  await expect(page.getByTestId('timeline-setup')).toBeVisible();

  const timelineUrl = page.url();
  const settingsUrl = timelineUrl.replace(
    /\/timeline\/.*$/,
    '/settings?section=time-systems'
  );
  await page.goto(settingsUrl);

  await page.getByTestId('time-systems-install-template').click();
  await page.getByTestId('time-systems-template-gregorian').click();
  await expect(page.getByTestId('time-systems-row-gregorian')).toBeVisible();

  // Return to the timeline and commit Gregorian.
  await page.goto(timelineUrl);
  await expect(page.getByTestId('timeline-setup')).toBeVisible();
  const commit = page.getByTestId('timeline-setup-commit');
  await expect(commit).toBeEnabled();
  await commit.click();

  await expect(page.getByTestId('timeline-canvas')).toBeVisible();
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Timeline Tab', () => {
  test('initial render: timeline tab, toolbar, SVG, empty state, sticky bands', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    await test.step('navigates to timeline tab with toolbar and SVG tracks', async () => {
      await expect(page).toHaveURL(/timeline\/.+/);
      await expect(page.getByTestId('timeline-toolbar')).toBeVisible();
      await expect(page.getByTestId('timeline-svg-tracks')).toBeVisible();
    });

    await test.step('shows empty-state hint when no events exist', async () => {
      await expect(page.getByTestId('timeline-empty')).toBeVisible();
    });

    await test.step('renders sticky top and bottom bands around scroll area', async () => {
      await expect(page.getByTestId('timeline-svg-top')).toBeVisible();
      await expect(page.getByTestId('timeline-tracks-scroll')).toBeVisible();
      await expect(page.getByTestId('timeline-svg-bottom')).toBeVisible();
    });
  });

  test('tracks: prompt for name, rename existing, populate dropdown in event dialog', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    await test.step('add-track prompts for a name and renders the new label', async () => {
      await page.getByTestId('timeline-add-track').click();

      const input = page.getByTestId('rename-input');
      await expect(input).toBeVisible();
      // Wait for default value to populate before clearing.
      await expect(input).not.toHaveValue('');
      await input.clear();
      await input.fill('Villains');
      await expect(input).toHaveValue('Villains');
      await expect(page.getByTestId('rename-confirm-button')).toBeEnabled();
      await page.getByTestId('rename-confirm-button').click();
      await expect(page.getByTestId('rename-input')).toHaveCount(0);

      await expect(
        page.locator('[data-testid^="timeline-track-label-"]', {
          hasText: 'Villains',
        })
      ).toBeVisible();
    });

    await test.step('clicking an existing track label prompts to rename it', async () => {
      // Rename the default "Main track" → "Main story".
      const mainLabel = page
        .locator('[data-testid^="timeline-track-label-"]', {
          hasText: 'Main track',
        })
        .first();
      await mainLabel.click();

      const input = page.getByTestId('rename-input');
      await expect(input).toBeVisible();
      await expect(input).toHaveValue('Main track');
      await input.clear();
      await input.fill('Main story');
      await page.getByTestId('rename-confirm-button').click();
      await expect(page.getByTestId('rename-input')).toHaveCount(0);

      await expect(
        page.locator('[data-testid^="timeline-track-label-"]', {
          hasText: 'Main story',
        })
      ).toBeVisible();
    });

    await test.step('event dialog track dropdown contains custom tracks', async () => {
      await page.getByTestId('timeline-add-event').click();
      await page.getByTestId('timeline-event-track').click();

      const villainsOption = page
        .locator('[data-testid^="timeline-track-option-"]')
        .filter({ hasText: 'Villains' });
      await expect(villainsOption).toBeVisible();

      // Close the dialog without saving so the next step starts clean if added.
      await page.keyboard.press('Escape');
    });
  });

  test('events: add via dialog, zoom changes ticks, persist across reload', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    await test.step('add event via dialog renders pill and clears empty state', async () => {
      await page.getByTestId('timeline-add-event').click();

      const titleInput = page.getByTestId('timeline-event-title');
      await titleInput.waitFor({ state: 'visible' });
      await titleInput.click();
      await titleInput.fill('First event');
      await expect(titleInput).toHaveValue('First event');
      await page.getByTestId('timeline-event-start-date').fill('2024-01-01');

      // Wait for OnPush CD to propagate form validity before clicking.
      await expect(page.getByTestId('timeline-event-save')).toBeEnabled();
      await page.getByTestId('timeline-event-save').click();

      await expect(
        page.locator('[data-testid^="timeline-event-"]').first()
      ).toBeVisible();
      await expect(page.getByTestId('timeline-empty')).toHaveCount(0);
    });

    await test.step('zoom-in changes the tick label set', async () => {
      const beforeLabels = await page
        .getByTestId('tick-label')
        .allTextContents();

      await page.getByTestId('timeline-zoom-in').click();
      await page.getByTestId('timeline-zoom-in').click();

      await expect(async () => {
        const afterLabels = await page
          .getByTestId('tick-label')
          .allTextContents();
        expect(
          beforeLabels.join('|') !== afterLabels.join('|') ||
            beforeLabels.length !== afterLabels.length
        ).toBeTruthy();
      }).toPass({ timeout: 5000 });
    });

    await test.step('add a second event then verify both persist after reload', async () => {
      await page.getByTestId('timeline-add-event').click();
      const titleInput = page.getByTestId('timeline-event-title');
      await titleInput.waitFor({ state: 'visible' });
      await titleInput.click();
      await titleInput.fill('Persisted event');
      await expect(titleInput).toHaveValue('Persisted event');
      await page.getByTestId('timeline-event-start-date').fill('2024-06-15');
      await expect(page.getByTestId('timeline-event-save')).toBeEnabled();
      await page.getByTestId('timeline-event-save').click();

      const pill = page
        .locator('[data-testid^="timeline-event-body-"]')
        .first();
      await expect(pill).toBeVisible();

      // Reload the page; the timeline must come back populated.
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      await expect(page.getByTestId('timeline-svg-top')).toBeVisible();
      await expect(page.getByTestId('timeline-empty')).toHaveCount(0);
      await expect(
        page.locator('[data-testid^="timeline-event-body-"]').first()
      ).toBeVisible();
    });
  });
});
