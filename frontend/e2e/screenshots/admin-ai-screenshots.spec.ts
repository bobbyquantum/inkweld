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
  await page.waitForLoadState('networkidle');

  // Now click on AI Settings link in the admin sidebar/nav
  // First check if we need to navigate to /admin/ai
  if (!page.url().includes('/admin/ai')) {
    const aiLink = page.locator(
      '[data-testid="admin-nav-ai"], a[href*="/admin/ai"]'
    );
    if ((await aiLink.count()) > 0) {
      await aiLink.first().click();
      await page.waitForLoadState('networkidle');
    }
  }
}

test.describe('Admin AI Settings Screenshots', () => {
  test.beforeEach(async ({ adminPage }) => {
    // Navigate via user menu (more reliable than direct URL)
    await navigateToAdminAiViaMenu(adminPage);

    // Wait for the page to load - either settings card or loading
    await adminPage.waitForSelector('.settings-card, .loading-container', {
      timeout: 10000,
    });

    // Wait for loading to complete
    const loadingContainer = adminPage.locator('.loading-container');
    if (await loadingContainer.isVisible()) {
      await loadingContainer.waitFor({ state: 'hidden', timeout: 10000 });
    }

    // Ensure settings cards are visible
    await adminPage.waitForSelector('.settings-card', { timeout: 5000 });
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
    await adminPage.waitForSelector('.settings-card', {
      timeout: 10000,
    });

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
    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    // Wait for provider cards to load
    await adminPage.waitForSelector('.provider-card', {
      timeout: 10000,
    });

    // Find the OpenAI card (first card or by its heading)
    const openaiCard = adminPage.locator('.provider-card').first();

    // Click the model configuration expansion panel
    const modelConfigPanel = openaiCard.locator(
      'mat-expansion-panel-header:has-text("Model Configuration")'
    );

    if (await modelConfigPanel.isVisible()) {
      await modelConfigPanel.click();
      await adminPage.waitForTimeout(400); // Wait for expansion animation
    }

    // Take screenshot of the OpenAI card with expanded model config
    await openaiCard.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'admin-ai-openai-model-config.png'),
    });
  });

  test('OpenRouter card with expanded model config', async ({ adminPage }) => {
    // Ensure light mode
    await adminPage.evaluate(() => {
      document.documentElement.classList.remove('dark-mode');
      document.documentElement.classList.add('light-mode');
    });

    // Wait for provider cards to load
    await adminPage.waitForSelector('.provider-card', {
      timeout: 10000,
    });

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
      await authenticatedPage.waitForSelector('mat-dialog-container', {
        timeout: 5000,
      });

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
      await authenticatedPage.waitForSelector('mat-dialog-container', {
        timeout: 5000,
      });

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
