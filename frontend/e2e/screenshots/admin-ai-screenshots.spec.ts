/**
 * Admin AI Settings Screenshot Tests
 *
 * These tests capture screenshots of the AI image generation settings page
 * for documentation purposes.
 */
import path from 'path';

import { test } from './fixtures';

const SCREENSHOTS_DIR = path.join(
  __dirname,
  '../../',
  '../docs/site/static/img/features'
);

/**
 * Helper to navigate to admin page via user menu.
 * This is more reliable than direct URL navigation because it ensures
 * the user is fully authenticated before accessing admin routes.
 */
async function navigateToAdminAiViaMenu(
  page: import('@playwright/test').Page
): Promise<void> {
  // Open user menu
  await page.locator('[data-testid="user-menu-button"]').click();
  // Wait for menu to open
  await page.waitForTimeout(300);
  // Click admin link
  await page.locator('[data-testid="admin-menu-link"]').click();
  // Wait for admin page to load
  await page.waitForURL('**/admin/**');

  // Wait for network to settle
  await page.waitForLoadState('networkidle');

  // Now click on AI Settings link in the admin sidebar/nav
  // First check if we need to navigate to /admin/ai
  if (!page.url().includes('/admin/ai')) {
    // Wait for the AI nav link to appear (depends on kill switch being disabled)
    // Use specific data-testid to avoid matching ai-providers link
    const aiLink = page.locator('[data-testid="admin-nav-ai"]');
    try {
      await aiLink.waitFor({ state: 'visible' });
      await aiLink.click();
      await page.waitForLoadState('networkidle');
    } catch {
      throw new Error(
        'AI nav link not visible - AI kill switch may be enabled in mock'
      );
    }
  }
}

test.describe('Admin AI Settings Screenshots', () => {
  test.beforeEach(async ({ adminPage }) => {
    // Navigate via user menu (more reliable than direct URL)
    await navigateToAdminAiViaMenu(adminPage);

    // Wait for the page to load - either settings card or loading
    await adminPage.waitForSelector('.settings-card, .loading-container', {});

    // Wait for loading to complete
    const loadingContainer = adminPage.locator('.loading-container');
    if (await loadingContainer.isVisible()) {
      await loadingContainer.waitFor({ state: 'hidden' });
    }

    // Ensure settings cards are visible
    await adminPage.waitForSelector('.settings-card');
  });

  test('AI settings page overview - light mode', async ({ adminPage }) => {
    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    // Wait a moment for theme to apply
    await adminPage.waitForTimeout(300);

    // Take screenshot of the full page
    await adminPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'admin-ai-settings-light.png'),
      fullPage: false,
    });
  });

  test('AI settings page overview - dark mode', async ({ adminPage }) => {
    // Set dark mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('light-mode');
      document.documentElement.classList.add('dark-mode');
    });

    // Wait a moment for theme to apply
    await adminPage.waitForTimeout(300);

    // Take screenshot of the full page
    await adminPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'admin-ai-settings-dark.png'),
      fullPage: false,
    });
  });

  test('Provider cards showing configured state', async ({ adminPage }) => {
    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    // Wait for settings cards to appear
    await adminPage.waitForSelector('.settings-card', {});

    // Get all provider cards
    const providerCards = adminPage.locator('.provider-card');
    const cardCount = await providerCards.count();

    if (cardCount > 0) {
      // Take screenshot of first provider card (OpenAI)
      const firstCard = providerCards.first();
      await firstCard.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-ai-openai-card.png'),
      });
    }

    // Scroll down to ensure all cards are visible
    await adminPage.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await adminPage.waitForTimeout(300);

    // Take full page screenshot showing all providers
    await adminPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'admin-ai-all-providers.png'),
      fullPage: true,
    });
  });

  test('OpenAI card with expanded model config', async ({ adminPage }) => {
    // Navigate to AI Providers page (provider cards are there, not on AI settings)
    const aiProvidersLink = adminPage.locator(
      '[data-testid="admin-nav-ai-providers"]'
    );
    if (await aiProvidersLink.isVisible()) {
      await aiProvidersLink.click();
      await adminPage.waitForLoadState('networkidle');
    } else {
      // Direct navigation fallback
      await adminPage.goto('/admin/ai-providers');
      await adminPage.waitForLoadState('networkidle');
    }

    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    // Wait for provider cards to load
    await adminPage.waitForSelector('.provider-card', {});

    // Find the OpenAI card
    const openaiCard = adminPage.locator('.provider-card').first();

    // Take screenshot of the OpenAI provider card
    await openaiCard.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'admin-ai-openai-model-config.png'),
    });
  });

  test('OpenRouter card with expanded model config', async ({ adminPage }) => {
    // Navigate to AI Providers page (provider cards are there, not on AI settings)
    const aiProvidersLink = adminPage.locator(
      '[data-testid="admin-nav-ai-providers"]'
    );
    if (await aiProvidersLink.isVisible()) {
      await aiProvidersLink.click();
      await adminPage.waitForLoadState('networkidle');
    } else {
      // Direct navigation fallback
      await adminPage.goto('/admin/ai-providers');
      await adminPage.waitForLoadState('networkidle');
    }

    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    // Wait for provider cards to load
    await adminPage.waitForSelector('.provider-card', {});

    // Find the OpenRouter card (second provider card)
    const providerCards = adminPage.locator('.provider-card');
    const cardCount = await providerCards.count();

    // OpenRouter should be the second card (index 1)
    if (cardCount >= 2) {
      const openrouterCard = providerCards.nth(1);

      // Scroll to make the card visible
      await openrouterCard.scrollIntoViewIfNeeded();
      await adminPage.waitForTimeout(200);

      // Click the model configuration expansion panel
      const modelConfigPanel = openrouterCard.locator(
        'mat-expansion-panel-header:has-text("Model Configuration")'
      );

      if (await modelConfigPanel.isVisible()) {
        await modelConfigPanel.click();
        await adminPage.waitForTimeout(400); // Wait for expansion animation
      }

      // Take screenshot of the OpenRouter card with expanded model config
      await openrouterCard.screenshot({
        path: path.join(
          SCREENSHOTS_DIR,
          'admin-ai-openrouter-model-config.png'
        ),
      });
    }
  });
});

