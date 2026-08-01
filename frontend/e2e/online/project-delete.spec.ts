/**
 * Project Delete from Cover Menu - Online Mode
 *
 * Verifies the "Delete project" option on the home/project list kebab menu:
 * - The delete menu item appears on owned project covers
 * - The confirmation dialog requires typing the project slug
 * - Cancelling leaves the project intact
 * - Confirming deletes the project and removes its card from the list
 * - The delete option is hidden on shared (collaborated) project covers
 *
 * IMPORTANT: These tests destroy project data, so each test creates its
 * own throwaway project and deletes it within the same test.
 */
import { generateUniqueSlug } from '../common';
import { TEST_PASSWORDS } from '../common/test-credentials';
import { expect, test } from './fixtures';

test.describe('Delete project from cover kebab menu', () => {
  test('delete flow: dialog, slug gating, cancel, and final deletion', async ({
    authenticatedPage: page,
  }) => {
    const slug = generateUniqueSlug('cover-delete');

    await test.step('create a throwaway project and return to home', async () => {
      await page.goto('/create-project');
      await page.getByRole('button', { name: /next/i }).click();
      await page.getByTestId('project-title-input').fill('Cover Delete Test');
      await page.getByTestId('project-slug-input').fill(slug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(slug));
      await page.waitForLoadState('networkidle');

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page.getByTestId('project-card').first()).toBeVisible();
    });

    await test.step('kebab menu exposes a Delete option', async () => {
      // Open the kebab menu on the first project card.
      await page.locator('[data-testid="project-card-kebab"]').first().click();
      await expect(page.getByTestId('project-card-delete')).toBeVisible();
    });

    await test.step('clicking Delete opens a confirmation dialog gated on the slug', async () => {
      await page.getByTestId('project-card-delete').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      // The slug the user must type to confirm should be shown.
      await expect(dialog.getByText(new RegExp(slug)).first()).toBeVisible();

      // Confirm is disabled until the exact slug is typed.
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();

      const input = dialog.getByTestId('confirm-dialog-input');
      await input.waitFor({ state: 'visible' });
      await input.fill('wrong-slug');
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();

      await input.fill(slug);
      await expect(page.getByTestId('confirm-delete-button')).toBeEnabled();
    });

    await test.step('cancel keeps the project card on the home screen', async () => {
      await page.getByTestId('cancel-dialog-button').click();
      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).not.toBeVisible();

      // Reload to confirm the project still exists on the server.
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const cards = page.getByTestId('project-card');
      await expect(cards.first()).toBeVisible();
      const beforeCount = await cards.count();
      expect(beforeCount).toBeGreaterThan(0);
    });

    await test.step('confirming deletes the project and removes its card', async () => {
      // Re-open the kebab menu and confirm the deletion this time.
      await page.locator('[data-testid="project-card-kebab"]').first().click();
      await page.getByTestId('project-card-delete').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      const input = dialog.getByTestId('confirm-dialog-input');
      await input.waitFor({ state: 'visible' });
      await input.fill(slug);

      const beforeCount = await page.getByTestId('project-card').count();

      await page.getByTestId('confirm-delete-button').click();
      await page.waitForLoadState('networkidle');

      // The deleted project's card should no longer be present.
      await expect(page.getByTestId('project-card')).toHaveCount(
        beforeCount - 1
      );
      await expect(page.getByText('Cover Delete Test')).not.toBeVisible();
    });
  });

  test('delete option is hidden on shared (collaborated) project covers', async ({
    authenticatedPage: page,
    browser,
    request,
  }) => {
    // Provision a real shared project so the shared-badge branch is guaranteed
    // to execute: the authenticatedPage user owns a project and invites a
    // freshly registered collaborator, who then loads home and inspects the
    // shared card.
    const apiUrl = new URL(page.url()).origin;
    const ownerToken = await page.evaluate(() =>
      localStorage.getItem('srv:server-1:auth_token')
    );
    expect(ownerToken).toBeTruthy();

    // Register a second user (the collaborator) via the API.
    const collaboratorUsername = `collab-${Date.now()}`;
    const collaboratorPassword = TEST_PASSWORDS.USER;
    const registerRes = await request.post(`${apiUrl}/api/v1/auth/register`, {
      data: { username: collaboratorUsername, password: collaboratorPassword },
    });
    expect(registerRes.ok()).toBeTruthy();
    const collaboratorToken = ((await registerRes.json()) as { token: string })
      .token;

    // Owner creates a project via the API. The response includes the owner's
    // username, which is needed to invite a collaborator.
    const slug = generateUniqueSlug('shared-delete');
    const projectRes = await request.post(`${apiUrl}/api/v1/projects/`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { slug, title: 'Shared Delete Test' },
    });
    expect(projectRes.ok()).toBeTruthy();
    const project = (await projectRes.json()) as {
      id: string;
      username: string;
    };

    // Owner invites the collaborator (viewer role).
    const inviteRes = await request.post(
      `${apiUrl}/api/v1/collaboration/${project.username}/${slug}/collaborators`,
      {
        headers: { Authorization: `Bearer ${ownerToken}` },
        data: { username: collaboratorUsername, role: 'viewer' },
      }
    );
    expect(inviteRes.ok()).toBeTruthy();

    // Collaborator accepts the invitation.
    const acceptRes = await request.post(
      `${apiUrl}/api/v1/collaboration/invitations/${project.id}/accept`,
      {
        headers: { Authorization: `Bearer ${collaboratorToken}` },
      }
    );
    expect(acceptRes.ok()).toBeTruthy();

    // Load home as the collaborator in a fresh context and wait for the
    // shared card to appear.
    const collabContext = await browser.newContext();
    const collabPage = await collabContext.newPage();
    try {
      await collabPage.addInitScript(
        ({
          authToken,
          serverUrl,
        }: {
          authToken: string;
          serverUrl: string;
        }) => {
          const now = Date.now();
          localStorage.setItem(
            'inkweld-app-config',
            JSON.stringify({
              version: 2,
              activeConfigId: 'server-1',
              configurations: [
                {
                  id: 'server-1',
                  type: 'server',
                  displayName: 'Test Server',
                  serverUrl,
                  addedAt: now,
                  lastUsedAt: now,
                },
              ],
            })
          );
          localStorage.setItem('srv:server-1:auth_token', authToken);
        },
        { authToken: collaboratorToken, serverUrl: apiUrl }
      );
      await collabPage.goto('/');
      await collabPage.waitForLoadState('networkidle');

      // The shared project should appear as a card with a shared badge.
      const sharedCard = collabPage
        .getByTestId('project-card')
        .filter({ hasText: 'Shared Delete Test' })
        .first();
      await expect(sharedCard).toBeVisible();
      await expect(sharedCard.locator('.shared-badge')).toBeVisible();

      // Open its kebab menu; the Delete option must not be present.
      await sharedCard.locator('[data-testid="project-card-kebab"]').click();
      await expect(collabPage.getByTestId('project-card-delete')).toBeHidden();
    } finally {
      await collabContext.close();
    }
  });
});
