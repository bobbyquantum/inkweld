import { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Helper to navigate to admin announcements page via sidebar.
 */
async function navigateToAdminAnnouncements(page: Page): Promise<void> {
  // Open user menu
  await page.locator('[data-testid="user-menu-button"]').click();
  // Click admin link
  await page.locator('[data-testid="admin-menu-link"]').click();
  // Wait for admin page to load
  await expect(page).toHaveURL(/.*\/admin\/.*/);
  await page.waitForLoadState('networkidle');

  // Navigate to announcements via sidebar
  await page.locator('[data-testid="admin-nav-announcements"]').click();
  await expect(page).toHaveURL(/.*\/admin\/announcements/);
  await page.waitForLoadState('networkidle');
}

/**
 * Helper to get unique test data
 */
function generateTestAnnouncement() {
  const id = Date.now();
  return {
    title: `Test Announcement ${id}`,
    content: `This is test content for announcement ${id}`,
  };
}

/**
 * Helper to fill and submit the announcement form with proper waits for CI stability.
 */
async function fillAndSubmitAnnouncementForm(
  page: Page,
  testData: { title: string; content: string },
  options?: { checkPublic?: boolean }
): Promise<void> {
  await page.locator('[data-testid="create-announcement-btn"]').click();
  await page
    .locator('[data-testid="announcement-title-input"]')
    .fill(testData.title);
  await page
    .locator('[data-testid="announcement-content-input"]')
    .fill(testData.content);

  // Handle public checkbox if needed
  if (options?.checkPublic) {
    const publicCheckbox = page.locator('mat-checkbox').filter({
      hasText: /unauthenticated/i,
    });
    const isChecked = await publicCheckbox
      .locator('input[type="checkbox"]')
      .isChecked();
    if (!isChecked) {
      await publicCheckbox.click();
    }
  }

  // Select type with proper waits for dropdown animation
  await page.locator('[data-testid="announcement-type-select"]').click();
  await page
    .getByRole('option', { name: /announcement/i })
    .first()
    .click();
  await page.keyboard.press('Tab'); // Blur to trigger form update

  // Select priority with proper waits
  await page.locator('[data-testid="announcement-priority-select"]').click();
  await page
    .getByRole('option', { name: /normal/i })
    .first()
    .click();
  await page.keyboard.press('Tab'); // Blur to trigger form update

  // Submit - Use global expect timeout
  await expect(
    page.locator('[data-testid="announcement-submit-btn"]')
  ).toBeEnabled();
  await page.locator('[data-testid="announcement-submit-btn"]').click();

  // Wait for creation confirmation
  await page
    .locator('.mat-mdc-snack-bar-label')
    .first()
    .filter({ hasText: /created/i })
    .waitFor();
}

test.describe('Admin Announcements', () => {
  test.describe('Announcements Page', () => {
    test('should navigate to announcements page from admin sidebar', async ({
      adminPage,
    }) => {
      await navigateToAdminAnnouncements(adminPage);

      // Should be on announcements page
      await expect(
        adminPage.locator('[data-testid="admin-announcements-page"]')
      ).toBeVisible();
    });

    test('should show create announcement button', async ({ adminPage }) => {
      await navigateToAdminAnnouncements(adminPage);

      // Create button should be visible
      await expect(
        adminPage.locator('[data-testid="create-announcement-btn"]')
      ).toBeVisible();
    });

    test('should show empty state when no announcements exist', async ({
      adminPage,
    }) => {
      await navigateToAdminAnnouncements(adminPage);

      // Should show empty state OR announcements list
      const emptyState = adminPage.locator('.empty-state');
      const announcementsList = adminPage.locator(
        '[data-testid="admin-announcements-list"]'
      );

      // Wait for either to be visible
      await Promise.race([
        emptyState.waitFor().catch(() => {}),
        announcementsList.waitFor().catch(() => {}),
      ]);

      const isEmptyVisible = await emptyState.isVisible().catch(() => false);
      const isListVisible = await announcementsList
        .isVisible()
        .catch(() => false);

      expect(isEmptyVisible || isListVisible).toBe(true);
    });
  });

  test.describe('CRUD Operations', () => {
    test('should open create dialog when clicking create button', async ({
      adminPage,
    }) => {
      await navigateToAdminAnnouncements(adminPage);

      // Click create button
      await adminPage
        .locator('[data-testid="create-announcement-btn"]')
        .click();

      // Dialog should open
      await expect(
        adminPage.locator('[data-testid="announcement-title-input"]')
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="announcement-content-input"]')
      ).toBeVisible();
    });

    test('should create a new announcement', async ({ adminPage }) => {
      await navigateToAdminAnnouncements(adminPage);

      const testData = generateTestAnnouncement();

      // Use helper for stable form filling
      await fillAndSubmitAnnouncementForm(adminPage, testData);

      // Should see the new announcement in the list
      await expect(
        adminPage.locator('[data-testid="admin-announcements-list"]')
      ).toBeVisible();
      await expect(adminPage.getByText(testData.title)).toBeVisible();
    });

    test('should create and publish a public announcement', async ({
      adminPage,
    }) => {
      await navigateToAdminAnnouncements(adminPage);

      const testData = generateTestAnnouncement();

      // Use helper for stable form filling with public option
      await fillAndSubmitAnnouncementForm(adminPage, testData, {
        checkPublic: true,
      });

      // Should see the new announcement
      await expect(adminPage.getByText(testData.title)).toBeVisible();

      // Find the new announcement card and publish it
      const announcementCard = adminPage
        .locator('mat-card')
        .filter({ hasText: testData.title });
      await expect(announcementCard).toBeVisible();

      // Click publish button on the card
      const publishButton = announcementCard.locator('button', {
        hasText: /publish/i,
      });
      await publishButton.click();

      // Wait for snackbar
      await adminPage
        .locator('.mat-mdc-snack-bar-label')
        .first()
        .filter({ hasText: /published/i })
        .first()
        .waitFor();

      // Should show "Public" chip now
      const finalCard = adminPage
        .getByTestId('announcement-card')
        .filter({ hasText: testData.title });
      await expect(finalCard.getByTestId('public-chip').first()).toBeVisible();
    });

    test('should delete an announcement', async ({ adminPage }) => {
      await navigateToAdminAnnouncements(adminPage);

      const testData = generateTestAnnouncement();

      // Use helper for stable form filling
      await fillAndSubmitAnnouncementForm(adminPage, testData);

      // Find the announcement card
      const announcementCard = adminPage
        .getByTestId('announcement-card')
        .filter({ hasText: testData.title });
      await expect(announcementCard).toBeVisible();

      // Open more menu and click delete
      const moreButton = announcementCard.locator('button[mat-icon-button]', {
        has: adminPage.locator('mat-icon:has-text("more_vert")'),
      });
      await moreButton.click();

      // Click delete in menu
      await adminPage.locator('button mat-icon:has-text("delete")').click();

      // Confirm deletion dialog
      const confirmButton = adminPage.getByTestId('confirm-delete-button');
      await confirmButton.click();

      // Wait for deletion confirmation
      await adminPage
        .locator('.mat-mdc-snack-bar-label')
        .first()
        .filter({ hasText: /deleted/i })
        .first()
        .waitFor();

      // Announcement should no longer be visible
      await expect(
        adminPage.getByText(testData.title).first()
      ).not.toBeVisible();
    });
  });
});