test.describe('Image Model Profiles Screenshots', () => {
  test.beforeEach(async ({ adminPage }) => {
    // Navigate via user menu (more reliable than direct URL)
    await navigateToAdminAiViaMenu(adminPage);

    // Wait for the page to load
    await adminPage.waitForSelector('.settings-card, .loading-container', {});

    // Wait for loading to complete
    const loadingContainer = adminPage.locator('.loading-container');
    if (await loadingContainer.isVisible()) {
      await loadingContainer.waitFor({ state: 'hidden' });
    }
  });

  test('Image profiles grid - light mode', async ({ adminPage }) => {
    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    await adminPage.waitForTimeout(300);

    // Wait for profiles section to be visible
    const profilesSection = adminPage.locator('.profiles-section-card');
    if (await profilesSection.isVisible()) {
      // Scroll to ensure the profiles section is in view
      await profilesSection.scrollIntoViewIfNeeded();
      await adminPage.waitForTimeout(300);

      // Wait for profiles grid to appear
      await adminPage.waitForSelector('.profiles-grid, .empty-state', {});

      // Take screenshot of the profiles section
      await profilesSection.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-ai-image-profiles-light.png'),
      });
    }
  });

  test('Image profiles grid - dark mode', async ({ adminPage }) => {
    // Set dark mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('light-mode');
      document.documentElement.classList.add('dark-mode');
    });

    await adminPage.waitForTimeout(300);

    // Wait for profiles section to be visible
    const profilesSection = adminPage.locator('.profiles-section-card');
    if (await profilesSection.isVisible()) {
      // Scroll to ensure the profiles section is in view
      await profilesSection.scrollIntoViewIfNeeded();
      await adminPage.waitForTimeout(300);

      // Wait for profiles grid to appear
      await adminPage.waitForSelector('.profiles-grid, .empty-state', {});

      // Take screenshot of the profiles section
      await profilesSection.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-ai-image-profiles-dark.png'),
      });
    }
  });

  test('Image profile creation dialog - light mode', async ({ adminPage }) => {
    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    await adminPage.waitForTimeout(300);

    // Wait for profiles section and find the create button
    const createButton = adminPage.locator('button:has-text("Create Profile")');
    if (await createButton.isVisible()) {
      await createButton.click();

      // Wait for dialog to appear
      await adminPage.waitForSelector('mat-dialog-container', {});

      // Wait for dialog to fully render
      await adminPage.waitForTimeout(500);

      // Take screenshot of the dialog
      const dialog = adminPage.locator('mat-dialog-container');
      await dialog.screenshot({
        path: path.join(
          SCREENSHOTS_DIR,
          'admin-ai-image-profile-dialog-light.png'
        ),
      });

      // Close the dialog
      const closeButton = adminPage.locator(
        'mat-dialog-container button:has-text("Cancel")'
      );
      if (await closeButton.isVisible()) {
        await closeButton.click();
        await adminPage.waitForTimeout(300);
      }
    }
  });

  test('Image profile creation dialog - dark mode', async ({ adminPage }) => {
    // Set dark mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('light-mode');
      document.documentElement.classList.add('dark-mode');
    });

    await adminPage.waitForTimeout(300);

    // Wait for profiles section and find the create button
    const createButton = adminPage.locator('button:has-text("Create Profile")');
    if (await createButton.isVisible()) {
      await createButton.click();

      // Wait for dialog to appear
      await adminPage.waitForSelector('mat-dialog-container', {});

      // Wait for dialog to fully render
      await adminPage.waitForTimeout(500);

      // Take screenshot of the dialog
      const dialog = adminPage.locator('mat-dialog-container');
      await dialog.screenshot({
        path: path.join(
          SCREENSHOTS_DIR,
          'admin-ai-image-profile-dialog-dark.png'
        ),
      });
    }
  });
});

