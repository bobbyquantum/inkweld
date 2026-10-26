/**
 * Templates list scrolling - Local Mode
 *
 * The Templates section of project settings used to clip its list at the
 * bottom of the window (a leftover wrapper from when the template editor
 * opened inside that section), so on a short screen the last templates could
 * not be reached. The list must scroll with the rest of the settings content.
 */
import { openProjectFromGrid } from '../common/test-helpers';
import { expect, test } from './fixtures';

test.describe('Templates list', () => {
  test('scrolls to the last template on a short screen', async ({
    localPageWithProject: page,
  }) => {
    // Wide enough for the sidenav layout, short enough that the list overflows.
    await page.setViewportSize({ width: 1280, height: 500 });
    await openProjectFromGrid(page);

    await page.getByTestId('sidebar-settings-button').click();
    await page.waitForURL(/\/settings$/);
    await page.getByTestId('nav-templates').click();

    const cards = page.getByTestId('template-card');
    await expect(cards.first()).toBeVisible();
    const lastCard = cards.last();
    await expect(lastCard).not.toBeInViewport();

    // Scroll with the mouse wheel, as a user would: a programmatic
    // scrollIntoView also moves overflow-hidden boxes, so it can't catch this.
    await page.getByTestId('templates-list').hover();
    await expect(async () => {
      await page.mouse.wheel(0, 400);
      await expect(lastCard).toBeInViewport({ timeout: 500 });
    }).toPass({ timeout: 5000 });
  });
});
