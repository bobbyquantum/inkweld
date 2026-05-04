/**
 * Admin AI Settings Screenshot Tests
 *
 * Captures screenshots of the AI image generation settings page for
 * documentation. Consolidated 11 → 6 tests:
 *  - Admin AI Settings: 5 → 2 (one per color scheme; covers overview,
 *    all-providers, openai-card, openai/openrouter provider configs)
 *  - Image Model Profiles: 4 → 2 (one per color scheme; covers grid + dialog)
 *  - Image Generation Dialog: 2 → 2 (unchanged; uses authenticatedPage fixture)
 */
import type { Page } from '@playwright/test';
import path from 'path';

import { test } from './fixtures';

const SCREENSHOTS_DIR = path.join(
  __dirname,
  '../../',
  '../docs/site/static/img/features'
);

async function navigateToAdminAiViaMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="admin-menu-link"]').click();
  await page.waitForURL('**/admin/**');
  await page.waitForLoadState('networkidle');

  if (!page.url().includes('/admin/ai')) {
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

async function applyColorScheme(
  page: Page,
  scheme: 'light' | 'dark'
): Promise<void> {
  await page.evaluate(mode => {
    const html = document.documentElement;
    if (mode === 'dark') {
      html.classList.remove('light-mode');
      html.classList.add('dark-mode');
    } else {
      html.classList.remove('dark-mode');
      html.classList.add('light-mode');
    }
  }, scheme);
  await page.waitForTimeout(300);
}

async function navigateToAiProviders(page: Page): Promise<void> {
  const aiProvidersLink = page.locator(
    '[data-testid="admin-nav-ai-providers"]'
  );
  if (await aiProvidersLink.isVisible()) {
    await aiProvidersLink.click();
    await page.waitForLoadState('networkidle');
  } else {
    await page.goto('/admin/ai-providers');
    await page.waitForLoadState('networkidle');
  }
  await page.waitForSelector('.provider-card');
}

test.describe('Admin AI Settings Screenshots', () => {
  test.beforeEach(async ({ adminPage }) => {
    await navigateToAdminAiViaMenu(adminPage);
    await adminPage.waitForSelector('.settings-card, .loading-container');

    const loadingContainer = adminPage.locator('.loading-container');
    if (await loadingContainer.isVisible()) {
      await loadingContainer.waitFor({ state: 'hidden' });
    }

    await adminPage.waitForSelector('.settings-card');
  });

  test('AI settings screenshots — light mode', async ({ adminPage }) => {
    await applyColorScheme(adminPage, 'light');

    await test.step('settings page overview', async () => {
      await adminPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-ai-settings-light.png'),
        fullPage: false,
      });
    });

    await test.step('provider cards — all providers + openai card', async () => {
      const providerCards = adminPage.locator('.provider-card');
      const cardCount = await providerCards.count();

      if (cardCount > 0) {
        const firstCard = providerCards.first();
        await firstCard.screenshot({
          path: path.join(SCREENSHOTS_DIR, 'admin-ai-openai-card.png'),
        });
      }

      await adminPage.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await adminPage.waitForTimeout(300);

      await adminPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-ai-all-providers.png'),
        fullPage: true,
      });
    });

    await test.step('openai provider model config (ai-providers page)', async () => {
      await navigateToAiProviders(adminPage);
      await applyColorScheme(adminPage, 'light');

      const openaiCard = adminPage.locator('.provider-card').first();
      await openaiCard.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-ai-openai-model-config.png'),
      });
    });

    await test.step('openrouter provider model config (ai-providers page)', async () => {
      // Already on the ai-providers page from previous step.
      const providerCards = adminPage.locator('.provider-card');
      const cardCount = await providerCards.count();

      if (cardCount >= 2) {
        const openrouterCard = providerCards.nth(1);

        await openrouterCard.scrollIntoViewIfNeeded();
        await adminPage.waitForTimeout(200);

        const modelConfigPanel = openrouterCard.locator(
          'mat-expansion-panel-header:has-text("Model Configuration")'
        );

        if (await modelConfigPanel.isVisible()) {
          await modelConfigPanel.click();
          await adminPage.waitForTimeout(400);
        }

        await openrouterCard.screenshot({
          path: path.join(
            SCREENSHOTS_DIR,
            'admin-ai-openrouter-model-config.png'
          ),
        });
      }
    });
  });

  test('AI settings screenshots — dark mode', async ({ adminPage }) => {
    await applyColorScheme(adminPage, 'dark');

    await adminPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'admin-ai-settings-dark.png'),
      fullPage: false,
    });
  });
});

