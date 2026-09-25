import { expect, type Page, test } from './fixtures';

/**
 * E2E coverage for the hosted legal pages (/privacy, /terms) and the links to
 * them on pages reachable before sign-in.
 *
 * Runs against the shared backend. Configuring the documents is harmless to
 * parallel specs — it only makes the legal links appear — because acceptance
 * is not required here. The acceptance flow flips an instance-wide flag, so it
 * lives in policy-acceptance.spec.ts against its own backend.
 */

const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:9333';
/** Stand-in for an externally hosted policy; requests to it are intercepted. */
const EXTERNAL_TERMS_URL = 'https://legal.inkweld.test/terms';
const LEGAL_KEYS = [
  'PRIVACY_POLICY_CONTENT',
  'PRIVACY_POLICY_URL',
  'TERMS_OF_SERVICE_CONTENT',
  'TERMS_OF_SERVICE_URL',
] as const;

async function setConfig(
  adminPage: Page,
  key: string,
  value: string
): Promise<void> {
  const token = await adminPage.evaluate(() =>
    localStorage.getItem('srv:server-1:auth_token')
  );
  const response = await adminPage.request.put(
    `${API_BASE}/api/v1/admin/config/${key}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { value },
    }
  );
  expect(response.ok(), `set ${key}`).toBe(true);
}

test.describe('Hosted legal pages', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async ({ adminPage }) => {
    for (const key of LEGAL_KEYS) await setConfig(adminPage, key, '');
  });

  test('admin publishes a policy that anonymous visitors can read before signing in', async ({
    adminPage,
    anonymousPage,
  }) => {
    const marker = `marker-${Date.now()}`;

    await test.step('admin enters the policy text and a terms URL', async () => {
      await adminPage.goto('/admin/settings');
      const content = adminPage.getByTestId('privacy-policy-content-input');
      await content.fill(
        `# Test Privacy Policy\n\nWe keep only what you write. **${marker}**`
      );
      await content.blur();
      await expect(adminPage.getByText('Setting saved').first()).toBeVisible();

      const termsUrl = adminPage.getByTestId('terms-url-input');
      await termsUrl.fill(EXTERNAL_TERMS_URL);
      await termsUrl.blur();
      // Wait for the save to land before an anonymous client reads it.
      await expect
        .poll(async () => {
          const res = await anonymousPage.request.get(
            `${API_BASE}/api/v1/config/features`
          );
          const body = (await res.json()) as { hasTerms?: boolean };
          return body.hasTerms;
        })
        .toBe(true);
    });

    await test.step('landing page links to both documents', async () => {
      await anonymousPage.goto('/');
      await expect(anonymousPage.getByTestId('welcome-heading')).toBeVisible();
      const links = anonymousPage.getByTestId('legal-links');
      await expect(links).toBeVisible();
      await expect(links.getByTestId('legal-privacy-link')).toHaveAttribute(
        'href',
        '/privacy'
      );
      await expect(links.getByTestId('legal-terms-link')).toHaveAttribute(
        'href',
        '/terms'
      );
    });

    await test.step('the privacy link opens the hosted policy in a new tab', async () => {
      const [policyTab] = await Promise.all([
        anonymousPage.context().waitForEvent('page'),
        anonymousPage.getByTestId('legal-privacy-link').click(),
      ]);
      await expect(policyTab).toHaveURL(/\/privacy$/);
      const body = policyTab.getByTestId('legal-content');
      await expect(body.locator('h1')).toHaveText('Test Privacy Policy');
      await expect(body.locator('strong')).toHaveText(marker);
      // The page links across to the other document.
      await expect(policyTab.getByTestId('legal-other-link')).toHaveAttribute(
        'href',
        '/terms'
      );
      await policyTab.close();
    });

    await test.step('/terms redirects to the external URL', async () => {
      await anonymousPage.context().route(`${EXTERNAL_TERMS_URL}*`, route =>
        route.fulfill({
          contentType: 'text/html',
          body: '<h1 data-testid="external-terms">External terms</h1>',
        })
      );
      await anonymousPage.goto('/terms');
      await expect(anonymousPage).toHaveURL(EXTERNAL_TERMS_URL);
      await expect(anonymousPage.getByTestId('external-terms')).toBeVisible();
    });

    await test.step('login and registration dialogs show the links too', async () => {
      await anonymousPage.goto('/');
      await anonymousPage.getByTestId('welcome-login-button').click();
      const login = anonymousPage.getByTestId('login-dialog');
      await expect(login.getByTestId('legal-privacy-link')).toBeVisible();
      await anonymousPage.keyboard.press('Escape');

      await anonymousPage.getByTestId('welcome-register-button').click();
      const register = anonymousPage.getByTestId('register-dialog');
      await expect(register.getByTestId('legal-terms-link')).toBeVisible();
      // Acceptance is not required, so there is no checkbox.
      await expect(register.getByTestId('policy-acceptance')).toHaveCount(0);
    });
  });

  test('pages say so when no policy is published', async ({
    anonymousPage,
  }) => {
    await anonymousPage.goto('/privacy');
    await expect(
      anonymousPage.getByTestId('legal-not-configured')
    ).toBeVisible();

    await anonymousPage.goto('/');
    await expect(anonymousPage.getByTestId('welcome-heading')).toBeVisible();
    await expect(anonymousPage.getByTestId('legal-links')).toHaveCount(0);
  });
});
