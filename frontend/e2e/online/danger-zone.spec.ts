/**
 * Danger Zone E2E Tests - Online Mode
 *
 * Tests project rename and delete flows within the
 * Project Settings > Danger Zone section using the real backend.
 *
 * IMPORTANT: Delete tests run LAST because they destroy project data.
 */
import type { Browser, BrowserContext } from '@playwright/test';

import { createProjectWithTwoSteps } from '../common/test-helpers';
import { expect, getApiBaseUrl, type Page, test } from './fixtures';

function getProjectBaseUrl(page: Page): string {
  const pathParts = new URL(page.url()).pathname.split('/').filter(Boolean);
  return `/${pathParts.slice(0, 2).join('/')}`;
}

async function navigateToDangerZone(
  page: Page,
  projectBaseUrl: string
): Promise<void> {
  await page.goto(`${projectBaseUrl}/settings`);
  await expect(page.getByTestId('settings-tab-content')).toBeVisible();
  await page.getByTestId('nav-danger').click();

  await page.getByTestId('danger-zone-section').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('danger-zone-section')).toBeVisible();
}

async function setupProjectAndNavigateToDanger(
  page: Page,
  prefix: string
): Promise<{ slug: string; baseUrl: string; title: string }> {
  await page.goto('/');
  const slug = `${prefix}-${Date.now()}`;
  const title = `${prefix} Project`;
  await createProjectWithTwoSteps(page, title, slug);
  const baseUrl = getProjectBaseUrl(page);
  await navigateToDangerZone(page, baseUrl);
  return { slug, baseUrl, title };
}

/** 1x1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function authToken(page: Page): Promise<string> {
  const token = await page.evaluate(() =>
    localStorage.getItem('srv:server-1:auth_token')
  );
  expect(token).toBeTruthy();
  return token!;
}

/**
 * Another device signed in as the same user: its own browser context, so
 * it starts with nothing stored locally.
 */
async function openOtherDevice(
  browser: Browser,
  token: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('console', () => {});
  await page.addInitScript(
    ({ authToken, serverUrl }: { authToken: string; serverUrl: string }) => {
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
      localStorage.setItem('inkweld-tutorial-autostart', 'off');
    },
    { authToken: token, serverUrl: getApiBaseUrl() }
  );
  return { context, page };
}

/**
 * Open a project this device has not stored: download it from the server
 * through the project cover, then go in.
 */
async function openFromServer(page: Page, projectTitle: string): Promise<void> {
  await page.goto('/');
  await page
    .getByTestId('project-card')
    .filter({ hasText: projectTitle })
    .first()
    .click();
  const begin = page.getByTestId('cover-open-begin');
  await expect(begin).toContainText('Download to this device');
  await begin.click();
  await expect(begin).toContainText('Begin');
  await begin.click();
  await expect(page.getByTestId('project-tree')).toBeVisible();
}

