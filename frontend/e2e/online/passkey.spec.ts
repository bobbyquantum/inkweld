import type { CDPSession } from '@playwright/test';

import { expect, type Page, test } from './fixtures';

/**
 * E2E coverage for the WebAuthn / passkey flows.
 *
 * Uses Chromium's CDP virtual authenticator so the browser produces real
 * WebAuthn assertions without any user interaction. The fake authenticator
 * is configured as an "internal" platform credential with resident keys
 * enabled, which mirrors a typical phone / laptop biometric setup.
 */

interface VirtualAuthenticator {
  cdp: CDPSession;
  authenticatorId: string;
}

async function attachVirtualAuthenticator(
  page: Page
): Promise<VirtualAuthenticator> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    }
  );
  return { cdp, authenticatorId };
}

async function detachVirtualAuthenticator(
  va: VirtualAuthenticator
): Promise<void> {
  try {
    await va.cdp.send('WebAuthn.removeVirtualAuthenticator', {
      authenticatorId: va.authenticatorId,
    });
  } catch {
    // best-effort cleanup
  }
  await va.cdp.detach().catch(() => {});
}

test.describe('Passkeys', () => {
  test('register a passkey from account settings, then sign in with it', async ({
    authenticatedPage,
  }) => {
    const va = await attachVirtualAuthenticator(authenticatedPage);

    try {
      // Navigate to the account settings page where the passkeys section
      // lives.
      await authenticatedPage.goto('/settings');
      await expect(
        authenticatedPage.getByTestId('passkeys-settings')
      ).toBeVisible();

      // Initially there should be no passkeys.
      await expect(
        authenticatedPage.getByTestId('passkeys-empty')
      ).toBeVisible();

      // Register one - the virtual authenticator auto-confirms the prompt.
      await authenticatedPage.getByTestId('add-passkey-button').click();

      // Once registration succeeds the empty state is replaced by a list
      // containing exactly one item.
      await expect(authenticatedPage.getByTestId('passkey-list')).toBeVisible();
      const items = authenticatedPage
        .getByTestId('passkey-list')
        .locator('mat-card');
      await expect(items).toHaveCount(1);

      // Capture the test credentials so we can sign back in via UI later.
      // @ts-expect-error - Dynamic property attached by the fixture.
      const { username } = authenticatedPage.testCredentials as {
        username: string;
      };

      // ─── Sign out and try logging back in with the passkey ───────────
      // Trigger logout via UI rather than mucking with localStorage so all
      // in-memory state (signals, cached user, etc.) is properly reset.
      // The virtual authenticator's resident credentials live in the CDP
      // session, not the browser context, so they survive logout.
      // Navigate home first — the settings page has its own toolbar
      // without the user menu.
      await authenticatedPage.goto('/');
      const userMenuButton = authenticatedPage.locator(
        '[data-testid="user-menu-button"]'
      );
      await expect(userMenuButton).toBeVisible();
      await userMenuButton.click();
      await authenticatedPage
        .getByRole('menuitem', { name: /log out|logout|sign out/i })
        .click();

      // After logout the welcome screen surfaces a login button.
      const welcomeLogin = authenticatedPage.getByTestId(
        'welcome-login-button'
      );
      await expect(welcomeLogin).toBeVisible();
      await welcomeLogin.click();

      const dialog = authenticatedPage.getByTestId('login-dialog');
      await expect(dialog).toBeVisible();

      const passkeyButton = authenticatedPage.getByTestId(
        'passkey-login-button'
      );
      await expect(passkeyButton).toBeVisible();
      await passkeyButton.click();

      // After a successful passkey login the dialog closes and the user
      // menu becomes available — same heuristic the auth fixture uses.
      await expect(dialog).toBeHidden();
      await expect(
        authenticatedPage.locator('[data-testid="user-menu-button"]')
      ).toBeVisible();

      // And the JWT is back in localStorage under the per-server prefix.
      const token = await authenticatedPage.evaluate(() =>
        localStorage.getItem('srv:server-1:auth_token')
      );
      expect(token).toBeTruthy();

      // Sanity check: the user we logged in as matches the one whose
      // passkey we registered. The username appears in multiple places
      // (snackbar, menu name, menu @handle) — `.first()` is enough.
      await authenticatedPage
        .locator('[data-testid="user-menu-button"]')
        .click();
      await expect(authenticatedPage.getByText(username).first()).toBeVisible();
    } finally {
      await detachVirtualAuthenticator(va);
    }
  });

  test('delete a registered passkey', async ({ authenticatedPage }) => {
    const va = await attachVirtualAuthenticator(authenticatedPage);
    try {
      await authenticatedPage.goto('/settings');
      await authenticatedPage.getByTestId('add-passkey-button').click();

      const items = authenticatedPage
        .getByTestId('passkey-list')
        .locator('mat-card');
      await expect(items).toHaveCount(1);

      const deleteButton = items
        .first()
        .locator('[data-testid^="delete-passkey-"]');
      await deleteButton.click();

      // Confirmation dialog is rendered as a Material dialog.
      const confirmButton = authenticatedPage
        .locator('mat-dialog-container')
        .getByRole('button', { name: /delete/i });
      await expect(confirmButton).toBeVisible();
      await confirmButton.click();

      await expect(
        authenticatedPage.getByTestId('passkeys-empty')
      ).toBeVisible();
    } finally {
      await detachVirtualAuthenticator(va);
    }
  });

  test('rename a registered passkey', async ({ authenticatedPage }) => {
    const va = await attachVirtualAuthenticator(authenticatedPage);
    try {
      await authenticatedPage.goto('/settings');
      await authenticatedPage.getByTestId('add-passkey-button').click();

      const items = authenticatedPage
        .getByTestId('passkey-list')
        .locator('mat-card');
      await expect(items).toHaveCount(1);

      // Click the rename button on the first passkey card.
      const renameButton = items
        .first()
        .locator('[data-testid^="rename-passkey-"]');
      await renameButton.click();

      // The rename dialog should appear — fill in the new name.
      const dialog = authenticatedPage.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      const input = dialog.locator('input');
      await input.clear();
      await input.fill('My renamed key');
      await dialog
        .getByRole('button', { name: /save|rename|ok|confirm/i })
        .click();

      // The updated name should appear in the list.
      await expect(items.first()).toContainText('My renamed key');

      // Reload and verify the name persists.
      await authenticatedPage.goto('/settings');
      await expect(
        authenticatedPage
          .getByTestId('passkey-list')
          .locator('mat-card')
          .first()
      ).toContainText('My renamed key');
    } finally {
      await detachVirtualAuthenticator(va);
    }
  });
});
