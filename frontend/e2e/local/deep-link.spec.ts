/**
 * Document Deep Link Tests - Local Mode
 *
 * Loading a document URL directly (a full page load) must open that document
 * even when it has never been opened in this browser, e.g. one seeded by a
 * project template. On phones there is no tab bar, and the tab bar used to be
 * the only thing that turned a document URL into an open tab, so such links
 * sat on "Loading document..." forever.
 */
import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

const DOCUMENT_ID = 'doc-moonveil-accord';

/** Create a project from the worldbuilding demo; returns `/:user/:slug`. */
async function createDemoProject(page: Page, slug: string): Promise<string> {
  await page.goto('/');
  const createButton = page.getByTestId('create-new-project-button');
  await createButton.waitFor();
  await createButton.click();
  await page.getByTestId('create-new-project-menu-item').click();
  await page.getByTestId('template-worldbuilding-demo').click();
  await page.getByRole('button', { name: /next/i }).click();
  await page.getByTestId('project-title-input').fill('Deep Link Demo');
  await page.getByTestId('project-slug-input').fill(slug);
  await page.getByTestId('create-project-button').click();
  await page.waitForURL(new RegExp(`/${slug}`));
  await expect(page.getByTestId('project-tree')).toBeVisible();
  return new URL(page.url()).pathname.split('/').slice(0, 3).join('/');
}

async function expectDocumentRendered(page: Page): Promise<void> {
  await expect(page.locator('.ProseMirror')).toContainText('Moonveil Accord', {
    timeout: 15000,
  });
}

test.describe('Document deep links', () => {
  test('opens a never-opened template document on desktop', async ({
    localPage: page,
  }) => {
    const projectPath = await createDemoProject(page, 'deep-link-desktop');

    await page.goto(`${projectPath}/document/${DOCUMENT_ID}`);

    await expect(page.getByTestId('tab-The Moonveil Accord')).toBeVisible();
    await expectDocumentRendered(page);
  });

  test('opens a never-opened template document on a phone', async ({
    localPage: page,
  }) => {
    const projectPath = await createDemoProject(page, 'deep-link-phone');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${projectPath}/document/${DOCUMENT_ID}`);

    await expect(page).toHaveURL(new RegExp(`/document/${DOCUMENT_ID}$`));
    await expectDocumentRendered(page);
  });
});
