import {
  expect,
  getApiBaseUrl,
  openUserSettings,
  type Page,
  test,
} from './fixtures';

/**
 * The "No AI / Allow AI" choice is kept on the server account, so it follows
 * the user to every device. A "new device" here is the same signed-in page
 * with this browser's copy of the choice wiped.
 */

function sessionToken(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('srv:server-1:auth_token'));
}

async function accountChoice(page: Page): Promise<boolean | null | undefined> {
  const token = await sessionToken(page);
  const response = await page.request.get(
    `${getApiBaseUrl()}/api/v1/users/me`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return ((await response.json()) as { aiAllowed?: boolean | null }).aiAllowed;
}

function browserChoice(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('inkweld-ai'));
}

async function forgetBrowserChoice(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('inkweld-ai');
    localStorage.removeItem('inkweld-ai-unsynced');
  });
}

test.describe('AI preference across devices', () => {
  test('Allow AI chosen in Settings comes back on a new device', async ({
    authenticatedPage: page,
  }) => {
    expect(await accountChoice(page)).toBeNull();

    await openUserSettings(page);
    await page.getByRole('tab', { name: 'General settings' }).click();
    await page.getByTestId('ai-preference-allow').click();

    await expect.poll(() => accountChoice(page)).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('inkweld-ai-unsynced'))
      )
      .toBeNull();

    await forgetBrowserChoice(page);
    await page.reload();
    await expect(page.getByTestId('user-menu-button')).toBeVisible();

    await expect.poll(() => browserChoice(page)).toBe('allow');
    await openUserSettings(page);
    await page.getByRole('tab', { name: 'General settings' }).click();
    await expect(page.getByTestId('ai-preference-allow')).toHaveClass(
      /mat-button-toggle-checked/
    );
  });

  test('No AI chosen on another device replaces this browser’s Allow AI', async ({
    authenticatedPage: page,
  }) => {
    await page.evaluate(() => localStorage.setItem('inkweld-ai', 'allow'));
    await page.reload();
    // An account that never chose takes this browser's choice.
    await expect.poll(() => accountChoice(page)).toBe(true);

    // Another device switches the account to No AI.
    const token = await sessionToken(page);
    const patched = await page.request.patch(
      `${getApiBaseUrl()}/api/v1/users/me`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: { aiAllowed: false },
      }
    );
    expect(patched.ok()).toBe(true);

    await page.reload();
    await expect(page.getByTestId('user-menu-button')).toBeVisible();
    await expect.poll(() => browserChoice(page)).toBe('none');
  });
});
