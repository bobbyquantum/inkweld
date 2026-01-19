import { Page } from '@playwright/test';

import { createProject, expect, test } from './fixtures';

/**
 * AI Image Generation E2E Tests
 *
 * These tests verify the image generation profile management and the
 * image generation dialog workflow, testing everything up to the point
 * of pressing "Generate" - which will fail with fake API keys.
 *
 * The tests use fake API keys to ensure we don't accidentally call
 * real AI services during testing.
 */

// Fake API keys that look valid but won't work
const FAKE_API_KEYS = {
  openai: 'sk-fake-test-key-1234567890abcdefghijklmnopqrstuv',
  openrouter: 'sk-or-v1-fake-test-key-1234567890abcdefghijklmnopqrstuv',
  falai: 'fal-ai-fake-test-key-1234567890abcdefghijklmnopqrstuv',
};

// Static test profile for user tests - created once
const USER_TEST_PROFILE = {
  name: 'E2E-User-Test-OpenAI',
  description: 'Test profile for user e2e tests',
  provider: 'openai',
  modelId: 'gpt-image-1',
  supportedSizes: ['1024x1024', '1024x1536', '1536x1024'],
  defaultSize: '1024x1024',
};

/**
 * Helper to get the API base URL
 */
function getApiBaseUrl(): string {
  return process.env['API_BASE_URL'] || 'http://localhost:9333';
}

/**
 * Helper to set an AI provider API key via the admin API
 */
async function setProviderApiKey(
  page: Page,
  providerId: string,
  apiKey: string
): Promise<void> {
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
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

/**
 * Helper to create an image profile via the admin API
 */
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
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));
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
    // Profile already exists, that's fine for tests
    return 'existing';
  }

  expect(response.ok()).toBe(true);
  const data = await response.json();
  return data.id;
}

/**
 * Helper to delete an image profile by name via the admin API
 */
