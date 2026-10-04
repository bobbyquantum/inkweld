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

import { expect, test } from './fixtures';
import {
  applyColorScheme as applyThemeClass,
  applyColorSchemeAndReload,
  type ColorScheme,
} from './theme-helpers';

const SCREENSHOTS_DIR = path.join(
  __dirname,
  '../../',
  '../docs/site/static/img/features'
);

async function navigateToAdminAiViaMenu(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  const adminMenuLink = page.locator('[data-testid="admin-menu-link"]');
  await expect(adminMenuLink).toBeVisible();
  await adminMenuLink.click();
  await page.waitForURL('**/admin/**');

  if (!page.url().includes('/admin/ai')) {
    const aiLink = page.locator('[data-testid="admin-nav-ai"]');
    try {
      await aiLink.waitFor({ state: 'visible' });
      await aiLink.click();
    } catch {
      throw new Error(
        'AI nav link not visible - AI kill switch may be enabled in mock'
      );
    }
  }
}

async function applyColorScheme(
  page: Page,
  scheme: ColorScheme
): Promise<void> {
  await applyThemeClass(page, scheme);
  // Give the theme swap and any web fonts a chance to settle before
  // screenshots are captured.
  await page.evaluate(() => document.fonts.ready);
}

async function navigateToAiProviders(page: Page): Promise<void> {
  const aiProvidersLink = page.locator(
    '[data-testid="admin-nav-ai-providers"]'
  );
  if (await aiProvidersLink.isVisible()) {
    await aiProvidersLink.click();
  } else {
    await page.goto('/admin/ai-providers');
  }
  await page.waitForSelector('.provider-card');
}

test.describe('Admin AI Settings Screenshots', () => {
  test.beforeEach(async ({ adminPage }) => {
    await navigateToAdminAiViaMenu(adminPage);
    await adminPage.waitForSelector(
      '[data-testid="settings-card"], [data-testid="ai-settings-loading"]'
    );

    const loadingContainer = adminPage.getByTestId('ai-settings-loading');
    if (await loadingContainer.isVisible()) {
      await loadingContainer.waitFor({ state: 'hidden' });
    }

    await adminPage.waitForSelector('[data-testid="settings-card"]');
  });

  test('AI settings screenshots — light mode', async ({ adminPage }) => {
    await applyColorScheme(adminPage, 'light');
    await expect(adminPage.getByTestId('settings-card').first()).toBeVisible();

    await test.step('settings page overview', async () => {
      await adminPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-ai-settings-light.png'),
        fullPage: false,
      });
    });

    await test.step('provider cards — all providers + openai card', async () => {
      const providerCards = adminPage.locator(
        '[data-testid^="ai-provider-card-"]'
      );
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

      const openaiCard = adminPage
        .locator('[data-testid^="ai-provider-card-"]')
        .first();
      await openaiCard.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'admin-ai-openai-model-config.png'),
      });
    });

    await test.step('openrouter provider model config (ai-providers page)', async () => {
      // Already on the ai-providers page from previous step.
      const providerCards = adminPage.locator(
        '[data-testid^="ai-provider-card-"]'
      );
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
    // The admin shell reads the theme at boot; reload so every surface is dark.
    await applyColorSchemeAndReload(
      adminPage,
      'dark',
      '[data-testid="settings-card"]'
    );
    await expect(adminPage.locator('body')).toHaveClass(/dark-theme/);
    await expect(adminPage.getByTestId('profile-model').first()).toHaveText(
      /OpenAI/
    );
    await adminPage.evaluate(() => document.fonts.ready);

    await adminPage.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'admin-ai-settings-dark.png'),
      fullPage: false,
    });
  });
});

