/**
 * Project Cover Open — Book Transition (Local Mode)
 *
 * Opening a project from the grid plays a transition across the two pages:
 * the clicked cover is redrawn over its card, the page fades to black, the
 * cover flies to its stage and swings open on its spine to uncover the
 * editor. The pieces are unit tested; what this covers is the wiring between
 * them — the overlay is mounted in the app shell, the home page hands it the
 * card that was clicked, and it takes itself off the screen afterwards.
 *
 * The suite runs with prefers-reduced-motion, which turns the transition off
 * by design, so this spec asks for motion back.
 */
import { expect, test } from './fixtures';

test.use({ reducedMotion: 'no-preference' });

test.describe('Project cover open', () => {
  test('should open a project by turning its cover, then clear itself', async ({
    localPageWithProject: page,
  }) => {
    const overlay = page.getByTestId('project-cover-open');
    await expect(overlay).toBeHidden();

    await page.getByTestId('project-card').first().click();

    // The cover is drawn over the card before it moves, and the transition
    // outlives the home page it was launched from.
    await expect(overlay).toBeVisible({ timeout: 5000 });
    await page.waitForURL(/\/testuser\/test-project/);
    await expect(overlay).toBeVisible();

    // It lets go of the page once the book is open.
    await expect(overlay).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId('project-tree')).toBeVisible();
  });
});