async function deleteImageProfileByName(
  page: Page,
  name: string
): Promise<void> {
  const token = await page.evaluate(() => localStorage.getItem('auth_token'));

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

/**
 * Helper to navigate to admin page via user menu
 */
async function navigateToAdminViaMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  await page.locator('[data-testid="admin-menu-link"]').click();
  await page.waitForURL('**/admin/**');
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to navigate to media tab in project
 */
async function navigateToMediaTab(page: Page): Promise<void> {
  // Media Library button can be in sidebar or on project home page
  await page
    .getByRole('button', { name: /Media Library/i })
    .first()
    .click();
  // Wait for networkidle to ensure system config API call completes,
  // which determines if the generate image button should be visible
  await page.waitForLoadState('networkidle');
}

test.describe('Image Generation - Admin Profile Management', () => {
  test('should navigate to AI Settings and see image profiles section', async ({
    adminPage,
  }) => {
    // Navigate to admin
    await navigateToAdminViaMenu(adminPage);

    // Navigate to AI Settings (where image profiles live)
    await adminPage.locator('[data-testid="admin-nav-ai"]').click();
    await adminPage.waitForURL('**/admin/ai');
    await adminPage.waitForLoadState('networkidle');

    // Look for the profiles section
    const profilesCard = adminPage.locator('mat-card', {
      hasText: 'Image Model Profiles',
    });
    await expect(profilesCard).toBeVisible();

    // Look for Create Profile button
    const createButton = adminPage.locator(
      '[data-testid="create-profile-button"]'
    );
    await expect(createButton).toBeVisible();
  });

  test('should configure OpenAI API key via admin UI', async ({
    adminPage,
  }) => {
    // Navigate to admin
    await navigateToAdminViaMenu(adminPage);

    // Navigate to AI providers
    await adminPage.locator('[data-testid="admin-nav-ai-providers"]').click();
    await adminPage.waitForURL('**/admin/ai-providers');
    await adminPage.waitForLoadState('networkidle');

    // Find OpenAI provider card
    const openaiCard = adminPage.locator(
      '[data-testid="ai-provider-card-openai"]'
    );
    await expect(openaiCard).toBeVisible();

    // Look for the API key section (should show configured or not configured)
    const keyConfigured = openaiCard.locator(
      '[data-testid="ai-provider-key-configured"]'
    );
    const keyNotConfigured = openaiCard.locator(
      '[data-testid="ai-provider-key-not-configured"]'
    );

    // One of these should be visible
    await expect(keyConfigured.or(keyNotConfigured)).toBeVisible();
  });

  test('should create an image profile via API and see it in admin', async ({
    adminPage,
  }) => {
    const testProfileName = `E2E-Admin-Test-${Date.now()}`;

    // First set up the API key
    await setProviderApiKey(adminPage, 'openai', FAKE_API_KEYS.openai);

    // Create profile via API
    await createImageProfile(adminPage, {
      ...USER_TEST_PROFILE,
      name: testProfileName,
    });

    // Navigate to admin AI settings
    await navigateToAdminViaMenu(adminPage);
    await adminPage.locator('[data-testid="admin-nav-ai"]').click();
    await adminPage.waitForURL('**/admin/ai');
    await adminPage.waitForLoadState('networkidle');

    // Look for our created profile in the profiles grid
    const profilesGrid = adminPage.locator('[data-testid="profiles-grid"]');
    await expect(profilesGrid).toBeVisible({ timeout: 10000 });

    // Look for profile with matching text
    const profileItem = adminPage.locator('.profile-item', {
      hasText: testProfileName,
    });
    await expect(profileItem).toBeVisible();

    // Clean up - delete the test profile
    await deleteImageProfileByName(adminPage, testProfileName);
  });

  test('should open create profile dialog via UI', async ({ adminPage }) => {
    // Set up API key first
    await setProviderApiKey(adminPage, 'openai', FAKE_API_KEYS.openai);

    // Navigate to admin AI settings
    await navigateToAdminViaMenu(adminPage);
    await adminPage.locator('[data-testid="admin-nav-ai"]').click();
    await adminPage.waitForURL('**/admin/ai');
    await adminPage.waitForLoadState('networkidle');

    // Click Create Profile button
    await adminPage.locator('[data-testid="create-profile-button"]').click();

    // Wait for dialog
    const dialogTitle = adminPage.locator(
      '[data-testid="profile-dialog-title"]'
    );
    await expect(dialogTitle).toBeVisible();
    await expect(dialogTitle).toContainText('Create Image Profile');

    // Verify form fields are present
    await expect(
      adminPage.locator('[data-testid="profile-name-input"]')
    ).toBeVisible();
    await expect(
      adminPage.locator('[data-testid="profile-provider-select"]')
    ).toBeVisible();

    // Cancel the dialog
    await adminPage.locator('[data-testid="profile-dialog-cancel"]').click();
    await expect(dialogTitle).not.toBeVisible();
  });
});

test.describe('Image Generation - User Dialog Flow', () => {
  // Run serially to ensure beforeAll completes before tests and avoid race conditions
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    // Set up profiles before running user tests
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login as admin
    const response = await page.request.post(
      `${getApiBaseUrl()}/api/v1/auth/login`,
      {
        data: {
          username: 'e2e-admin',
          password: 'E2eAdminPassword123!',
        },
      }
    );

    if (!response.ok()) {
      await context.close();
      throw new Error('Failed to log in as admin for test setup');
    }

    const { token } = await response.json();

    // Set fake API key
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

    // Create the test profile (ignore if already exists)
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

  test('should show image generation button on media tab', async ({
    authenticatedPage,
  }) => {
    const testSlug = `test-img-gen-${Date.now()}`;

    await createProject(authenticatedPage, 'Image Gen Test', testSlug);
    await navigateToMediaTab(authenticatedPage);

    const generateButton = authenticatedPage.locator(
      '[data-testid="generate-image-button"]'
    );
    await expect(generateButton).toBeVisible();
    await expect(generateButton).toBeEnabled();
  });

  test('should open image generation dialog with profiles loaded', async ({
    authenticatedPage,
  }) => {
    const testSlug = `test-img-dialog-${Date.now()}`;

    await createProject(authenticatedPage, 'Image Dialog Test', testSlug);
    await navigateToMediaTab(authenticatedPage);

    // Wait for button to be visible (may take time for config to load)
    const genButton = authenticatedPage.locator(
      '[data-testid="generate-image-button"]'
    );
    await expect(genButton).toBeVisible({ timeout: 15000 });
    await genButton.click();

    // Wait for dialog
    const dialogTitle = authenticatedPage.locator(
      '[data-testid="image-gen-dialog-title"]'
    );
    await expect(dialogTitle).toBeVisible();

    // Wait for stepper (indicates profiles loaded)
    const stepper = authenticatedPage.locator('.image-generation-stepper');
    await expect(stepper).toBeVisible({ timeout: 10000 });
  });

  test('should navigate from context to prompt step', async ({
    authenticatedPage,
  }) => {
    const testSlug = `test-img-prompt-${Date.now()}`;

    await createProject(authenticatedPage, 'Image Prompt Test', testSlug);
    await navigateToMediaTab(authenticatedPage);

    // Wait for button to be visible (may take time for config to load)
    const generateButton = authenticatedPage.locator(
      '[data-testid="generate-image-button"]'
    );
    await expect(generateButton).toBeVisible({ timeout: 15000 });
    await generateButton.click();

    // Wait for dialog
    await expect(
      authenticatedPage.locator('[data-testid="image-gen-dialog-title"]')
    ).toBeVisible();

    // Wait for stepper to load
    const stepper = authenticatedPage.locator('.image-generation-stepper');
    await expect(stepper).toBeVisible({ timeout: 10000 });

    // Click Next button
    const nextButton = authenticatedPage.locator(
      '[data-testid="image-gen-next-button"]'
    );
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // Verify prompt field is visible
    const promptField = authenticatedPage.locator(
      '[data-testid="image-gen-prompt-input"]'
    );
    await expect(promptField).toBeVisible();
  });

  test('should fill in prompt and enable Generate button', async ({
    authenticatedPage,
  }) => {
    const testSlug = `test-img-fill-${Date.now()}`;

    await createProject(authenticatedPage, 'Fill Prompt Test', testSlug);
    await navigateToMediaTab(authenticatedPage);

    // Wait for button to be visible (may take time for config to load)
    const genButton = authenticatedPage.locator(
      '[data-testid="generate-image-button"]'
    );
    await expect(genButton).toBeVisible({ timeout: 15000 });
    await genButton.click();

    // Wait and navigate to prompt step
    const stepper = authenticatedPage.locator('.image-generation-stepper');
    await expect(stepper).toBeVisible({ timeout: 10000 });

    const nextButton = authenticatedPage.locator(
      '[data-testid="image-gen-next-button"]'
    );
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // Fill in prompt
    const promptField = authenticatedPage.locator(
      '[data-testid="image-gen-prompt-input"]'
    );
    await expect(promptField).toBeVisible();
    await promptField.fill('A fantasy castle on a mountain');

    // Verify Generate button is enabled
    const generateButton = authenticatedPage.locator(
      '[data-testid="image-gen-generate-button"]'
    );
    await expect(generateButton).toBeEnabled();
  });

  test('should attempt generation and fail with fake API key', async ({
    authenticatedPage,
  }) => {
    const testSlug = `test-img-gen-fail-${Date.now()}`;

    await createProject(authenticatedPage, 'Gen Fail Test', testSlug);
    await navigateToMediaTab(authenticatedPage);

    // Wait for button to be visible (may take time for config to load)
    const genButton = authenticatedPage.locator(
      '[data-testid="generate-image-button"]'
    );
    await expect(genButton).toBeVisible({ timeout: 15000 });
    await genButton.click();

    // Navigate to prompt step
    const stepper = authenticatedPage.locator('.image-generation-stepper');
    await expect(stepper).toBeVisible({ timeout: 10000 });

    await authenticatedPage
      .locator('[data-testid="image-gen-next-button"]')
      .click();

    // Fill in prompt
    const promptField = authenticatedPage.locator(
      '[data-testid="image-gen-prompt-input"]'
    );
    await expect(promptField).toBeVisible();
    await promptField.fill('A test image');

    // Click Generate
    const generateButton = authenticatedPage.locator(
      '[data-testid="image-gen-generate-button"]'
    );
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    // Wait for error (generation should fail with fake API key)
    const errorMessage = authenticatedPage.locator(
      '[data-testid="image-gen-error-message"]'
    );
    await expect(errorMessage).toBeVisible({ timeout: 60000 });

    // Verify Try Again button
    const tryAgainButton = authenticatedPage.locator(
      '[data-testid="image-gen-try-again-button"]'
    );
    await expect(tryAgainButton).toBeVisible();
  });

  test('should close dialog via Cancel button', async ({
    authenticatedPage,
  }) => {
    const testSlug = `test-img-close-${Date.now()}`;

    await createProject(authenticatedPage, 'Close Dialog Test', testSlug);
    await navigateToMediaTab(authenticatedPage);

    // Wait for button to be visible (may take time for config to load)
    const genButton = authenticatedPage.locator(
      '[data-testid="generate-image-button"]'
    );
    await expect(genButton).toBeVisible({ timeout: 15000 });
    await genButton.click();

    const dialogTitle = authenticatedPage.locator(
      '[data-testid="image-gen-dialog-title"]'
    );
    await expect(dialogTitle).toBeVisible();

    // Click Cancel
    const cancelButton = authenticatedPage.locator(
      '[data-testid="image-gen-cancel-button"]'
    );
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    // Dialog should close
    await expect(dialogTitle).not.toBeVisible();
  });
});
