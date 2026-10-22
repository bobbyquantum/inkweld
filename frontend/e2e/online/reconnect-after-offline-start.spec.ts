import { type Page } from '@playwright/test';
import * as Y from 'yjs';

import {
  documentDbName,
  waitForIndexedDBPersisted,
} from '../common/test-helpers';
import { expect, getApiBaseUrl, test } from './fixtures';

/**
 * Starting the app while the server is unreachable used to leave a project
 * offline for good: the first WebSocket handshake failed before any reconnect
 * handling was installed, so only Retry or a reload brought it back.
 *
 * The online suite serves the app with `ng serve` (no service worker), so the
 * page can't load with the whole network down. Instead the server is made
 * unreachable for the reload — its HTTP API aborted and its Yjs WebSockets
 * closed — which is what an offline start looks like to the app, and the
 * browser is then taken offline and back online to fire the real events.
 */

/** Makes the API server unreachable for one page while `down` is true. */
async function controlServer(page: Page) {
  const apiUrl = getApiBaseUrl();
  let down = false;
  const abortApi = (route: { abort: (code: string) => Promise<void> }) =>
    route.abort('connectionfailed');

  await page.routeWebSocket(/\/api\/v1\/ws\/yjs/, ws => {
    if (down) {
      void ws.close();
    } else {
      ws.connectToServer();
    }
  });

  return {
    async takeDown(): Promise<void> {
      down = true;
      await page.route(`${apiUrl}/**`, abortApi);
    },
    async bringUp(): Promise<void> {
      down = false;
      await page.unroute(`${apiUrl}/**`, abortApi);
    },
  };
}

/** The sidebar strap: shown only while the project is not synced. */
function offlineStrap(page: Page) {
  return page.getByTestId('connection-strap').filter({ visible: true });
}

async function createProjectAndOpenReadme(
  page: Page,
  slug: string
): Promise<void> {
  await page.goto('/create-project');
  await page.getByTestId('next-button').click();
  await page.getByTestId('project-title-input').fill('Offline Start');
  await page.getByTestId('project-slug-input').fill(slug);
  await page.getByTestId('create-project-button').click();
  await expect(page).toHaveURL(new RegExp(slug));
  await expect(page.getByTestId('project-tree')).toBeVisible();

  await page.getByTestId('element-README').click();
  await expect(page.getByTestId('document-editor')).toBeVisible();
}

/** Read an unsigned LEB128 varint (lib0's encoding) at `at`. */
function readVarUint(bytes: Uint8Array, at: number): [number, number] {
  let value = 0;
  let shift = 0;
  let pos = at;
  for (;;) {
    const byte = bytes[pos++];
    value += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) return [value, pos];
    shift += 7;
  }
}

/**
 * The server's copy of a prose document as text, read the way a fresh client
 * would: authenticate the Yjs socket, send sync step 1 with an empty state
 * vector and apply the step-2 reply. Nothing local is involved.
 */
async function serverDocumentText(
  page: Page,
  documentId: string
): Promise<string> {
  const token = await page.evaluate(
    () => localStorage.getItem('srv:server-1:auth_token') ?? ''
  );
  // y-websocket appends `/<room>` (an empty room) to the URL, so the app's
  // documents live under the id with a trailing slash. Ask for the same one.
  const wsUrl = `${getApiBaseUrl().replace(/^http/, 'ws')}/api/v1/ws/yjs?documentId=${documentId}/`;
  const doc = new Y.Doc();
  try {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('No sync reply from the server'));
      }, 10_000);
      ws.onerror = () => reject(new Error('WebSocket error'));
      ws.onopen = () => ws.send(token);
      ws.onmessage = (event: MessageEvent) => {
        if (typeof event.data === 'string') {
          // messageSync (0), syncStep1 (0), state vector of an empty doc.
          if (event.data === 'authenticated') {
            ws.send(new Uint8Array([0, 0, 1, 0]));
          }
          return;
        }
        const bytes = new Uint8Array(event.data as ArrayBuffer);
        const [type, afterType] = readVarUint(bytes, 0);
        const [step, afterStep] = readVarUint(bytes, afterType);
        if (type !== 0 || step !== 1) return; // only syncStep2
        const [length, start] = readVarUint(bytes, afterStep);
        Y.applyUpdate(doc, bytes.subarray(start, start + length));
        clearTimeout(timer);
        ws.close();
        resolve();
      };
    });
    return doc.getXmlFragment('prosemirror').toJSON();
  } finally {
    doc.destroy();
  }
}

test.describe('Reconnect after an offline start', () => {
  test.describe.configure({ timeout: 240_000 });

  test('reconnects by itself and sends the edits made offline', async ({
    authenticatedPage: page,
  }) => {
    const server = await controlServer(page);
    const slug = `offline-start-${Date.now()}`;
    await createProjectAndOpenReadme(page, slug);
    const editor = page.getByTestId('document-editor');
    const prose = editor.locator('.ProseMirror');

    await prose.click();
    await page.keyboard.press('End');
    await page.keyboard.insertText(' Written online.');
    await expect(prose).toContainText('Written online.');
    const readmeDb = await documentDbName(
      page,
      `${page.testCredentials.username}:${slug}:readme-001`
    );
    // Saved locally before the reload, so the offline start has it.
    await waitForIndexedDBPersisted(page, readmeDb, ['Written online.']);

    await test.step('start with the server unreachable', async () => {
      await server.takeDown();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(prose).toContainText('Written online.');
      await expect(offlineStrap(page)).toBeVisible();
    });

    await test.step('edit while offline', async () => {
      await page.context().setOffline(true);
      await prose.click();
      await page.keyboard.press('End');
      await page.keyboard.insertText(' Written offline.');
      await expect(prose).toContainText('Written offline.');
    });

    await test.step('come back online without pressing Retry', async () => {
      await server.bringUp();
      await page.context().setOffline(false);
      await expect(offlineStrap(page)).toHaveCount(0, { timeout: 30_000 });
    });

    await test.step('the offline edit reached the server', async () => {
      const documentId = `${page.testCredentials.username}:${slug}:readme-001`;
      await expect
        .poll(() => serverDocumentText(page, documentId), { timeout: 30_000 })
        .toContain('Written offline.');
    });
  });
});
