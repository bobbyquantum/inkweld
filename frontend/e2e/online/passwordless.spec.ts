import {
  canStartIsolatedBackend,
  type IsolatedBackend,
  openAppOn,
  signInAsAdmin,
  startIsolatedBackend,
} from '../common/isolated-backend';
import { expect, test } from './fixtures';

/**
 * E2E coverage for the "passwordless mode" flag (PASSWORD_LOGIN_ENABLED).
 *
 * The flag is instance-wide, and putting it back afterwards doesn't undo the
 * damage: while it is off, the server refuses password sign-ins and ignores
 * the password in a registration. An account a parallel spec registers in that
 * moment has no password, so the spec fails later with "Invalid credentials".
 * Anything that switches the flag therefore runs against a private backend.
 *
 * The full passkey enrolment ceremony after registration is already covered
 * by passkey.spec.ts, so we don't repeat that here — we just assert the UI
 * mode switch.
 */

let backend: IsolatedBackend;
let adminToken: string;

async function setPasswordLogin(enabled: boolean): Promise<void> {
  const res = await fetch(
    `${backend.url}/api/v1/admin/config/PASSWORD_LOGIN_ENABLED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value: enabled ? 'true' : 'false' }),
    }
  );
  expect(res.ok, `set PASSWORD_LOGIN_ENABLED=${enabled}`).toBe(true);
}

test.describe('Passwordless mode (PASSWORD_LOGIN_ENABLED)', () => {
  // Only reads the settings page, so it is safe on the shared backend and
  // keeps some coverage of the flag on the configs that can't start a private
  // one.
  test('admin settings page exposes the password-login toggle', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/settings');

    await expect(adminPage.getByTestId('password-login-card')).toBeVisible();
    await expect(
      adminPage.getByTestId('setting-toggle-password-login')
    ).toBeVisible();
  });

  test.describe('switching it', () => {
    // Skipped outside the online config: the instance-wide flag needs a
    // private Bun backend, which only that config can start.
    test.skip(
      !canStartIsolatedBackend(),
      'Needs a private Bun backend; only the online config can start one'
    );
    // Serial: both tests switch the flag on this file's backend.
    test.describe.configure({ mode: 'serial' });

    test.beforeAll(async () => {
      // The "lost your passkey?" link also needs email recovery on.
      backend = await startIsolatedBackend({ EMAIL_RECOVERY_ENABLED: 'true' });
      adminToken = await signInAsAdmin(backend);
    });

    test.afterAll(async () => {
      await backend?.stop();
    });

    test('disabling password login switches the registration form to passwordless mode', async ({
      browser,
    }) => {
      await setPasswordLogin(true);
      const page = await openAppOn(browser, backend);

      // Sanity: registration form shows password fields when the flag is on.
      await page.goto('/');
      await page.getByTestId('welcome-register-button').click();
      await expect(page.getByTestId('register-dialog')).toBeVisible();
      await expect(page.getByTestId('password-input')).toBeVisible();

      // Close the dialog before flipping the flag.
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('register-dialog')).toBeHidden();

      // Flip to passwordless.
      await setPasswordLogin(false);

      // Reload so the system-config signal picks up the new value.
      await page.reload();
      await page.getByTestId('welcome-register-button').click();
      await expect(page.getByTestId('register-dialog')).toBeVisible();

      // Password fields are gone, passwordless notice is shown.
      await expect(page.getByTestId('password-input')).toHaveCount(0);
      await expect(page.getByTestId('confirm-password-input')).toHaveCount(0);
      await expect(
        page.getByTestId('passwordless-registration-notice')
      ).toBeVisible();

      await page.context().close();
    });

    test('login dialog shows the "lost your passkey?" recovery link in passwordless mode', async ({
      browser,
    }) => {
      // The recovery link is only rendered when password login is OFF and
      // email recovery is ON.
      await setPasswordLogin(false);
      const page = await openAppOn(browser, backend);

      await page.goto('/');
      await page.getByTestId('welcome-login-button').click();
      await expect(page.getByTestId('login-dialog')).toBeVisible();

      const recoveryLink = page.getByTestId('lost-passkey-link');
      await expect(recoveryLink).toBeVisible();
      await recoveryLink.click();
      await expect(page).toHaveURL(/\/recover-passkey$/);
      await expect(page.getByTestId('recover-passkey-page')).toBeVisible();

      await page.context().close();
    });
  });
});