test.describe('Danger Zone', () => {
  /**
   * Full rename UX on a single project: form open/close, slug validation,
   * and a successful rename at the end (which navigates the page away).
   */
  test('rename project: form, validation, cancel, and successful rename', async ({
    authenticatedPage: page,
  }) => {
    const { baseUrl } = await setupProjectAndNavigateToDanger(page, 'rename');

    await test.step('shows the rename form when clicking Rename', async () => {
      await expect(page.getByTestId('rename-project-card')).toBeVisible();
      await expect(page.getByTestId('rename-project-button')).toBeVisible();

      await page.getByTestId('rename-project-button').click();

      await expect(page.getByTestId('new-slug-input')).toBeVisible();
      await expect(page.getByTestId('cancel-rename-button')).toBeVisible();
      await expect(page.getByTestId('confirm-rename-button')).toBeVisible();
      await expect(page.getByTestId('rename-project-button')).not.toBeVisible();
    });

    await test.step('cancel hides the form', async () => {
      await page.getByTestId('cancel-rename-button').click();
      await expect(page.getByTestId('rename-project-button')).toBeVisible();
      await expect(page.getByTestId('new-slug-input')).not.toBeVisible();
    });

    await test.step('disables confirm for invalid slugs', async () => {
      await page.getByTestId('rename-project-button').click();
      await expect(page.getByTestId('new-slug-input')).toBeVisible();

      const invalidSlugs = ['', 'Invalid Slug!', 'has spaces'];
      for (const invalid of invalidSlugs) {
        await page.getByTestId('new-slug-input').fill(invalid);
        await expect(page.getByTestId('confirm-rename-button')).toBeDisabled();
      }
    });

    await test.step('enables confirm for a valid slug', async () => {
      await page.getByTestId('new-slug-input').fill('valid-slug-name');
      await expect(page.getByTestId('confirm-rename-button')).toBeEnabled();
    });

    await test.step('successfully renames the project (navigates to new URL)', async () => {
      const newSlug = `renamed-${Date.now()}`;
      await page.getByTestId('new-slug-input').fill(newSlug);

      // Wait for the confirm button to be fully enabled before submitting.
      await expect(page.getByTestId('confirm-rename-button')).toBeEnabled();
      await page.getByTestId('confirm-rename-button').click();

      // After rename the component carries this device's activation over to
      // the new slug and reloads there. The project must open, not bounce
      // home with "not activated on this device".
      const username = baseUrl.split('/').filter(Boolean)[0];
      const renamedUrl = new RegExp(`/${username}/${newSlug}/settings$`);
      await page.waitForURL(renamedUrl);
      await expect(page.getByTestId('settings-tab-content')).toBeVisible();
      await expect(page).toHaveURL(renamedUrl);
    });
  });

  /**
   * The project's documents and files are stored on the server under its
   * slug (a Durable Object and R2 prefix on Workers, LevelDB and a directory
   * on Bun), so a rename has to move them. The document text is written from
   * another device, so the renaming device never holds it and cannot push it
   * back; both are then read from the server under the new slug.
   */
  test('rename keeps document text and media on the server', async ({
    authenticatedPage: page,
    browser,
  }) => {
    test.slow();
    const { slug, baseUrl, title } = await setupProjectAndNavigateToDanger(
      page,
      'rename-data'
    );
    const username = baseUrl.split('/').filter(Boolean)[0];
    const token = await authToken(page);
    const api = getApiBaseUrl();
    const auth = { Authorization: `Bearer ${token}` };
    const text = `Written on another device ${Date.now()}`;
    const manifest = async (projectSlug: string): Promise<string> => {
      const res = await page.request.get(
        `${api}/api/v1/projects/${username}/${projectSlug}/docs/sync-manifest`,
        { headers: auth }
      );
      expect(res.ok()).toBe(true);
      return JSON.stringify(await res.json());
    };

    const other = await openOtherDevice(browser, token);
    try {
      await test.step('another device writes to the README', async () => {
        await openFromServer(other.page, title);
        await other.page.getByTestId('element-README').click();
        const editor = other.page.locator('.ProseMirror');
        await expect(editor).toBeVisible();
        const before = await manifest(slug);
        await editor.click();
        await other.page.keyboard.press('Control+End');
        await other.page.keyboard.type(text);
        await expect(editor).toContainText(text);
        // The server has stored the edit.
        await expect.poll(() => manifest(slug)).not.toBe(before);
      });

      await test.step('a media file is uploaded', async () => {
        // From inside the page, as the app does (see account-deletion.spec.ts).
        const upload = await page.evaluate(
          async ({ url, authToken, png }) => {
            const body = new FormData();
            const bytes = Uint8Array.from(atob(png), c => c.charCodeAt(0));
            body.append(
              'file',
              new File([bytes], 'pixel.png', { type: 'image/png' })
            );
            const res = await fetch(url, {
              method: 'POST',
              headers: { Authorization: `Bearer ${authToken}` },
              body,
            });
            return { status: res.status, text: await res.text() };
          },
          {
            url: `${api}/api/v1/media/${username}/${slug}`,
            authToken: token,
            png: PNG.toString('base64'),
          }
        );
        expect(upload.status, upload.text).toBe(200);
      });

      const newSlug = `renamed-data-${Date.now()}`;
      await test.step('this device renames the project', async () => {
        await page.getByTestId('rename-project-button').click();
        await page.getByTestId('new-slug-input').fill(newSlug);
        await expect(page.getByTestId('confirm-rename-button')).toBeEnabled();
        await page.getByTestId('confirm-rename-button').click();
        await page.waitForURL(new RegExp(`/${username}/${newSlug}/settings$`));
      });

      await test.step('the server has the media under the new slug', async () => {
        const res = await page.request.get(
          `${api}/api/v1/media/${username}/${newSlug}/pixel.png`,
          { headers: auth }
        );
        expect(res.status()).toBe(200);
        expect(Buffer.from(await res.body()).equals(PNG)).toBe(true);
      });

      await test.step('the other device downloads the renamed project with the text', async () => {
        // Nothing of the new slug is stored on that device, so it all comes
        // from the server.
        await openFromServer(other.page, title);
        await expect(other.page).toHaveURL(new RegExp(`/${newSlug}`));
        await other.page.getByTestId('element-README').click();
        await expect(other.page.locator('.ProseMirror')).toContainText(text);
      });
    } finally {
      await other.context.close();
    }
  });

  /**
   * Full delete UX on a fresh project: card warning, confirm dialog,
   * input gating, cancel-leaves-project-intact, and finally an actual
   * deletion that redirects to home.
   */
  test('delete project: warning, dialog, gating, cancel, and final deletion', async ({
    authenticatedPage: page,
  }) => {
    const { slug, baseUrl } = await setupProjectAndNavigateToDanger(
      page,
      'delete-flow'
    );

    await test.step('shows delete card with warning', async () => {
      await expect(page.getByTestId('delete-project-card')).toBeVisible();
      await expect(page.getByTestId('delete-project-button')).toBeVisible();
      await expect(page.getByTestId('danger-warning')).toBeVisible();
    });

    await test.step('opens confirmation dialog with project slug; confirm initially disabled', async () => {
      await page.getByTestId('delete-project-button').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(new RegExp(slug)).first()).toBeVisible();

      await expect(page.getByTestId('confirm-delete-button')).toBeVisible();
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();
    });

    await test.step('confirm button gates on typing the correct slug', async () => {
      const dialog = page.locator('mat-dialog-container');
      const input = dialog.getByTestId('confirm-dialog-input');
      await input.waitFor({ state: 'visible' });

      await input.fill('wrong-slug');
      await expect(page.getByTestId('confirm-delete-button')).toBeDisabled();

      await input.fill(slug);
      await expect(page.getByTestId('confirm-delete-button')).toBeEnabled();
    });

    await test.step('cancel leaves the project intact and accessible', async () => {
      await page.getByTestId('cancel-dialog-button').click();
      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).not.toBeVisible();
      await expect(page.getByTestId('danger-zone-section')).toBeVisible();

      // Re-navigate to confirm the project still exists.
      await page.goto(`${baseUrl}/settings`);
      await expect(page.getByTestId('settings-tab-content')).toBeVisible();
      await page.getByTestId('nav-danger').click();
      await expect(page.getByTestId('danger-zone-section')).toBeVisible();
    });

    await test.step('successfully deletes the project and redirects to home', async () => {
      await page.getByTestId('delete-project-button').click();

      const dialog = page.locator('mat-dialog-container');
      await expect(dialog).toBeVisible();

      const input = dialog.getByTestId('confirm-dialog-input');
      await input.waitFor({ state: 'visible' });
      await input.fill(slug);

      await page.getByTestId('confirm-delete-button').click();
      await expect(page).toHaveURL('/');
    });
  });
});