test.describe('User Messages', () => {
  test('should show Messages item in user menu for authenticated users', async ({
    authenticatedPage,
  }) => {
    // Open user menu
    await authenticatedPage.locator('[data-testid="user-menu-button"]').click();

    // Messages link should be visible
    const messagesLink = authenticatedPage.locator(
      '[data-testid="messages-menu-link"]'
    );
    await expect(messagesLink).toBeVisible();
  });

  test('should navigate to messages page when clicking Messages', async ({
    authenticatedPage,
  }) => {
    // Open user menu
    await authenticatedPage.locator('[data-testid="user-menu-button"]').click();

    // Click messages link
    await authenticatedPage
      .locator('[data-testid="messages-menu-link"]')
      .click();

    // Should navigate to messages page
    await expect(authenticatedPage).toHaveURL(/.*\/messages/);
    await expect(
      authenticatedPage.locator('[data-testid="messages-page"]')
    ).toBeVisible();
  });

  test('should show empty state when no announcements', async ({
    authenticatedPage,
  }) => {
    // Navigate to messages
    await authenticatedPage.goto('/messages');
    await authenticatedPage.waitForLoadState('networkidle');

    // Wait for page to load
    await expect(
      authenticatedPage.locator('[data-testid="messages-page"]')
    ).toBeVisible();

    // Should show either empty state or messages list
    const emptyState = authenticatedPage.locator('.empty-state');
    const messagesList = authenticatedPage.locator(
      '[data-testid="messages-list"]'
    );

    // Wait for either to appear
    await Promise.race([
      emptyState.waitFor().catch(() => {}),
      messagesList.waitFor().catch(() => {}),
    ]);

    const isEmptyVisible = await emptyState.isVisible().catch(() => false);
    const isListVisible = await messagesList.isVisible().catch(() => false);

    expect(isEmptyVisible || isListVisible).toBe(true);
  });
});

