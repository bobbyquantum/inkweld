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
  /**
   * Full passkey lifecycle on a single virtual authenticator + single
   * registered credential: register, rename, sign-out/sign-in roundtrip,
   * then delete. Replaces three previously-separate tests that each ran
   * the full authenticator + register dance.
   */
  test('passkey lifecycle: register, rename, sign-in, delete', async ({
    authenticatedPage,
  }) => {
    const va = await attachVirtualAuthenticator(authenticatedPage);

    try {
      await test.step('registers a passkey from account settings', async () => {
        await authenticatedPage.goto('/settings');
        await expect(
          authenticatedPage.getByTestId('passkeys-settings')
        ).toBeVisible();
        await expect(
          authenticatedPage.getByTestId('passkeys-empty')
        ).toBeVisible();

        await authenticatedPage.getByTestId('add-passkey-button').click();

        await expect(
          authenticatedPage.getByTestId('passkey-list')
        ).toBeVisible();
        const items = authenticatedPage
          .getByTestId('passkey-list')
          .locator('mat-card');
        await expect(items).toHaveCount(1);
      });

      await test.step('renames the registered passkey and persists across reload', async () => {
        const items = authenticatedPage
          .getByTestId('passkey-list')
          .locator('mat-card');

        const renameButton = items
          .first()
          .locator('[data-testid^="rename-passkey-"]');
        await renameButton.click();

        const dialog = authenticatedPage.locator('mat-dialog-container');
        await expect(dialog).toBeVisible();
        const input = dialog.locator('input');
        await input.clear();
        await input.fill('My renamed key');
        await dialog
          .getByRole('button', { name: /save|rename|ok|confirm/i })
          .click();

        await expect(items.first()).toContainText('My renamed key');

        await authenticatedPage.goto('/settings');
        await expect(
          authenticatedPage
            .getByTestId('passkey-list')
            .locator('mat-card')
            .first()
        ).toContainText('My renamed key');
      });

      await test.step('signs out and signs back in using the passkey', async () => {
        // @ts-expect-error - Dynamic property attached by the fixture.
        const { username } = authenticatedPage.testCredentials as {
          username: string;
        };

        // Trigger logout via UI so all in-memory state resets.
        // The virtual authenticator's resident credentials live in the CDP
        // session and survive logout.
        await authenticatedPage.goto('/');
        const userMenuButton = authenticatedPage.locator(
          '[data-testid="user-menu-button"]'
        );
        await expect(userMenuButton).toBeVisible();
        await userMenuButton.click();
        await authenticatedPage
          .getByRole('menuitem', { name: /log out|logout|sign out/i })
          .click();

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

        await expect(dialog).toBeHidden();
        await expect(
          authenticatedPage.locator('[data-testid="user-menu-button"]')
        ).toBeVisible();

        const token = await authenticatedPage.evaluate(() =>
          localStorage.getItem('srv:server-1:auth_token')
        );
        expect(token).toBeTruthy();

        await authenticatedPage
          .locator('[data-testid="user-menu-button"]')
          .click();
        await expect(
          authenticatedPage.getByText(username).first()
        ).toBeVisible();
        // Close the user menu so the next step's clicks aren't intercepted.
        await authenticatedPage.keyboard.press('Escape');
      });

      await test.step('deletes the passkey (back to empty state)', async () => {
        await authenticatedPage.goto('/settings');
        const items = authenticatedPage
          .getByTestId('passkey-list')
          .locator('mat-card');
        await expect(items).toHaveCount(1);

        const deleteButton = items
          .first()
          .locator('[data-testid^="delete-passkey-"]');
        await deleteButton.click();

        const confirmButton = authenticatedPage
          .locator('mat-dialog-container')
          .getByRole('button', { name: /delete/i });
        await expect(confirmButton).toBeVisible();
        await confirmButton.click();

        await expect(
          authenticatedPage.getByTestId('passkeys-empty')
        ).toBeVisible();
      });
    } finally {
      await detachVirtualAuthenticator(va);
    }
  });
});
