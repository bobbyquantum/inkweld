/**
 * Service Worker Offline Tests
 *
 * These need the production build, which only the Docker suite serves: the
 * other suites sharing this folder use `ng serve`, which has no service worker.
 * The build rewrites files after `ng build` (`compress-wasm.js`), and a hash in
 * `ngsw.json` that doesn't match what the browser receives degrades the worker
 * in a way that only shows once the network is gone.
 */
import { expect, type Page, test } from './fixtures';

/** The smaller of the two Typst modules that PDF export loads. */
const PDF_WASM = 'assets/wasm/typst_ts_renderer_bg.wasm';

function isPdfWasmUsable(page: Page): Promise<boolean> {
  return page.evaluate(async url => {
    const response = await fetch(url);
    return response.ok && WebAssembly.validate(await response.arrayBuffer());
  }, PDF_WASM);
}

test.describe('Service worker offline support', () => {
  test.skip(
    !process.env['PLAYWRIGHT_DOCKER_PORT'],
    'Needs the production build, which only the Docker suite serves'
  );

  test('should cache the compressed PDF WASM and keep opening new tabs offline', async ({
    anonymousPage: page,
  }) => {
    const context = page.context();

    await page.goto('/');
    await page.evaluate(() =>
      navigator.serviceWorker.ready.then(() => undefined)
    );
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);

    // The worker checks the module's hash on this first fetch and caches it
    expect(await isPdfWasmUsable(page)).toBe(true);
    const workerState = await page.evaluate(async () =>
      (await fetch('/ngsw/state')).text()
    );
    expect(workerState).toContain('Driver state: NORMAL');

    await context.setOffline(true);
    expect(await isPdfWasmUsable(page)).toBe(true);

    const offlineTab = await context.newPage();
    const response = await offlineTab.goto('/');
    expect(response?.ok()).toBe(true);
    expect(response?.fromServiceWorker()).toBe(true);
  });
});
