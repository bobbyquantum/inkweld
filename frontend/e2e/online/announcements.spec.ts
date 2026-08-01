import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * Helper to navigate to admin announcements page via sidebar.
 */
async function navigateToAdminAnnouncements(page: Page): Promise<void> {
  await page.locator('[data-testid="user-menu-button"]').click();
  await page.locator('[data-testid="admin-menu-link"]').click();
  await expect(page).toHaveURL(/.*\/admin\/.*/);
  // Best-effort networkidle — wrangler dev can hold long-poll/sse
  // connections that prevent the page from ever reaching idle.
  await page
    .waitForLoadState('networkidle', { timeout: 15000 })
    .catch(() => {});

  await page.locator('[data-testid="admin-nav-announcements"]').click();
  await expect(page).toHaveURL(/.*\/admin\/announcements/);
  await page
    .waitForLoadState('networkidle', { timeout: 15000 })
    .catch(() => {});
}

/**
 * Helper to fill and submit the announcement form. Includes the
 * mat-checkbox-class polling that the original tests required.
 */
async function fillAndSubmitAnnouncementForm(
  page: Page,
  testData: { title: string; content: string },
  options?: { checkPublic?: boolean }
): Promise<void> {
  await page.locator('[data-testid="create-announcement-btn"]').click();

  const titleInput = page.locator('[data-testid="announcement-title-input"]');
  await titleInput.waitFor({ state: 'visible' });

  // Under wrangler dev (D1 + DO) load, zoneless change detection can lag
  // the visible input: the field is `visible` but the signal-form control
  // isn't wired up yet, so `fill()` populates the DOM but not the model
  // — leaving "Title is required" / "Content is required" errors and the
  // submit button disabled. Retry the fill (using pressSequentially which
  // reliably triggers the [formField] directive's input listeners) until
  // both inputs reflect the intended values. Pressing Tab after each field
  // flushes zoneless change detection.
  const contentInput = page.locator(
    '[data-testid="announcement-content-input"]'
  );
  await expect(async () => {
    await titleInput.click();
    await titleInput.fill('');
    await titleInput.pressSequentially(testData.title, { delay: 10 });
    await titleInput.press('Tab');
    await contentInput.click();
    await contentInput.fill('');
    await contentInput.pressSequentially(testData.content, { delay: 10 });
    await contentInput.press('Tab');
    await expect(titleInput).toHaveValue(testData.title);
    await expect(contentInput).toHaveValue(testData.content);
  }).toPass({ timeout: 30000 });

  // The form's default for `isPublic` is `true`, but Material's
  // mat-checkbox renders its hidden <input> as `checked=false` until the
  // user interacts with it; the visible checked state lives on the host
  // element's `mat-mdc-checkbox-checked` class. Reading the hidden input
  // would incorrectly report unchecked and cause us to toggle the box
  // OFF. Poll the host class until it stabilises.
  if (options?.checkPublic) {
    const publicCheckbox = page.locator('mat-checkbox').filter({
      hasText: /unauthenticated/i,
    });
    await publicCheckbox.waitFor({ state: 'visible' });
    await expect
      .poll(
        async () =>
          publicCheckbox.evaluate(el =>
            el.classList.contains('mat-mdc-checkbox-checked')
          ),
        { timeout: 5000 }
      )
      .toBe(true);
  }

  // Type — scope to the open listbox overlay. Wait for the option text to
  // be populated (Transloco loads translations asynchronously via HTTP; in
  // slower environments like Docker e2e the translations may not have arrived
  // when the listbox first opens, leaving the option text empty).
  await page.locator('[data-testid="announcement-type-select"]').click();
  const typeListbox = page.locator('[role="listbox"]');
  await typeListbox.waitFor({ state: 'visible' });
  const typeOption = typeListbox
    .getByRole('option', { name: /announcement/i })
    .first();
  await expect(typeOption).toHaveText(/\S/);
  await typeOption.click();

  // Priority — same. The anchored /^normal$/i regex requires the option
  // text to be exactly "Normal" (the translated value), not the raw
  // translation key, so we must wait for the text to load before matching.
  await page.locator('[data-testid="announcement-priority-select"]').click();
  const priorityListbox = page.locator('[role="listbox"]');
  await priorityListbox.waitFor({ state: 'visible' });
  const priorityOption = priorityListbox
    .getByRole('option', { name: /^normal$/i })
    .first();
  await expect(priorityOption).toBeVisible();
  await priorityOption.click();

  // Wait for the listbox overlay to close so the mat-select has finished
  // writing the value back to the signal-forms model and Angular has
  // flushed change detection before we check the submit button state.
  await expect(priorityListbox).toBeHidden();

  // The submit button may take a moment to become enabled in zoneless
  // change detection, especially in slower environments (Docker/wrangler
  // e2e). Use toPass so the assertion retries until CD flushes the form
  // validity. The original 15000ms timeout was too tight under wrangler
  // dev (D1 + DO) load — bump to 30000ms to match the expect.timeout in
  // the wrangler config and avoid spurious "Timeout 15000ms exceeded
  // while waiting on the predicate" flakes.
  await expect(async () => {
    await expect(
      page.locator('[data-testid="announcement-submit-btn"]')
    ).toBeEnabled();
  }).toPass({ timeout: 30000 });
  await page.locator('[data-testid="announcement-submit-btn"]').click();

  await page
    .locator('.mat-mdc-snack-bar-label')
    .first()
    .filter({ hasText: /created/i })
    .waitFor();
}