test.describe('Image Model Profiles Screenshots', () => {
  test.beforeEach(async ({ adminPage }) => {
    await navigateToAdminAiViaMenu(adminPage);
    await adminPage.waitForSelector('.settings-card, .loading-container');

    const loadingContainer = adminPage.locator('.loading-container');
    if (await loadingContainer.isVisible()) {
      await loadingContainer.waitFor({ state: 'hidden' });
    }
  });

  async function captureProfileScreenshots(
    adminPage: Page,
    suffix: 'light' | 'dark'
  ): Promise<void> {
    await test.step('profiles grid section', async () => {
      const profilesSection = adminPage.locator('.profiles-section-card');
      if (await profilesSection.isVisible()) {
        await profilesSection.scrollIntoViewIfNeeded();
        await adminPage.waitForTimeout(300);

        await adminPage.waitForSelector('.profiles-grid, .empty-state');

        await profilesSection.screenshot({
          path: path.join(
            SCREENSHOTS_DIR,
            `admin-ai-image-profiles-${suffix}.png`
          ),
        });
      }
    });

    await test.step('profile creation dialog', async () => {
      const createButton = adminPage.locator(
        'button:has-text("Create Profile")'
      );
      if (await createButton.isVisible()) {
        await createButton.click();

        await adminPage.waitForSelector('mat-dialog-container');
        await adminPage.waitForTimeout(500);

        const dialog = adminPage.locator('mat-dialog-container');
        await dialog.screenshot({
          path: path.join(
            SCREENSHOTS_DIR,
            `admin-ai-image-profile-dialog-${suffix}.png`
          ),
        });

        const closeButton = adminPage.locator(
          'mat-dialog-container button:has-text("Cancel")'
        );
        if (await closeButton.isVisible()) {
          await closeButton.click();
          await adminPage.waitForTimeout(300);
        }
      }
    });
  }

  test('image profiles screenshots — light mode', async ({ adminPage }) => {
    await applyColorScheme(adminPage, 'light');
    await captureProfileScreenshots(adminPage, 'light');
  });

  test('image profiles screenshots — dark mode', async ({ adminPage }) => {
    await applyColorScheme(adminPage, 'dark');
    await captureProfileScreenshots(adminPage, 'dark');
  });
});

test.describe('Image Generation Dialog Screenshots', () => {
  async function openImageGenerationDialog(page: Page): Promise<boolean> {
    await page.goto('/testuser/worldbuilding-chronicles/media');
    await page.waitForLoadState('networkidle');

    const addMediaButton = page.locator('[data-testid="add-media-button"]');
    if (!(await addMediaButton.isVisible())) {
      return false;
    }

    await addMediaButton.click();

    const generateOption = page.locator('[data-testid="add-media-generate"]');
    if (!(await generateOption.isVisible())) {
      return false;
    }

    await generateOption.click();
    await page.waitForSelector('mat-dialog-container');
    await page.waitForTimeout(500);
    return true;
  }

  test('Image generation dialog - light mode', async ({
    authenticatedPage,
  }) => {
    await applyColorScheme(authenticatedPage, 'light');

    if (await openImageGenerationDialog(authenticatedPage)) {
      const dialog = authenticatedPage.locator('mat-dialog-container');
      await dialog.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'image-generation-dialog-light.png'),
      });
    }
  });

  test('Image generation dialog - dark mode', async ({ authenticatedPage }) => {
    await applyColorScheme(authenticatedPage, 'dark');

    if (await openImageGenerationDialog(authenticatedPage)) {
      const dialog = authenticatedPage.locator('mat-dialog-container');
      await dialog.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'image-generation-dialog-dark.png'),
      });
    }
  });
});
