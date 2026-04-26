import { expect, type Page, test } from './fixtures';

/**
 * E2E coverage for the "passwordless mode" flag (PASSWORD_LOGIN_ENABLED).
 *
 * Toggling this flag globally affects every other test running against the
 * same backend, so we are deliberately minimalist:
 *   1. Verify the admin settings page exposes the toggle and the related
 *      password-login card.
 *   2. Drive the flag directly via the admin API (mirroring the
 *      USER_APPROVAL_REQUIRED test pattern in admin.spec.ts) and confirm
 *      the registration form switches to its passwordless variant in an
 *      anonymous browser session.
 *   3. Restore the flag immediately so parallel tests are unaffected.
 *
 * The full passkey enrolment ceremony after registration is already covered
 * by passkey.spec.ts, so we don't repeat that here — we just assert the UI
 * mode switch.
 */

const API_BASE = 'http://localhost:9333';

async function setPasswordLoginFlag(
  adminPage: Page,
  enabled: boolean
): Promise<void> {
  const token = await adminPage.evaluate(() =>
    localStorage.getItem('srv:server-1:auth_token')
  );
  if (!token) {
    throw new Error(
      'setPasswordLoginFlag: admin auth token missing from localStorage. ' +
        'The adminPage fixture should have logged in before this helper runs.'
    );
  }
  const response = await adminPage.request.put(
    `${API_BASE}/api/v1/admin/config/PASSWORD_LOGIN_ENABLED`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { value: enabled ? 'true' : 'false' },
    }
  );
  if (!response.ok()) {
    throw new Error(
      `Failed to set PASSWORD_LOGIN_ENABLED=${enabled}: ${response.status()} ${await response.text()}`
    );
  }
}

test.describe('Passwordless mode (PASSWORD_LOGIN_ENABLED)', () => {
  // Serial: this flag is process-global. Running parallel registration tests
  // while it is flipped to false would fail those tests with 403.
  test.describe.configure({ mode: 'serial' });

  test('admin settings page exposes the password-login toggle', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/settings');
    await adminPage.waitForLoadState('networkidle');

    await expect(
      adminPage.locator('[data-testid="password-login-card"]')
    ).toBeVisible();
    await expect(
      adminPage.locator('[data-testid="setting-toggle-password-login"]')
    ).toBeVisible();
  });

  test('disabling password login switches the registration form to passwordless mode', async ({
    adminPage,
    anonymousPage,
  }) => {
    // Always ensure we restore the flag, even on failure.
    try {
      // Start from a known-good state.
      await setPasswordLoginFlag(adminPage, true);

      // Sanity: registration form shows password fields when the flag is on.
      await anonymousPage.goto('/');
      await anonymousPage.waitForLoadState('networkidle');
      await anonymousPage
        .locator('[data-testid="welcome-register-button"]')
        .click();
      await expect(anonymousPage.getByTestId('register-dialog')).toBeVisible();
      await expect(
        anonymousPage.locator('[data-testid="password-input"]')
      ).toBeVisible();

      // Close the dialog before flipping the flag.
      await anonymousPage.keyboard.press('Escape');
      await expect(anonymousPage.getByTestId('register-dialog')).toBeHidden();

      // Flip to passwordless.
      await setPasswordLoginFlag(adminPage, false);

      // Reload so the system-config signal picks up the new value.
      await anonymousPage.reload();
      await anonymousPage.waitForLoadState('networkidle');
      await anonymousPage
        .locator('[data-testid="welcome-register-button"]')
        .click();
      await expect(anonymousPage.getByTestId('register-dialog')).toBeVisible();

      // Password fields are gone, passwordless notice is shown.
      await expect(
        anonymousPage.locator('[data-testid="password-input"]')
      ).toHaveCount(0);
      await expect(
        anonymousPage.locator('[data-testid="confirm-password-input"]')
      ).toHaveCount(0);
      await expect(
        anonymousPage.locator(
          '[data-testid="passwordless-registration-notice"]'
        )
      ).toBeVisible();
    } finally {
      // Always restore — other tests register users via the password API.
      await setPasswordLoginFlag(adminPage, true);
    }
  });

  test('login dialog shows the "lost your passkey?" recovery link in passwordless mode', async ({
    adminPage,
    anonymousPage,
  }) => {
    // The recovery link is only rendered when password login is OFF and email
    // recovery is ON. EMAIL_RECOVERY_ENABLED is true in the docker e2e setup,
    // so we just need to flip PASSWORD_LOGIN_ENABLED.
    try {
      await setPasswordLoginFlag(adminPage, false);

      await anonymousPage.goto('/');
      await anonymousPage.waitForLoadState('networkidle');
      await anonymousPage
        .locator('[data-testid="welcome-login-button"]')
        .click();
      await expect(anonymousPage.getByTestId('login-dialog')).toBeVisible();

      const recoveryLink = anonymousPage.getByTestId('lost-passkey-link');
      await expect(recoveryLink).toBeVisible();
      await recoveryLink.click();
      await expect(anonymousPage).toHaveURL(/\/recover-passkey$/);
      await expect(
        anonymousPage.getByTestId('recover-passkey-page')
      ).toBeVisible();
    } finally {
      await setPasswordLoginFlag(adminPage, true);
    }
  });
});