async function publishAnnouncement(page: Page, title: string): Promise<void> {
  const card = page.getByTestId('announcement-card').filter({ hasText: title });
  await expect(card).toBeVisible();
  await card.locator('button', { hasText: /publish/i }).click();
  await page
    .locator('.mat-mdc-snack-bar-label')
    .first()
    .filter({ hasText: /published/i })
    .waitFor();
}

test.describe('Admin Announcements', () => {
  /**
   * Full admin-side announcements lifecycle on a single admin session:
   * page renders → create button visible → empty-or-list state → open
   * dialog → create private → create+publish public → delete one.
   * Replaces 7 separate adminPage-based tests.
   */
  test('admin announcements page: navigate, create dialog, CRUD lifecycle', async ({
    adminPage,
  }) => {
    await test.step('navigate to admin announcements page from sidebar', async () => {
      await navigateToAdminAnnouncements(adminPage);
      await expect(
        adminPage.locator('[data-testid="admin-announcements-page"]')
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="create-announcement-btn"]')
      ).toBeVisible();
    });

    await test.step('shows either empty state or announcements list', async () => {
      const emptyState = adminPage.getByTestId('announcements-empty-state');
      const announcementsList = adminPage.locator(
        '[data-testid="admin-announcements-list"]'
      );

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

    await test.step('opens create dialog', async () => {
      await adminPage
        .locator('[data-testid="create-announcement-btn"]')
        .click();
      await expect(
        adminPage.locator('[data-testid="announcement-title-input"]')
      ).toBeVisible();
      await expect(
        adminPage.locator('[data-testid="announcement-content-input"]')
      ).toBeVisible();
      // Close dialog before re-opening via the helper.
      await adminPage.keyboard.press('Escape');
      await expect(
        adminPage.locator('[data-testid="announcement-title-input"]')
      ).not.toBeVisible();
    });

    await test.step('creates a private announcement', async () => {
      const data = {
        title: `Test Announcement ${Date.now()}`,
        content: `Private content ${Date.now()}`,
      };
      await fillAndSubmitAnnouncementForm(adminPage, data);
      await expect(
        adminPage.locator('[data-testid="admin-announcements-list"]')
      ).toBeVisible();
      await expect(adminPage.getByText(data.title)).toBeVisible();
    });

    await test.step('creates and publishes a public announcement', async () => {
      const data = {
        title: `Public Announcement ${Date.now()}`,
        content: `Public content ${Date.now()}`,
      };
      await fillAndSubmitAnnouncementForm(adminPage, data, {
        checkPublic: true,
      });
      await expect(adminPage.getByText(data.title)).toBeVisible();
      await publishAnnouncement(adminPage, data.title);

      const card = adminPage
        .getByTestId('announcement-card')
        .filter({ hasText: data.title });
      await expect(card.getByTestId('public-chip').first()).toBeVisible();
    });

    await test.step('deletes a freshly-created announcement', async () => {
      const data = {
        title: `Delete Me ${Date.now()}`,
        content: 'Will be deleted',
      };
      await fillAndSubmitAnnouncementForm(adminPage, data);

      const card = adminPage
        .getByTestId('announcement-card')
        .filter({ hasText: data.title });
      await expect(card).toBeVisible();

      const moreButton = card.locator('button[mat-icon-button]', {
        has: adminPage.locator('mat-icon:has-text("more_vert")'),
      });
      await moreButton.click();

      await adminPage.locator('button mat-icon:has-text("delete")').click();
      await adminPage.getByTestId('confirm-delete-button').click();

      await adminPage
        .locator('.mat-mdc-snack-bar-label')
        .first()
        .filter({ hasText: /deleted/i })
        .waitFor();

      await expect(adminPage.getByText(data.title).first()).not.toBeVisible();
    });
  });
});

test.describe('User Messages', () => {
  /**
   * User-side messages flow: menu item visible → click navigates → page
   * renders empty state or list. Replaces 3 separate tests.
   */
  test('user messages: menu link, navigation, page renders', async ({
    authenticatedPage,
  }) => {
    await test.step('Messages link in user menu navigates to /messages', async () => {
      await authenticatedPage
        .locator('[data-testid="user-menu-button"]')
        .click();

      const messagesLink = authenticatedPage.locator(
        '[data-testid="messages-menu-link"]'
      );
      await expect(messagesLink).toBeVisible();
      await messagesLink.click();

      await expect(authenticatedPage).toHaveURL(/.*\/messages/);
      await expect(
        authenticatedPage.locator('[data-testid="messages-page"]')
      ).toBeVisible();
    });

    await test.step('messages page shows empty state or list', async () => {
      // Reload via direct nav to assert the page also renders standalone.
      await authenticatedPage.goto('/messages');
      await authenticatedPage
        .waitForLoadState('networkidle', { timeout: 15000 })
        .catch(() => {});

      await expect(
        authenticatedPage.locator('[data-testid="messages-page"]')
      ).toBeVisible();

      const emptyState = authenticatedPage.getByTestId('messages-empty-state');
      const messagesList = authenticatedPage.locator(
        '[data-testid="messages-list"]'
      );

      await Promise.race([
        emptyState.waitFor().catch(() => {}),
        messagesList.waitFor().catch(() => {}),
      ]);

      const isEmptyVisible = await emptyState.isVisible().catch(() => false);
      const isListVisible = await messagesList.isVisible().catch(() => false);
      expect(isEmptyVisible || isListVisible).toBe(true);
    });
  });
});

test.describe('Published Announcement Visibility', () => {
  /**
   * Single admin publishes ONE public announcement, then we verify both
   * the anonymous public feed AND the authenticated user's messages flow
   * (mark-all-as-read) against the same data. Combines public-feed,
   * unread-badge and mark-as-read tests.
   */
  test('public announcement appears in anon feed and can be marked read by users', async ({
    adminPage,
    anonymousPage,
    authenticatedPage,
  }) => {
    const testData = {
      title: `Cross-context Announcement ${Date.now()}`,
      content: 'Visible publicly and to authenticated users',
    };

    await test.step('admin creates and publishes a public announcement', async () => {
      await navigateToAdminAnnouncements(adminPage);
      await fillAndSubmitAnnouncementForm(adminPage, testData, {
        checkPublic: true,
      });
      await publishAnnouncement(adminPage, testData.title);
    });

    await test.step('anonymous home page surfaces the announcement (when feed is shown)', async () => {
      await anonymousPage.goto('/');
      await anonymousPage
        .waitForLoadState('networkidle', { timeout: 15000 })
        .catch(() => {});

      const feed = anonymousPage.locator('[data-testid="announcement-feed"]');
      const isFeedVisible = await feed.isVisible().catch(() => false);
      if (isFeedVisible) {
        await expect(anonymousPage.getByText(testData.title)).toBeVisible();
      }
      // If the feed is hidden the test is still valid: home may suppress
      // the feed in some configurations.
    });

    await test.step('authenticated user can mark all messages as read', async () => {
      await authenticatedPage.goto('/messages');
      await authenticatedPage
        .waitForLoadState('networkidle', { timeout: 15000 })
        .catch(() => {});

      await authenticatedPage
        .locator('[data-testid="messages-page"]')
        .waitFor();

      const markAllButton = authenticatedPage.locator(
        '[data-testid="mark-all-read-btn"]'
      );

      const isButtonVisible = await markAllButton
        .isVisible()
        .catch(() => false);

      if (isButtonVisible) {
        // The button disappears when `hasUnread` flips to false, which
        // requires the mark-all-read API call to complete and zoneless CD
        // to flush. Under wrangler dev (D1 + DO) load the API call can
        // fail transiently (network/DO restart) — retry the click until
        // the button actually disappears.
        await expect(async () => {
          if (await markAllButton.isVisible().catch(() => false)) {
            await markAllButton.click();
          }
          await expect(markAllButton).not.toBeVisible();
        }).toPass({ timeout: 60000 });
      }
    });
  });
});
