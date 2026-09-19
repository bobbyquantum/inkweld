/**
 * Project Cover Open — picking a project up (Local Mode)
 *
 * Clicking a project in the grid does not open it. Its cover is lifted out
 * and shown beside the project's details, and a second, deliberate press
 * takes the reader in; backing out puts the cover down again. The pieces are
 * unit tested — what this covers is the wiring between them: the overlay is
 * mounted in the app shell, the home page hands it the card that was clicked,
 * and both ways out lead where they should.
 *
 * The suite runs with prefers-reduced-motion, which the overlay honours by
 * arriving at each state at once rather than travelling to it. The states
 * themselves are the point here, so that is left alone.
 */
import { expect, test } from './fixtures';

test.describe('Project cover open', () => {
  test('should show the project beside its cover before opening it', async ({
    localPageWithProject: page,
  }) => {
    const overlay = page.getByTestId('project-cover-open');
    await expect(overlay).toBeHidden();

    await page.getByTestId('project-card').first().click();

    // Picked up, not opened: still on the grid's URL, with the project's
    // details beside the cover.
    await expect(overlay).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('cover-open-details')).toContainText(
      'Test Project'
    );

    await page.getByTestId('cover-open-begin').click();

    await page.waitForURL(/\/testuser\/test-project/);
    await expect(overlay).toBeHidden();
    await expect(page.getByTestId('project-tree')).toBeVisible();
  });

  test('should put the cover back when the reader backs out', async ({
    localPageWithProject: page,
  }) => {
    const overlay = page.getByTestId('project-cover-open');

    await page.getByTestId('project-card').first().click();
    await expect(overlay).toBeVisible();

    await page.getByTestId('cover-open-close').click();

    await expect(overlay).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('project-card').first()).toBeVisible();
  });

  test('should go in on a click anywhere over the cover', async ({
    localPageWithProject: page,
  }) => {
    await page.getByTestId('project-card').first().click();
    await expect(page.getByTestId('project-cover-open')).toBeVisible();

    // Anywhere that is not the close button is a way in.
    await page
      .getByTestId('project-cover-open')
      .click({ position: { x: 5, y: 400 } });

    await page.waitForURL(/\/testuser\/test-project/);
    await expect(page.getByTestId('project-tree')).toBeVisible();
  });
});
