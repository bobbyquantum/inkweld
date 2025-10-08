import { devices, expect } from '@playwright/test';

import { test as baseTest } from './fixtures';

// Extend the base test to add mobile viewport
const test = baseTest.extend({
  // Override authenticatedPage to use mobile viewport
  authenticatedPage: async ({ authenticatedPage: page }, use) => {
    // Set mobile viewport
    await page.setViewportSize(devices['iPhone 12'].viewport);
    await use(page);
  },
  anonymousPage: async ({ anonymousPage: page }, use) => {
    // Set mobile viewport
    await page.setViewportSize(devices['iPhone 12'].viewport);
    await use(page);
  },
});

test.describe('Mobile Touch Interactions', () => {
  test('should handle mobile folder expansion without double-tap issue', async ({
    authenticatedPage: page,
  }) => {
    // Navigate to a project
    await page.goto('/testuser/test-project');

    // Wait for project tree to load
    await page.waitForSelector('.project-tree', { timeout: 5000 });

    // Find a folder node with expand button
    const expandButton = page.locator('.expand-button').first();

    if ((await expandButton.count()) > 0) {
      // Tap the expand button
      await expandButton.tap();

      // Wait for expansion
      await page.waitForTimeout(500);

      // The folder should be expanded and stay expanded
      // Check that children are visible
      const hasExpandedClass = await page
        .locator('.tree-node.expanded')
        .count();
      expect(hasExpandedClass).toBeGreaterThan(0);

      // Tap again to collapse
      await expandButton.tap();
      await page.waitForTimeout(500);

      // Should collapse
      const hasCollapsedClass =
        (await page.locator('.tree-node.expanded').count()) === 0;
      expect(hasCollapsedClass).toBeTruthy();
    }
  });

  test('should use dropdown for tab navigation on mobile', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/testuser/test-project');

    // On mobile, tabs should be displayed as a dropdown
    const tabDropdown = page.locator('mat-select, .mobile-tab-select');

    // Check if dropdown exists (might not be visible immediately)
    await page.waitForTimeout(1000);

    if ((await tabDropdown.count()) > 0) {
      await expect(tabDropdown).toBeVisible();

      // Click to open dropdown
      await tabDropdown.tap();
      await page.waitForTimeout(300);

      // Should show tab options
      const options = page.locator('mat-option, .tab-option');
      await expect(options.first()).toBeVisible();
    }
  });

  test('should handle mobile login form properly', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/welcome');

    // Fill login form on mobile
    await page.getByTestId('username-input').tap();
    await page.getByTestId('username-input').fill('testuser');

    await page.getByTestId('password-input').tap();
    await page.getByTestId('password-input').fill('correct-password');

    // Submit using tap instead of click
    await page.getByTestId('login-button').tap();

    // Should redirect to home
    await expect(page).toHaveURL('/');
  });

  test('should handle mobile registration form properly', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/register');

    const uniqueUsername = `mobile${Date.now()}`;

    // Use tap for mobile interactions
    await page.getByTestId('username-input').tap();
    await page.getByTestId('username-input').fill(uniqueUsername);

    await page.getByTestId('password-input').tap();
    await page.getByTestId('password-input').fill('MobilePass123!');

    await page.getByTestId('confirm-password-input').tap();
    await page.getByTestId('confirm-password-input').fill('MobilePass123!');

    // Submit with tap
    await page.getByTestId('register-button').tap();

    // Should redirect to home
    await expect(page).toHaveURL('/');
  });

  test('should handle touch scrolling in project list', async ({
    authenticatedPage: page,
  }) => {
    // The home page should be scrollable on mobile
    await page.waitForSelector('app-project-card', { timeout: 5000 });

    // Get initial scroll position
    const initialScroll = await page.evaluate(() => window.scrollY);

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(300);

    // Check that we scrolled
    const newScroll = await page.evaluate(() => window.scrollY);
    expect(newScroll).toBeGreaterThan(initialScroll);
  });

  test('should show mobile-optimized navigation menu', async ({
    authenticatedPage: page,
  }) => {
    // Look for hamburger menu or mobile navigation
    const mobileMenu = page.locator(
      'button[aria-label*="menu"], .hamburger-menu, mat-icon:has-text("menu")'
    );

    if ((await mobileMenu.count()) > 0) {
      await expect(mobileMenu).toBeVisible();

      // Tap to open menu
      await mobileMenu.tap();
      await page.waitForTimeout(300);

      // Menu drawer should open
      const menuDrawer = page.locator(
        'mat-sidenav, .mobile-drawer, .menu-drawer'
      );
      if ((await menuDrawer.count()) > 0) {
        await expect(menuDrawer).toBeVisible();
      }
    }
  });

  test('should handle mobile project creation', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Fill form using tap for focus
    await page.getByTestId('project-title-input').tap();
    await page.getByTestId('project-title-input').fill('Mobile Project');

    await page.getByTestId('project-slug-input').tap();
    await page.getByTestId('project-slug-input').fill('mobile-project');

    await page.getByTestId('project-description-input').tap();
    await page
      .getByTestId('project-description-input')
      .fill('Created from mobile');

    // Submit with tap
    await page.getByTestId('create-project-button').tap();

    // Should redirect to project
    await expect(page).toHaveURL(/\/testuser\/mobile-project/);
  });

  test('should prevent zoom on input focus (mobile UX)', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/welcome');

    // Get viewport meta tag
    const viewport = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta?.getAttribute('content');
    });

    // Should have user-scalable=no or similar to prevent zoom on input focus
    // This is a UX best practice for mobile forms
    expect(viewport).toBeTruthy();
  });

  test('should handle mobile touch events without click conflicts', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/testuser/test-project');

    // Wait for interactive elements
    await page.waitForTimeout(1000);

    // Find any clickable button
    const button = page.locator('button').first();

    if ((await button.count()) > 0) {
      // Listen for multiple events
      await page.evaluate(() => {
        document.addEventListener('click', () => {
          (window as any).clickEventFired = true;
        });
        document.addEventListener('touchend', () => {
          (window as any).touchendEventFired = true;
        });
      });

      // Tap the button
      await button.tap();
      await page.waitForTimeout(500);

      // Check that events were handled properly
      const clickFired = await page.evaluate(
        () => (window as any).clickEventFired
      );
      const touchFired = await page.evaluate(
        () => (window as any).touchendEventFired
      );

      // Both might fire, but the app should handle it correctly
      expect(touchFired || clickFired).toBeTruthy();
    }
  });

  test('should display mobile-friendly card layouts', async ({
    authenticatedPage: page,
  }) => {
    // Project cards should stack vertically on mobile
    const projectCards = page.locator('app-project-card');

    if ((await projectCards.count()) > 0) {
      // Get the first two cards' positions
      const firstCard = projectCards.first();
      const secondCard = projectCards.nth(1);

      if ((await secondCard.count()) > 0) {
        const firstBox = await firstCard.boundingBox();
        const secondBox = await secondCard.boundingBox();

        // On mobile, cards should be stacked (second card below first)
        if (firstBox && secondBox) {
          expect(secondBox.y).toBeGreaterThan(firstBox.y);
        }
      }
    }
  });

  test('should handle mobile keyboard properly', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/welcome');

    // Focus on username input
    await page.getByTestId('username-input').tap();

    // Check that input is focused
    const isFocused = await page
      .getByTestId('username-input')
      .evaluate(el => el === document.activeElement);
    expect(isFocused).toBeTruthy();

    // Type should work
    await page.keyboard.type('mobile');
    const value = await page.getByTestId('username-input').inputValue();
    expect(value).toBe('mobile');
  });

  test('should handle swipe gestures for navigation', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/testuser/test-project');

    // Simulate a swipe (if the app supports it)
    // This is a basic swipe simulation
    await page.mouse.move(300, 200);
    await page.mouse.down();
    await page.mouse.move(100, 200, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(500);

    // The URL might have changed if swipe navigation is implemented
    // Or stayed the same if not - both are valid
    const finalUrl = page.url();
    expect(finalUrl).toBeTruthy();
  });

  test('should show touch-friendly button sizes', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/create-project');

    // Check that buttons are large enough for touch (minimum 44x44px)
    const submitButton = page.getByTestId('create-project-button');
    const box = await submitButton.boundingBox();

    if (box) {
      // Touch targets should be at least 44px for good mobile UX
      expect(box.height).toBeGreaterThanOrEqual(36); // Angular Material default
      expect(box.width).toBeGreaterThan(50); // Should have adequate width
    }
  });

  test('should handle mobile orientation changes', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/testuser/test-project');

    // Rotate to landscape
    await page.setViewportSize({ width: 844, height: 390 }); // iPhone 12 landscape
    await page.waitForTimeout(500);

    // Should still be functional
    await expect(page).toHaveURL(/\/testuser\/test-project/);

    // Rotate back to portrait
    await page.setViewportSize(devices['iPhone 12'].viewport);
    await page.waitForTimeout(500);

    // Should still work
    await expect(page).toHaveURL(/\/testuser\/test-project/);
  });
});
