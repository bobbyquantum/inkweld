/**
 * Service Worker Offline Tests
 *
 * These need the production build, which only the Docker suite serves: the
 * other suites sharing this folder use `ng serve`, which has no service worker.
 * The build rewrites files after `ng build` (`compress-wasm.js`), and a hash in
 * `ngsw.json` that doesn't match what the browser receives degrades the worker
 * in a way that only shows once the network is gone.
 */
import { promises as fs } from 'fs';

import {
  documentDbName,
  generateUniqueSlug,
  waitForElementsDocPersisted,
  waitForIndexedDBPersisted,
} from '../common/test-helpers';
import { createProject, expect, type Page, test } from './fixtures';

/** The two Typst modules that PDF export loads. */
const PDF_WASM_MODULES = [
  'assets/wasm/typst_ts_renderer_bg.wasm',
  'assets/wasm/typst_ts_web_compiler_bg.wasm',
];

/** Whether each Typst module loads and validates when the page fetches it. */
function checkPdfWasmModules(page: Page): Promise<boolean[]> {
  return page.evaluate(
    urls =>
      Promise.all(
        urls.map(async url => {
          const response = await fetch(url);
          return (
            response.ok && WebAssembly.validate(await response.arrayBuffer())
          );
        })
      ),
    PDF_WASM_MODULES
  );
}

/** Reloads the page so the service worker it just installed controls it. */
async function reloadUnderServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined)
  );
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}

/**
 * Takes the browser offline with its HTTP cache emptied. On a cache miss the
 * worker tries a plain fetch first, which the HTTP cache can answer, so a file
 * the worker never cached would otherwise still seem to work offline.
 */
async function goOffline(page: Page): Promise<void> {
  const context = page.context();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.clearBrowserCache');
  await context.setOffline(true);
}

/** Generates and downloads the open plan's PDF, and returns the file's bytes. */
async function exportPdf(page: Page): Promise<Buffer> {
  await page.getByTestId('nav-publish').click();
  await expect(page.getByTestId('generate-button')).toContainText('PDF');
  await page.getByTestId('generate-button').click();
  await expect(page.getByTestId('publish-complete-dialog-title')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-button').click();
  const download = await downloadPromise;
  const pdf = await fs.readFile(await download.path());
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

  await page.getByTestId('done-button').click();
  await expect(
    page.getByTestId('publish-complete-dialog-title')
  ).not.toBeVisible();
  return pdf;
}

test.describe('Service worker offline support', () => {
  // Skipped outside the Docker suite: the other suites sharing this folder use
  // `ng serve`, which has no service worker.
  test.skip(
    !process.env['PLAYWRIGHT_DOCKER_PORT'],
    'Needs the production build, which only the Docker suite serves'
  );

  test('should cache the compressed PDF WASM and keep opening new tabs offline', async ({
    anonymousPage: page,
  }) => {
    await page.goto('/');
    await reloadUnderServiceWorker(page);

    // The worker checks each module's hash on this first fetch and caches it
    expect(await checkPdfWasmModules(page)).toEqual([true, true]);
    const workerState = await page.evaluate(async () =>
      (await fetch('/ngsw/state')).text()
    );
    expect(workerState).toContain('Driver state: NORMAL');

    await goOffline(page);
    expect(await checkPdfWasmModules(page)).toEqual([true, true]);

    const offlineTab = await page.context().newPage();
    const response = await offlineTab.goto('/');
    expect(response?.ok()).toBe(true);
    expect(response?.fromServiceWorker()).toBe(true);
  });

  test('should export a PDF after an offline reload, once exported online', async ({
    authenticatedPage: page,
  }) => {
    // Project setup and two Typst compiles: needs headroom on slow CI runners
    test.slow();
    const { username } = page.testCredentials;
    const slug = generateUniqueSlug('offline-pdf');
    const bookText = 'Written before the network went away.';
    const bookTitle = 'Offline Book';

    await reloadUnderServiceWorker(page);
    await createProject(page, 'Offline PDF', slug);

    await page.getByTestId('element-README').click();
    const prose = page.getByTestId('document-editor').locator('.ProseMirror');
    await prose.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(bookText);
    await expect(prose).toContainText(bookText);
    await waitForIndexedDBPersisted(
      page,
      await documentDbName(page, `${username}:${slug}:readme-001`),
      [bookText]
    );

    await page.getByTestId('sidebar-publishing-button').click();
    const createPlanButton = page.getByTestId('create-publish-plan-button');
    await expect(createPlanButton).toBeEnabled();
    await createPlanButton.click();
    await page.waitForURL(/\/publish-plan\//);

    await page.getByTestId('nav-contents').click();
    await page.getByTestId('add-everything-button').click();
    await expect(page.getByTestId('content-item-0')).toBeVisible();

    await page.getByTestId('nav-metadata').click();
    await page.getByTestId('format-select').click();
    await page.getByTestId('format-option-PDF_SIMPLE').click();
    await expect(page.getByRole('listbox')).not.toBeVisible();
    await page.getByTestId('book-title-input').fill(bookTitle);
    // Saved locally before the reload, so the offline start has the whole plan
    await waitForElementsDocPersisted(page, username, slug, [bookTitle]);

    // The first export is what caches the WASM modules and the fonts
    const onlinePdf = await exportPdf(page);

    await goOffline(page);
    await page.reload();
    await expect(page.getByTestId('publish-plan-container')).toBeVisible();
    const offlinePdf = await exportPdf(page);

    // The same plan gives a PDF of the same size. An offline run that lost the
    // document's text would still produce a valid PDF, just a much smaller one.
    expect(offlinePdf.length).toBe(onlinePdf.length);
  });
});
