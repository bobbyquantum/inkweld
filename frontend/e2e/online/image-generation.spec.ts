import { type Page } from '@playwright/test';

import { TEST_API_KEYS, TEST_PASSWORDS } from '../common/test-credentials';
import { createProject, expect, test } from './fixtures';

/**
 * AI Image Generation E2E Tests
 *
 * Verifies image-generation profile management and the user-facing
 * generation dialog workflow up to the point of pressing "Generate" —
 * which fails by design with the fake API key the suite installs.
 */

async function waitForDialogReady(page: Page): Promise<void> {
  await expect(
    page.locator('[data-testid="image-gen-dialog-content"]')
  ).toBeVisible();
  await expect(page.locator('mat-dialog-container mat-spinner')).toBeHidden();
  await expect(page.locator('.image-generation-stepper')).toBeVisible();
}

const FAKE_API_KEYS = {
  openai: TEST_API_KEYS.FAKE_OPENAI,
  openrouter: TEST_API_KEYS.FAKE_OPENROUTER,
  falai: TEST_API_KEYS.FAKE_FALAI,
};

const USER_TEST_PROFILE = {
  name: 'E2E-User-Test-OpenAI',
  description: 'Test profile for user e2e tests',
  provider: 'openai',
  modelId: 'gpt-image-1',
  supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
  defaultSize: '1024x1024',
};

function getApiBaseUrl(): string {
  return process.env['API_BASE_URL'] || 'http://localhost:9333';
}

async function setProviderApiKey(
  page: Page,
  providerId: string,
  apiKey: string
): Promise<void> {
  const token = await page.evaluate(() =>
    localStorage.getItem('srv:server-1:auth_token')
  );
  const response = await page.request.put(
    `${getApiBaseUrl()}/api/v1/ai/providers/${providerId}/key`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { apiKey },
    }
  );
  expect(response.ok()).toBe(true);
}

async function createImageProfile(
  page: Page,
  profile: {
    name: string;
    description: string;
    provider: string;
    modelId: string;
    supportedSizes: string[];
    defaultSize: string;
  }
): Promise<string> {
  const token = await page.evaluate(() =>
    localStorage.getItem('srv:server-1:auth_token')
  );
  const response = await page.request.post(
    `${getApiBaseUrl()}/api/v1/admin/image-profiles`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: profile.name,
        description: profile.description,
        provider: profile.provider,
        modelId: profile.modelId,
        enabled: true,
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: profile.supportedSizes,
        defaultSize: profile.defaultSize,
        sortOrder: 0,
      },
    }
  );

  if (response.status() === 409) {
    return 'existing';
  }

  expect(response.ok()).toBe(true);
  const data = await response.json();
  return data.id;
}

