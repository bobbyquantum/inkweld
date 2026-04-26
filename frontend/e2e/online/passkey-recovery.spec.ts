import { expect, test } from './fixtures';

/**
 * E2E coverage for the magic-link passkey recovery flow.
 *
 * Scope: request side only.
 *
 * The redemption side requires capturing the magic-link token that the
 * backend would email to the user, but the token is hashed at rest and
 * there is no test-only mailbox endpoint exposed in this codebase, so
 * driving an end-to-end redemption from a real e2e browser would require
 * scraping internal state. The redemption page itself is fully covered
 * by component unit tests (`recover-passkey-redeem.component.spec.ts`)
 * and by backend integration tests for the `/api/v1/passkey-recovery`
 * routes. What this spec adds is browser-level confirmation that the
 * pages render, route correctly, and gracefully handle the missing-token
 * case a real user might hit.
 */

test.describe('Passkey recovery (magic link)', () => {
  test('renders the recovery request page with the email form', async ({
    anonymousPage,
  }) => {
    await anonymousPage.goto('/recover-passkey');
    await anonymousPage.waitForLoadState('networkidle');

    await expect(
      anonymousPage.getByTestId('recover-passkey-page')
    ).toBeVisible();
    await expect(
      anonymousPage.getByTestId('recover-passkey-form')
    ).toBeVisible();
    await expect(
      anonymousPage.getByTestId('recover-email-input')
    ).toBeVisible();
    await expect(
      anonymousPage.getByTestId('recover-submit-button')
    ).toBeVisible();
  });

  test('submitting the recovery form shows the success state regardless of email', async ({
    anonymousPage,
  }) => {
    // The backend deliberately returns the same response whether or not
    // the email matches a real user (to avoid disclosing account existence).
    await anonymousPage.goto('/recover-passkey');
    await anonymousPage.waitForLoadState('networkidle');

    await anonymousPage
      .getByTestId('recover-email-input')
      .fill('nobody-special@example.com');
    await anonymousPage.getByTestId('recover-submit-button').click();

    await expect(anonymousPage.getByTestId('recover-success')).toBeVisible({
      timeout: 10000,
    });
  });

  test('redemption page shows the no-token error when visited without a token query param', async ({
    anonymousPage,
  }) => {
    await anonymousPage.goto('/recover-passkey/redeem');
    await anonymousPage.waitForLoadState('networkidle');

    await expect(
      anonymousPage.getByTestId('recover-passkey-redeem-page')
    ).toBeVisible();
    await expect(anonymousPage.getByTestId('redeem-no-token')).toBeVisible();
  });

  test('redemption page shows the redeem form when a (placeholder) token is supplied', async ({
    anonymousPage,
  }) => {
    // We use a deliberately-bogus token so the page renders the form but
    // any submission would fail validation server-side. We don't submit
    // here — that's covered by the unit tests.
    await anonymousPage.goto(
      '/recover-passkey/redeem?token=playwright-placeholder-token'
    );
    await anonymousPage.waitForLoadState('networkidle');

    await expect(
      anonymousPage.getByTestId('recover-passkey-redeem-page')
    ).toBeVisible();

    // Either the form is shown (browser supports WebAuthn — Chromium does)
    // or the unsupported state is shown (defensive). The no-token state
    // must NOT appear because we passed a token.
    await expect(anonymousPage.getByTestId('redeem-no-token')).toHaveCount(0);

    // Chromium in CI supports WebAuthn, so we expect the form.
    await expect(anonymousPage.getByTestId('redeem-form')).toBeVisible();
    await expect(anonymousPage.getByTestId('redeem-name-input')).toBeVisible();
    await expect(
      anonymousPage.getByTestId('redeem-submit-button')
    ).toBeVisible();
  });
});
