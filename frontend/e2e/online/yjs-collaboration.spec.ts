import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

async function createProject(page: Page, slug: string): Promise<string> {
  await page.goto('/create-project');

  await page.getByTestId('next-button').click();
  await page.getByTestId('project-title-input').fill('Yjs Collaboration Test');
  await page.getByTestId('project-slug-input').fill(slug);
  await page.getByTestId('create-project-button').click();
  await page.waitForURL(new RegExp(slug));

  const pathParts = new URL(page.url()).pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) {
    throw new Error(`Unexpected project URL: ${page.url()}`);
  }
  return `/${pathParts[0]}/${pathParts[1]}`;
}

async function createCanvasAndOpen(
  page: Page,
  name = 'Shared Canvas'
): Promise<string> {
  await page.getByTestId('create-new-element').click();
  await page.getByTestId('element-type-canvas').click();

  const nameInput = page.getByTestId('element-name-input');
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill(name);
  await page.getByTestId('create-element-button').click();

  await expect(page.getByTestId('canvas-container')).toBeVisible();
  return page.url();
}

test.describe('Yjs Collaboration Regressions', () => {
  test('does not show ghost presence after repeated refreshes by one user', async ({
    authenticatedPage: page,
  }) => {
    const slug = `yjs-presence-${Date.now()}`;
    await createProject(page, slug);
    await createCanvasAndOpen(page, 'Presence Canvas');

    // Regression: stale awareness state used to accumulate on each refresh.
    for (let i = 0; i < 3; i++) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('canvas-container')).toBeVisible();
      await expect
        .poll(async () => page.getByTestId('presence-indicator').count(), {
          timeout: 12_000,
          message: 'Presence indicator should stay hidden with only one user',
        })
        .toBe(0);
    }
  });

  test('syncs canvas metadata edits across two live tabs', async ({
    authenticatedPage: pageA,
  }) => {
    const slug = `yjs-canvas-${Date.now()}`;
    await createProject(pageA, slug);
    const canvasUrl = await createCanvasAndOpen(pageA, 'Live Sync Canvas');

    const context = pageA.context();
    const pageB = await context.newPage();
    pageB.on('console', () => {});

    try {
      await pageB.goto(canvasUrl);
      await expect(pageB.getByTestId('canvas-container')).toBeVisible();

      await expect(pageA.getByTestId('layer-item')).toHaveCount(1);
      await expect(pageB.getByTestId('layer-item')).toHaveCount(1);

      await pageA
        .getByTestId('canvas-sidebar')
        .getByTestId('add-layer-button')
        .click();

      await expect
        .poll(
          async () =>
            pageB
              .getByTestId('canvas-sidebar')
              .getByTestId('layer-item')
              .count(),
          {
            timeout: 15_000,
            message: 'Second tab should receive live layer updates via Yjs',
          }
        )
        .toBe(2);
    } finally {
      await pageB.close();
    }
  });
});