async function deleteImageProfileByName(
  page: Page,
  name: string
): Promise<void> {
  const token = await page.evaluate(() =>
    localStorage.getItem('srv:server-1:auth_token')
  );

  const listResponse = await page.request.get(
    `${getApiBaseUrl()}/api/v1/admin/image-profiles`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!listResponse.ok()) return;

  const profiles = await listResponse.json();
  const profile = profiles.find(
    (p: { name: string; id: string }) => p.name === name
  );

  if (profile) {
    await page.request.delete(
      `${getApiBaseUrl()}/api/v1/admin/image-profiles/${profile.id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  }
}

async function navigateToAdminViaMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  await page.locator('[data-testid="admin-menu-link"]').click();
  await page.waitForURL('**/admin/**');
  await page.waitForLoadState('networkidle');
}

async function navigateToMediaTab(page: Page): Promise<void> {
  const mediaButton = page.getByTestId('sidebar-media-button');
  await mediaButton.click();
  await page.waitForURL(/\/media$/);
  await page.waitForLoadState('networkidle');

  await expect(
    page.locator('[data-testid="media-search-input"]')
  ).toBeVisible();
}

async function openImageGenDialog(page: Page): Promise<void> {
  const addButton = page.locator('[data-testid="add-media-button"]');
  await expect(addButton).toBeVisible();
  await expect(addButton).toBeEnabled();
  await addButton.click();

  const generateOption = page.locator('[data-testid="add-media-generate"]');
  await expect(generateOption).toBeVisible();
  await expect(generateOption).toBeEnabled();
  await generateOption.click();

  await expect(
    page.locator('[data-testid="image-gen-dialog-title"]')
  ).toBeVisible();
}

test.describe('Image Generation - Admin Profile Management', () => {
  /**
   * Single admin session: AI Settings + AI Providers UI checks, profile
   * created via API and seen in admin UI, create-profile UI dialog
   * opens & cancels. Replaces 4 separate adminPage tests.
   */
  test('admin AI settings: pages, providers, profile creation (API + UI)', async ({
    adminPage,
  }) => {
    const testProfileName = `E2E-Admin-Test-${Date.now()}`;

    await test.step('AI Settings page exposes Image Model Profiles section', async () => {
      await navigateToAdminViaMenu(adminPage);
      await adminPage.locator('[data-testid="admin-nav-ai"]').click();
      await adminPage.waitForURL('**/admin/ai');
      await adminPage.waitForLoadState('networkidle');

      const profilesCard = adminPage.locator('mat-card', {
        hasText: 'Image Model Profiles',
      });
      await expect(profilesCard).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="create-profile-button"]')
      ).toBeVisible();
    });

    await test.step('AI Providers page shows OpenAI key configured/not-configured state', async () => {
      await adminPage.locator('[data-testid="admin-nav-ai-providers"]').click();
      await adminPage.waitForURL('**/admin/ai-providers');
      await adminPage.waitForLoadState('networkidle');

      const openaiCard = adminPage.locator(
        '[data-testid="ai-provider-card-openai"]'
      );
      await expect(openaiCard).toBeVisible();

      const keyConfigured = openaiCard.locator(
        '[data-testid="ai-provider-key-configured"]'
      );
      const keyNotConfigured = openaiCard.locator(
        '[data-testid="ai-provider-key-not-configured"]'
      );
      await expect(keyConfigured.or(keyNotConfigured)).toBeVisible();
    });

    await test.step('profile created via API appears in the admin UI', async () => {
      await setProviderApiKey(adminPage, 'openai', FAKE_API_KEYS.openai);
      await createImageProfile(adminPage, {
        ...USER_TEST_PROFILE,
        name: testProfileName,
      });

      // Re-enter via the user menu so the AI Settings page reloads with
      // the latest profile list (a stale in-memory state from earlier
      // steps can otherwise omit the just-created profile).
      await navigateToAdminViaMenu(adminPage);
      await adminPage.locator('[data-testid="admin-nav-ai"]').click();
      await adminPage.waitForURL('**/admin/ai');
      // Force a fresh profile fetch — the page caches its first load.
      await adminPage.reload();
      await adminPage.waitForLoadState('networkidle');

      const profilesGrid = adminPage.locator('[data-testid="profiles-grid"]');
      await expect(profilesGrid).toBeVisible();

      const profileItem = adminPage.locator('.profile-item', {
        hasText: testProfileName,
      });
      await expect(profileItem).toBeVisible();
    });

    await test.step('create-profile UI dialog opens and can be cancelled', async () => {
      await adminPage.locator('[data-testid="create-profile-button"]').click();

      const dialogTitle = adminPage.locator(
        '[data-testid="profile-dialog-title"]'
      );
      await expect(dialogTitle).toBeVisible();
      await expect(dialogTitle).toContainText('Create Image Profile');

      await expect(
        adminPage.locator('[data-testid="profile-name-input"]')
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="profile-provider-select"]')
      ).toBeVisible();

      await adminPage.locator('[data-testid="profile-dialog-cancel"]').click();
      await expect(dialogTitle).not.toBeVisible();
    });

    await test.step('cleanup: delete the API-created profile', async () => {
      await deleteImageProfileByName(adminPage, testProfileName);
    });
  });
});

test.describe('Image Generation - User Dialog Flow', () => {
  // Run serially to ensure beforeAll completes before tests.
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const response = await page.request.post(
      `${getApiBaseUrl()}/api/v1/auth/login`,
      {
        data: {
          username: 'e2e-admin',
          password: TEST_PASSWORDS.ADMIN,
        },
      }
    );

    if (!response.ok()) {
      await context.close();
      throw new Error('Failed to log in as admin for test setup');
    }

    const { token } = await response.json();

    await page.request.put(
      `${getApiBaseUrl()}/api/v1/ai/providers/openai/key`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { apiKey: FAKE_API_KEYS.openai },
      }
    );

    await page.request.post(`${getApiBaseUrl()}/api/v1/admin/image-profiles`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: USER_TEST_PROFILE.name,
        description: USER_TEST_PROFILE.description,
        provider: USER_TEST_PROFILE.provider,
        modelId: USER_TEST_PROFILE.modelId,
        enabled: true,
        supportsImageInput: false,
        supportsCustomResolutions: false,
        supportedSizes: USER_TEST_PROFILE.supportedSizes,
        defaultSize: USER_TEST_PROFILE.defaultSize,
        sortOrder: 0,
      },
    });

    await context.close();
  });

  /**
   * Full user-side dialog lifecycle on a single project: open dialog,
   * cancel, reopen, navigate context → prompt → generate (failure path
   * with fake API key) → try-again button. Replaces 6 separate tests
   * (each of which previously created its own project).
   */
  test('user image-gen dialog: open, cancel, generate-fail, retry surface', async ({
    authenticatedPage,
  }) => {
    const testSlug = `test-img-flow-${Date.now()}`;
    await createProject(authenticatedPage, 'Image Gen Flow', testSlug);
    await navigateToMediaTab(authenticatedPage);

    await test.step('add-media button surfaces a Generate option that opens the dialog', async () => {
      await openImageGenDialog(authenticatedPage);
    });

    await test.step('Cancel button closes the dialog', async () => {
      const cancelButton = authenticatedPage.locator(
        '[data-testid="image-gen-cancel-button"]'
      );
      await expect(cancelButton).toBeVisible();
      await cancelButton.click();
      await expect(
        authenticatedPage.locator('[data-testid="image-gen-dialog-title"]')
      ).not.toBeVisible();
    });

    await test.step('reopen dialog and wait for profiles to load', async () => {
      await openImageGenDialog(authenticatedPage);
      await waitForDialogReady(authenticatedPage);
    });

    await test.step('Next moves from context step to the prompt step', async () => {
      const nextButton = authenticatedPage.locator(
        '[data-testid="image-gen-next-button"]'
      );
      await expect(nextButton).toBeEnabled();
      await nextButton.click();

      const promptField = authenticatedPage.locator(
        '[data-testid="image-gen-prompt-input"]'
      );
      await expect(promptField).toBeVisible();
    });

    await test.step('filling the prompt enables Generate', async () => {
      const promptField = authenticatedPage.locator(
        '[data-testid="image-gen-prompt-input"]'
      );
      await promptField.fill('A fantasy castle on a mountain');

      const generateButton = authenticatedPage.locator(
        '[data-testid="image-gen-generate-button"]'
      );
      await expect(generateButton).toBeEnabled();
    });

    await test.step('Generate fails with the fake API key and exposes Try Again', async () => {
      const generateButton = authenticatedPage.locator(
        '[data-testid="image-gen-generate-button"]'
      );
      await generateButton.click();

      await expect(
        authenticatedPage.locator('[data-testid="image-gen-error-message"]')
      ).toBeVisible();
      await expect(
        authenticatedPage.locator('[data-testid="image-gen-try-again-button"]')
      ).toBeVisible();
    });
  });
});