test.describe('Image Generation Dialog Screenshots', () => {
  test('Image generation dialog - light mode', async ({
    authenticatedPage,
  }) => {
    // First navigate to a project's media tab
    await authenticatedPage.goto('/testuser/worldbuilding-chronicles/media');

    // Wait for the page to load
    await authenticatedPage.waitForLoadState('networkidle');

    // Ensure light mode
    await authenticatedPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    // Look for the generate image button
    const generateButton = authenticatedPage.locator(
      '[data-testid="generate-image-button"]'
    );

    // Check if the button exists (might not in offline mode)
    if (await generateButton.isVisible()) {
      // Click to open dialog
      await generateButton.click();

      // Wait for dialog to appear
      await authenticatedPage.waitForSelector('mat-dialog-container', {});

      // Wait a moment for the dialog to fully render
      await authenticatedPage.waitForTimeout(500);

      // Take screenshot of the dialog
      const dialog = authenticatedPage.locator('mat-dialog-container');
      await dialog.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'image-generation-dialog-light.png'),
      });
    }
  });

  test('Image generation dialog - dark mode', async ({ authenticatedPage }) => {
    // First navigate to a project's media tab
    await authenticatedPage.goto('/testuser/worldbuilding-chronicles/media');

    // Wait for the page to load
    await authenticatedPage.waitForLoadState('networkidle');

    // Set dark mode
    await authenticatedPage.evaluate(() => {
      document.documentElement.classList.remove('light-mode');
      document.documentElement.classList.add('dark-mode');
    });

    // Look for the generate image button
    const generateButton = authenticatedPage.locator(
      '[data-testid="generate-image-button"]'
    );

    // Check if the button exists
    if (await generateButton.isVisible()) {
      // Click to open dialog
      await generateButton.click();

      // Wait for dialog to appear
      await authenticatedPage.waitForSelector('mat-dialog-container', {});

      // Wait a moment for the dialog to fully render
      await authenticatedPage.waitForTimeout(500);

      // Take screenshot of the dialog
      const dialog = authenticatedPage.locator('mat-dialog-container');
      await dialog.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'image-generation-dialog-dark.png'),
      });
    }
  });
});
