/**
 * About Page Tests - Local Mode
 *
 * Tests that verify the About page renders correctly and
 * navigation works in pure local mode without any server connection.
 *
 * Consolidated from 8 individual tests into a single grouped test using
 * `test.step()` since every assertion runs against the same `/about`
 * page state. The "back button" step runs last to avoid breaking the
 * page-level assertions earlier in the test.
 */
import { expect, test } from './fixtures';

test.describe('About Page', () => {
  test('about page renders all cards, version metadata, and back navigation', async ({
    localPage: page,
  }) => {
    await page.goto('/about');
    await page.waitForLoadState('domcontentloaded');

    await test.step('version card shows app name and version string', async () => {
      await expect(page.getByTestId('version-card')).toBeVisible();
      await expect(page.locator('h1')).toContainText('Inkweld');
      await expect(page.getByTestId('version-card')).toContainText(
        /Version \d/
      );
    });

    await test.step('version card shows copyright with the current year', async () => {
      const currentYear = new Date().getFullYear().toString();
      await expect(page.getByTestId('version-card')).toContainText(currentYear);
    });

    await test.step('version card has a changelog button', async () => {
      // It's a <button> with routerLink, not <a>.
      const changelogButton = page.getByRole('button', {
        name: /view changelog/i,
      });
      await expect(changelogButton).toBeVisible();
    });

    await test.step('libraries card lists key dependencies', async () => {
      const libraries = page.getByTestId('libraries-card');
      await expect(libraries).toBeVisible();
      await expect(libraries).toContainText('Angular');
      await expect(libraries).toContainText('Yjs');
      await expect(libraries).toContainText('ProseMirror');
    });

    await test.step('licenses card has a view-licenses button', async () => {
      await expect(page.getByTestId('licenses-card')).toBeVisible();
      await expect(page.getByTestId('view-licenses-button')).toBeVisible();
    });

    await test.step('links card has Source Code and Report Issues links', async () => {
      const links = page.getByTestId('links-card');
      await expect(links).toBeVisible();
      await expect(links).toContainText('Source Code');
      await expect(links).toContainText('Report Issues');
    });

    await test.step('back button navigates to the home page', async () => {
      await page.getByTestId('about-back-button').click();
      await expect(page).toHaveURL('/');
    });
  });
});
