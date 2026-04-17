/**
 * Timeline Element E2E Tests - Local Mode
 *
 * Verifies that the Timeline element type works end-to-end:
 *   - Creating a timeline element opens the timeline tab
 *   - Toolbar, SVG canvas, empty state render correctly
 *   - Events can be added through the event dialog and appear on the timeline
 *   - Tracks can be added
 *   - Zoom controls respond
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
  test('creates a timeline element and opens the timeline tab', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);
    await expect(page).toHaveURL(/timeline\/.+/);
    await expect(page.getByTestId('timeline-toolbar')).toBeVisible();
    await expect(page.getByTestId('timeline-svg')).toBeVisible();
  });

  test('shows the empty-state hint when the timeline has no events', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);
    await expect(page.getByTestId('timeline-empty')).toBeVisible();
  });

  test('can add a new event via the dialog and render it on the timeline', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    // Open the add-event dialog
    await page.getByTestId('timeline-add-event').click();

    // Fill the form (Gregorian default → format "Y-M-D")
    await page.getByTestId('timeline-event-title').fill('First event');
    await page.getByTestId('timeline-event-start').fill('2024-1-1');

    await page.getByTestId('timeline-event-save').click();

    // Event pill should appear
    await expect(
      page.locator('[data-testid^="timeline-event-"]').first()
    ).toBeVisible();

    // Empty state should be gone
    await expect(page.getByTestId('timeline-empty')).toHaveCount(0);
  });

  test('can add additional tracks via the toolbar', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    // Existing tracks ("Main track" by default)
    const countBefore = await page
      .locator('[data-testid^="timeline-event-"]')
      .count();
    expect(countBefore).toBe(0);

    await page.getByTestId('timeline-add-track').click();
    // The in-app rename dialog opens with a suggested track name; accept it.
    await expect(page.getByTestId('rename-input')).toBeVisible();
    await page.getByTestId('rename-confirm-button').click();
    // No visual assertion needed for the track itself — it's in the SVG.
    // Confirm the UI is still responsive by clicking add-event.
    await page.getByTestId('timeline-add-event').click();

    // Track dropdown inside the dialog must now show at least 2 options.
    await page.getByTestId('timeline-event-track').click();
    const options = page.locator('[data-testid^="timeline-track-option-"]');
    await expect(options).toHaveCount(2);
  });

  test('zoom in button changes the tick span', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    // Click zoom-in twice; test that the tick labels change.
    const beforeLabels = await page.getByTestId('tick-label').allTextContents();

    await page.getByTestId('timeline-zoom-in').click();
    await page.getByTestId('timeline-zoom-in').click();

    // Wait for the tick labels to change after zoom.
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

  test('prompts for a track name when adding a new track', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    await page.getByTestId('timeline-add-track').click();

    // The in-app rename dialog opens; default value is the suggested name.
    const input = page.getByTestId('rename-input');
    await expect(input).toBeVisible();
    await input.fill('Villains');
    await page.getByTestId('rename-confirm-button').click();

    // A label with the new name should render inside the track column.
    const label = page.locator('[data-testid^="timeline-track-label-"]', {
      hasText: 'Villains',
    });
    await expect(label).toBeVisible();
  });

  test('click on a track label prompts to rename the track', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    const firstLabel = page
      .locator('[data-testid^="timeline-track-label-"]')
      .first();
    await firstLabel.click();

    const input = page.getByTestId('rename-input');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('Main track');
    await input.fill('Main story');
    await page.getByTestId('rename-confirm-button').click();

    await expect(
      page.locator('[data-testid^="timeline-track-label-"]', {
        hasText: 'Main story',
      })
    ).toBeVisible();
  });

  test('persists events after a page refresh', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    // Add an event.
    await page.getByTestId('timeline-add-event').click();
    await page.getByTestId('timeline-event-title').fill('Persisted event');
    await page.getByTestId('timeline-event-start').fill('2024-6-15');
    await page.getByTestId('timeline-event-save').click();

    const pill = page.locator('[data-testid^="timeline-event-body-"]').first();
    await expect(pill).toBeVisible();

    // Reload the page; the timeline must come back populated.
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByTestId('timeline-svg-top')).toBeVisible();
    // Empty-state must NOT appear; the persisted event pill must render.
    await expect(page.getByTestId('timeline-empty')).toHaveCount(0);
    await expect(
      page.locator('[data-testid^="timeline-event-body-"]').first()
    ).toBeVisible();
  });

  test('has sticky top and bottom timeline bands around a scrollable track area', async ({
    localPageWithProject: page,
  }) => {
    await createTimelineAndOpen(page);

    // The top, scroll, and bottom containers should all be present.
    await expect(page.getByTestId('timeline-svg-top')).toBeVisible();
    await expect(page.getByTestId('timeline-tracks-scroll')).toBeVisible();
    await expect(page.getByTestId('timeline-svg-bottom')).toBeVisible();
  });
});
