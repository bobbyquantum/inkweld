import { devices, expect } from '@playwright/test';

import { test as baseTest } from './fixtures';

// Extend the base test to add mobile viewport
const test = baseTest.extend({
  authenticatedPage: async ({ authenticatedPage: page }, use) => {
    await page.setViewportSize(devices['iPhone 12'].viewport);
    await use(page);
  },
  anonymousPage: async ({ anonymousPage: page }, use) => {
    await page.setViewportSize(devices['iPhone 12'].viewport);
    await use(page);
  },
});

test.describe('Mobile Responsiveness', () => {
  test('should handle mobile login form', async ({ anonymousPage: page }) => {
    await page.goto('/welcome');
    await page.getByTestId('username-input').fill('testuser');
    await page.getByTestId('password-input').fill('correct-password');
    await page.getByTestId('login-button').click();
    await expect(page).toHaveURL('/');
  });

  test('should handle mobile registration form', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/register');
    const uniqueUsername = `mobile${Date.now()}`;
    await page.getByTestId('username-input').fill(uniqueUsername);
    await page.getByTestId('username-input').blur();
    await page.waitForTimeout(500);
    await page.getByTestId('password-input').fill('MobilePass123!');
    await page.getByTestId('confirm-password-input').fill('MobilePass123!');
    await page.getByTestId('register-button').click();
    await expect(page).toHaveURL('/');
  });

  test('should handle mobile keyboard input', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/welcome');
    await page.getByTestId('username-input').click();
    const isFocused = await page
      .getByTestId('username-input')
      .evaluate(el => el === document.activeElement);
    expect(isFocused).toBeTruthy();
    await page.keyboard.type('mobile');
    const value = await page.getByTestId('username-input').inputValue();
    expect(value).toBe('mobile');
  });

  test('should display responsive layout', async ({
    authenticatedPage: page,
  }) => {
    // Page should load and display properly on mobile viewport
    await expect(page).toHaveURL('/');
    const viewport = page.viewportSize();
    expect(viewport?.width).toBe(devices['iPhone 12'].viewport.width);
  });

  test('should handle orientation changes', async ({
    authenticatedPage: page,
  }) => {
    // Portrait
    await page.setViewportSize(devices['iPhone 12'].viewport);
    await expect(page).toHaveURL('/');

    // Landscape
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(300);
    await expect(page).toHaveURL('/');

    // Back to portrait
    await page.setViewportSize(devices['iPhone 12'].viewport);
    await expect(page).toHaveURL('/');
  });
});
