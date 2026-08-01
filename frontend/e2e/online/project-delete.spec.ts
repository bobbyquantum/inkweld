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
    const projectTitle = 'Cover Delete Test';

    /** Locate the specific card for the throwaway project by its title. */
    const projectCard = () =>
      page
        .getByTestId('project-card')
        .filter({ hasText: projectTitle })
        .first();

    await test.step('create a throwaway project and return to home', async () => {
      await page.goto('/create-project');
      await page.getByRole('button', { name: /next/i }).click();
      await page.getByTestId('project-title-input').fill(projectTitle);
      await page.getByTestId('project-slug-input').fill(slug);
      await page.getByTestId('create-project-button').click();
      await page.waitForURL(new RegExp(slug));
      await page.waitForLoadState('networkidle');

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(projectCard()).toBeVisible();
    });

    await test.step('kebab menu exposes a Delete option', async () => {
      await projectCard().locator('[data-testid="project-card-kebab"]').click();
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
      await expect(projectCard()).toBeVisible();
    });

    await test.step('confirming deletes the project and removes its card', async () => {
      // Re-open the kebab menu on the target card and confirm the deletion.
      await projectCard().locator('[data-testid="project-card-kebab"]').click();
      await page.getByTestId('project-card-delete').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      const input = dialog.getByTestId('confirm-dialog-input');
      await input.waitFor({ state: 'visible' });
      await input.fill(slug);

      await page.getByTestId('confirm-delete-button').click();
      await page.waitForLoadState('networkidle');

      // The deleted project's card should no longer be present on the home
      // grid. (For a fresh test user with only this project, the grid becomes
      // the empty state, so checking the specific card — not a total count —
      // is the stable assertion.)
      await expect(projectCard()).toHaveCount(0);
    });
  });

  test('delete option is hidden on shared (collaborated) project covers', async ({
    authenticatedPage: page,
    browser,
  }) => {
    // Provision a real shared project so the shared-badge branch is guaranteed
    // to execute: the authenticatedPage user owns a project and invites a
    // freshly registered collaborator, who then loads home and inspects the
    // shared card. All API calls go through in-page fetch so they inherit the
    // page's backend URL and avoid request-fixture baseURL mismatches.
    const apiUrl = await page.evaluate(() => {
      const cfg = localStorage.getItem('inkweld-app-config');
      if (!cfg) throw new Error('app config missing');
      const parsed = JSON.parse(cfg) as {
        configurations: Array<{ serverUrl?: string }>;
      };
      const active = parsed.configurations.find(c => c.serverUrl);
      return active?.serverUrl ?? '';
    });

    // Register a second user (the collaborator) via the API.
    const collaboratorUsername = `collab-${Date.now()}`;
    const collaboratorPassword = TEST_PASSWORDS.USER;
    const collaboratorToken = await page.evaluate(
      async ({ apiUrl, username, password }) => {
        const res = await fetch(`${apiUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) throw new Error(`register failed: ${res.status}`);
        return ((await res.json()) as { token: string }).token;
      },
      { apiUrl, username: collaboratorUsername, password: collaboratorPassword }
    );

    // Owner creates a project via the API. The response includes the owner's
    // username, which is needed to invite a collaborator.
    const ownerToken = await page.evaluate(() =>
      localStorage.getItem('srv:server-1:auth_token')
    );
    expect(ownerToken).toBeTruthy();

    const slug = generateUniqueSlug('shared-delete');
    const project = await page.evaluate(
      async ({ apiUrl, ownerToken, slug }) => {
        const res = await fetch(`${apiUrl}/api/v1/projects/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerToken}`,
          },
          body: JSON.stringify({ slug, title: 'Shared Delete Test' }),
        });
        if (!res.ok) throw new Error(`create project failed: ${res.status}`);
        return (await res.json()) as { id: string; username: string };
      },
      { apiUrl, ownerToken, slug }
    );

    // Owner invites the collaborator (viewer role).
    await page.evaluate(
      async ({ apiUrl, ownerToken, ownerName, slug, collaborator }) => {
        const res = await fetch(
          `${apiUrl}/api/v1/collaboration/${ownerName}/${slug}/collaborators`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${ownerToken}`,
            },
            body: JSON.stringify({ username: collaborator, role: 'viewer' }),
          }
        );
        if (!res.ok) throw new Error(`invite failed: ${res.status}`);
      },
      {
        apiUrl,
        ownerToken,
        ownerName: project.username,
        slug,
        collaborator: collaboratorUsername,
      }
    );

    // Collaborator accepts the invitation.
    await page.evaluate(
      async ({ apiUrl, collaboratorToken, projectId }) => {
        const res = await fetch(
          `${apiUrl}/api/v1/collaboration/invitations/${projectId}/accept`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${collaboratorToken}` },
          }
        );
        if (!res.ok) throw new Error(`accept failed: ${res.status}`);
      },
      { apiUrl, collaboratorToken, projectId: project.id }
    );

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