test.describe('Image Model Profiles Screenshots', () => {
  test.beforeEach(async ({ adminPage }) => {
    await navigateToAdminAiViaMenu(adminPage);
    await adminPage.waitForSelector(
      '[data-testid="settings-card"], [data-testid="ai-settings-loading"]'
    );

    const loadingContainer = adminPage.getByTestId('ai-settings-loading');
    if (await loadingContainer.isVisible()) {
      await loadingContainer.waitFor({ state: 'hidden' });
    }
  });

  async function captureProfileScreenshots(
    adminPage: Page,
    suffix: 'light' | 'dark'
  ): Promise<void> {
    await test.step('profiles grid section', async () => {
      const profilesSection = adminPage.getByTestId('profiles-section-card');
      if (await profilesSection.isVisible()) {
        await profilesSection.scrollIntoViewIfNeeded();
        await adminPage.waitForTimeout(300);

        await adminPage.waitForSelector(
          '[data-testid="profiles-grid"], [data-testid="profiles-empty-state"]'
        );

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

        await expect(
          adminPage.getByTestId('profile-dialog-title')
        ).toBeVisible();
        await adminPage.getByTestId('profile-name-input').fill('Cover Art');
        await adminPage
          .getByTestId('profile-description-input')
          .fill('Book covers and character portraits');
        await adminPage.evaluate(() => document.fonts.ready);

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
    await expect(adminPage.getByTestId('settings-card').first()).toBeVisible();
    await captureProfileScreenshots(adminPage, 'light');
  });

  test('image profiles screenshots — dark mode', async ({ adminPage }) => {
    await applyColorScheme(adminPage, 'dark');
    await expect(adminPage.getByTestId('settings-card').first()).toBeVisible();
    await captureProfileScreenshots(adminPage, 'dark');
  });
});

test.describe('Image Generation Dialog Screenshots', () => {
  async function openImageGenerationDialog(
    page: Page,
    scheme: ColorScheme
  ): Promise<void> {
    await applyColorSchemeAndReload(page, scheme, '.project-card');
    // Open the project from its card: a project has to be downloaded to
    // (activated on) this device first, and a direct /media URL bounces
    // back to the bookshelf.
    await page
      .getByRole('button', {
        name: 'Open project The Worldbuilding Chronicles',
      })
      .first()
      .click();
    const begin = page.getByTestId('cover-open-begin');
    await expect(begin).toContainText('Download to this device');
    await begin.click();
    await expect(begin).toContainText('Begin');
    await begin.click();
    await page.waitForURL('**/testuser/worldbuilding-chronicles**');
    await page.getByText('Media Library', { exact: true }).click();
    await page.waitForURL('**/media');

    await page.getByTestId('add-media-button').click();
    await page.getByTestId('add-media-generate').click();
    // The wizard opens on its first step; the prompt input comes later.
    await expect(page.getByTestId('image-generation-stepper')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
  }

  async function captureImageGenerationDialog(
    page: Page,
    suffix: ColorScheme
  ): Promise<void> {
    await openImageGenerationDialog(page, suffix);
    const dialog = page.locator('mat-dialog-container');

    await test.step('context step', async () => {
      await dialog.screenshot({
        path: path.join(
          SCREENSHOTS_DIR,
          `image-generation-dialog-${suffix}.png`
        ),
      });
    });

    await test.step('prompt step', async () => {
      await page.getByTestId('image-gen-next-button').click();
      const prompt = page.getByTestId('image-gen-prompt-input');
      await expect(prompt).toBeVisible();
      await prompt.fill(
        'A lighthouse on a storm-battered cliff at dusk, painted in oils'
      );
      await expect(page.getByTestId('image-gen-generate-button')).toBeEnabled();
      await dialog.screenshot({
        path: path.join(
          SCREENSHOTS_DIR,
          `image-generation-prompt-${suffix}.png`
        ),
      });
    });
  }

  test('Image generation dialog - light mode', async ({
    authenticatedPage,
  }) => {
    await captureImageGenerationDialog(authenticatedPage, 'light');
  });

  test('Image generation dialog - dark mode', async ({ authenticatedPage }) => {
    await captureImageGenerationDialog(authenticatedPage, 'dark');
  });
});
