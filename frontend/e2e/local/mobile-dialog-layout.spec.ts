/**
 * Mobile Dialog Layout Tests - Local Mode
 *
 * Regression tests: dialog contents used to hardcode min-widths (300–600px)
 * that overflowed phone viewports, where Material caps the dialog pane at
 * calc(100vw - 32px) (≤599px screens). The snapshot dialogs have their own
 * coverage in snapshot.spec.ts; this spec covers the other high-traffic
 * dialogs.
 *
 * Setup runs at the default desktop viewport so navigation flows are
 * unaffected; the viewport is then shrunk to phone sizes (390px, then
 * 320px) before opening the dialogs. Each fit assertion is shared via
 * expectDialogFitsViewport (e2e/common/test-helpers.ts).
 */
import { expectDialogFitsViewport } from '../common/test-helpers';
import { expect, test } from './fixtures';

test.describe('Mobile Dialog Layout', () => {
  test('new-element and import-project dialogs fit phone viewports', async ({
    localPageWithProject: page,
  }) => {
    await test.step('import project dialog fits the viewport', async () => {
      // Navigate at desktop width: the mobile layout hides the settings
      // sidebar behind a hamburger, which is not what is under test here.
      await page.getByTestId('project-card').first().click();
      await page.waitForURL(/\/.+\/.+/);

      await page.getByTestId('sidebar-settings-button').click();
      await expect(page.getByTestId('settings-tab-content')).toBeVisible();
      await page.getByTestId('nav-actions').click();

      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByTestId('import-project-button').click();
      await expect(page.getByTestId('import-drop-zone')).toBeVisible();
      await expectDialogFitsViewport(page, 'import-drop-zone');
      await page.getByTestId('import-cancel-button').click();
      await expect(page.getByTestId('import-drop-zone')).not.toBeVisible();
    });

    // At phone width the project sidebar sits behind the mobile hamburger.
    const mobileMenu = page
      .locator('mat-toolbar.mobile-toolbar button[mat-icon-button]')
      .first();

    await test.step('new-element dialog name step fits the viewport', async () => {
      await mobileMenu.click();
      await page.getByTestId('create-new-element').click();
      await page.getByTestId('element-type-item').click();
      await page
        .getByTestId('element-name-input')
        .waitFor({ state: 'visible' });
      await expectDialogFitsViewport(page, 'element-name-input');
      await page.getByTestId('element-name-input').fill('Mobile Dialog Test');

      await page.getByTestId('create-element-button').click();
      await expect(
        page.getByTestId('element-Mobile Dialog Test')
      ).toBeVisible();
      // The mobile sidenav stays open in overlay mode; close it so it
      // doesn't intercept the next interaction.
      await page.keyboard.press('Escape');
    });

    await test.step('name step still fits an iPhone SE-class viewport', async () => {
      // The dialog is closed after creation; reopen at 320px and check the
      // form step itself at the narrowest common phone width.
      await page.setViewportSize({ width: 320, height: 568 });
      await mobileMenu.click();
      await page.getByTestId('create-new-element').click();
      await page.getByTestId('element-type-item').click();
      await page
        .getByTestId('element-name-input')
        .waitFor({ state: 'visible' });
      await expectDialogFitsViewport(page, 'element-name-input');
      await page.keyboard.press('Escape');
    });
  });
});
