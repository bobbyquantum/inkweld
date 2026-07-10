/**
 * Timeline Auto-Build from Elements - Local E2E Test
 *
 * Verifies that the "Auto-build from elements" button scans worldbuilding
 * elements for date fields and generates timeline events automatically.
 *
 * Uses the worldbuilding-demo template which ships with pre-populated
 * character date-of-birth fields (e.g. Elara Nightwhisper: 1198-5-12).
 */

import { type Page } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, test } from './fixtures';

async function createTimelineAndCommit(page: Page): Promise<string> {
  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-timeline').click();

  const nameInput = page.getByTestId('element-name-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill('Auto Build Timeline');
  await page.getByTestId('create-element-button').click();

  await expect(
    page.getByTestId('element-Auto Build Timeline')
  ).toBeVisible();

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

  await page.goto(timelineUrl);
  await expect(page.getByTestId('timeline-setup')).toBeVisible();
  await page.getByTestId('timeline-setup-commit').click();

  await expect(page.getByTestId('timeline-canvas')).toBeVisible();

  return timelineUrl;
}

test.describe('Timeline Auto-Build from Elements', () => {
  test('generates events from worldbuilding element date fields', async ({
    localPage: page,
  }) => {
    await createProjectWithTwoSteps(
      page,
      'Auto Build Test',
      'auto-build-test',
      undefined,
      'worldbuilding-demo'
    );

    await createTimelineAndCommit(page);

    await test.step('auto-build button is visible and enabled', async () => {
      const button = page.getByTestId('timeline-auto-build');
      await expect(button).toBeVisible();
      await expect(button).toBeEnabled();
    });

    await test.step('clicking auto-build generates timeline events', async () => {
      await page.getByTestId('timeline-auto-build').click();

      await expect(async () => {
        const events = page.locator('[data-testid^="timeline-event-body-"]');
        const count = await events.count();
        expect(count).toBeGreaterThan(0);
      }).toPass({ timeout: 10000 });

      await expect(page.getByTestId('timeline-empty')).toHaveCount(0);
    });

    await test.step('generated events persist after reload', async () => {
      const beforeCount = await page
        .locator('[data-testid^="timeline-event-body-"]')
        .count();

      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('timeline-svg-top')).toBeVisible();

      await expect(async () => {
        const afterCount = await page
          .locator('[data-testid^="timeline-event-body-"]')
          .count();
        expect(afterCount).toBe(beforeCount);
      }).toPass({ timeout: 10000 });
    });

    await test.step('re-running auto-build is idempotent (no duplicates)', async () => {
      const beforeCount = await page
        .locator('[data-testid^="timeline-event-body-"]')
        .count();

      await page.getByTestId('timeline-auto-build').click();

      await expect(async () => {
        const afterCount = await page
          .locator('[data-testid^="timeline-event-body-"]')
          .count();
        expect(afterCount).toBe(beforeCount);
      }).toPass({ timeout: 10000 });
    });

    await test.step('manual events are preserved alongside auto-built ones', async () => {
      await page.getByTestId('timeline-add-event').click();
      const titleInput = page.getByTestId('timeline-event-title');
      await titleInput.waitFor({ state: 'visible' });
      await titleInput.fill('Manual Event');
      await page.getByTestId('timeline-event-start-date').fill('1200-01-01');
      await expect(page.getByTestId('timeline-event-save')).toBeEnabled();
      await page.getByTestId('timeline-event-save').click();

      const manualPill = page
        .locator('[data-testid^="timeline-event-body-"]')
        .filter({ hasText: 'Manual Event' });
      await expect(manualPill).toBeVisible();

      await page.getByTestId('timeline-auto-build').click();

      await expect(manualPill).toBeVisible();
    });
  });
});