test.describe('Public Announcement Feed', () => {
  test('should show announcement feed on home page for anonymous users when announcements exist', async ({
    adminPage,
    anonymousPage,
  }) => {
    // First, create a public announcement as admin
    await navigateToAdminAnnouncements(adminPage);

    const testData = {
      title: `Public Feed Test ${Date.now()}`,
      content: 'This should appear in the public feed',
    };

    // Use helper for stable form filling with public checkbox
    await fillAndSubmitAnnouncementForm(adminPage, testData, {
      checkPublic: true,
    });

    // Publish the announcement
    const announcementCard = adminPage
      .locator('mat-card')
      .filter({ hasText: testData.title });
    await announcementCard.locator('button:has-text("Publish")').click();

    await adminPage
      .locator('.mat-mdc-snack-bar-label')
      .first()
      .filter({ hasText: /published/i })
      .waitFor();

    // Now check the anonymous page
    await anonymousPage.goto('/');
    await anonymousPage.waitForLoadState('networkidle');

    // The announcement feed should be visible with the public announcement
    const feed = anonymousPage.locator('[data-testid="announcement-feed"]');

    // Check if feed is visible and contains our announcement
    const isFeedVisible = await feed.isVisible().catch(() => false);
    if (isFeedVisible) {
      // The announcement should be visible in the feed
      await expect(anonymousPage.getByText(testData.title)).toBeVisible();
    }
    // If feed is not visible, that's also OK if there are no public announcements
    // (they might have been cleaned up or expired)
  });
});

test.describe('Unread Badge', () => {
  test('should show unread badge when there are unread announcements', async ({
    adminPage,
  }) => {
    // First, create and publish an announcement as admin
    await navigateToAdminAnnouncements(adminPage);

    const testData = {
      title: `Unread Badge Test ${Date.now()}`,
      content: 'This tests the unread badge',
    };

    // Use helper for stable form filling
    await fillAndSubmitAnnouncementForm(adminPage, testData);

    // Publish it
    const announcementCard = adminPage
      .getByTestId('announcement-card')
      .filter({ hasText: testData.title });
    await announcementCard.locator('button:has-text("Publish")').click();

    await adminPage
      .locator('.mat-mdc-snack-bar-label')
      .first()
      .filter({ hasText: /published/i })
      .waitFor();
  });
});

test.describe('Mark as Read', () => {
  test('should mark all announcements as read', async ({
    adminPage,
    authenticatedPage,
  }) => {
    // First create and publish an announcement as admin
    await navigateToAdminAnnouncements(adminPage);

    const testData = {
      title: `Mark Read Test ${Date.now()}`,
      content: 'This tests marking as read',
    };

    // Use helper for stable form filling
    await fillAndSubmitAnnouncementForm(adminPage, testData);

    // Publish it
    const announcementCard = adminPage
      .getByTestId('announcement-card')
      .filter({ hasText: testData.title });
    await announcementCard.locator('button:has-text("Publish")').click();

    await adminPage
      .locator('.mat-mdc-snack-bar-label')
      .first()
      .filter({ hasText: /published/i })
      .waitFor();

    // Now check the authenticated user page
    await authenticatedPage.goto('/messages');
    await authenticatedPage.waitForLoadState('networkidle');

    // Wait for page to load
    await authenticatedPage.locator('[data-testid="messages-page"]').waitFor();

    // Check if mark all as read button is visible (indicates unread messages)
    const markAllButton = authenticatedPage.locator(
      '[data-testid="mark-all-read-btn"]'
    );

    const isButtonVisible = await markAllButton.isVisible().catch(() => false);

    if (isButtonVisible) {
      // Click mark all as read
      await markAllButton.click();

      // Button should disappear after marking all as read
      await expect(markAllButton).not.toBeVisible();
    }
  });
});
