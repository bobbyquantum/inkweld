import { expect, test, type WebSocketRoute } from '@playwright/test';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

/**
 * Exercise the real shared project UI against deterministic public HTTP/Yjs
 * data. Backend suites separately exercise authorization and socket revocation.
 */
for (const savedProfile of [false, true]) {
  test(`public project uses the normal read-only UI (${savedProfile ? 'saved profile' : 'first visit'})`, async ({
    page,
  }) => {
    const config = JSON.stringify({
      version: 2,
      activeConfigId: 'private-server',
      configurations: [
        {
          id: 'private-server',
          type: 'server',
          displayName: 'Private server',
          serverUrl: 'https://private.invalid',
          addedAt: 1,
          lastUsedAt: 1,
        },
      ],
    });
    await page.addInitScript(
      ({ savedProfile, config }) => {
        localStorage.clear();
        if (savedProfile) {
          localStorage.setItem('inkweld-app-config', config);
          localStorage.setItem(
            'srv:private-server:auth_token',
            'saved-private-session'
          );
        }
      },
      { savedProfile, config }
    );

    const elements = new Y.Doc();
    elements.getArray('elements').insert(0, [
      {
        id: 'chapter',
        name: 'Public chapter',
        type: 'ITEM',
        level: 0,
        order: 0,
        parentId: null,
      },
    ]);
    const prose = new Y.Doc();
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    text.insert(0, 'Formatted public story', { strong: {} });
    paragraph.insert(0, [text]);
    prose.getXmlFragment('prosemirror').insert(0, [paragraph]);
    const sockets = new Set<WebSocketRoute>();
    const requests: { method: string; authorization?: string; url: string }[] =
      [];

    await page.route('**/api/v1/**', async route => {
      const request = route.request();
      requests.push({
        method: request.method(),
        authorization: request.headers()['authorization'],
        url: request.url(),
      });
      const path = new URL(request.url()).pathname;
      let body: unknown = {};
      if (path === '/api/v1/projects/reader/story') {
        body = {
          id: 'public-story',
          username: 'reader',
          slug: 'story',
          title: 'Public story',
          description: 'A complete shared project',
          isPublic: true,
          createdDate: new Date(0).toISOString(),
          updatedDate: new Date(0).toISOString(),
          access: {
            canRead: true,
            canWrite: false,
            canAdmin: false,
            isOwner: false,
          },
        };
      } else if (path.includes('/media/')) {
        body = { items: [], total: 0 };
      } else if (path.endsWith('/published') || path.includes('/comments/')) {
        body = [];
      } else if (path.includes('/activity/')) {
        body = { events: [], nextBefore: null };
      } else if (path.endsWith('/config/features')) {
        body = { appMode: 'BOTH', aiKillSwitch: true };
      }
      await route.fulfill({ json: body });
    });

    await page.routeWebSocket('**/api/v1/ws/yjs**', socket => {
      const id = new URL(socket.url()).searchParams.get('documentId') ?? '';
      const doc = id.includes(':elements') ? elements : prose;
      sockets.add(socket);
      socket.onClose(() => sockets.delete(socket));
      socket.onMessage(message => {
        if (typeof message !== 'string') return;
        if (message === 'inkweld:presence:ping') {
          socket.send('inkweld:presence:pong');
          return;
        }
        expect(message).toBe('public-view');
        socket.send('authenticated');
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0);
        syncProtocol.writeSyncStep2(encoder, doc);
        socket.send(Buffer.from(encoding.toUint8Array(encoder)));
      });
    });

    await page.goto('/public/reader/story');
    await expect(page.getByTestId('home-tab-content')).toContainText(
      'Public story'
    );
    await expect(page).toHaveURL(/\/public\/reader\/story$/);
    await page.goto('/public/reader/story/document/chapter');
    const editor = page.getByTestId('document-editor');
    await expect(editor).toContainText('Formatted public story');
    expect(
      await editor.evaluate(
        element => element.querySelector('strong')?.textContent
      )
    ).toBe('Formatted public story');
    expect(
      await editor.evaluate(element =>
        element
          .querySelector('[contenteditable]')
          ?.getAttribute('contenteditable')
      )
    ).toBe('false');

    await page.getByTestId('toolbar-home-button').click();
    await expect(page).toHaveURL(/\/public\/reader\/story$/);
    await page.getByTestId('sidebar-media-button').click();
    await expect(page).toHaveURL(/\/public\/reader\/story\/media$/);
    await expect(page.getByTestId('media-container')).toBeVisible();
    await expect(page.getByTestId('add-media-button')).toHaveCount(0);

    expect(
      await page.evaluate(() => localStorage.getItem('inkweld-app-config'))
    ).toBe(savedProfile ? config : null);
    expect(
      await page.evaluate(() =>
        localStorage.getItem('srv:private-server:auth_token')
      )
    ).toBe(savedProfile ? 'saved-private-session' : null);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    expect(
      requests.every(
        request =>
          !request.authorization && !request.url.includes('private.invalid')
      )
    ).toBe(true);

    await Promise.all(
      [...sockets].map(socket => {
        socket.send('access-denied:forbidden');
        return socket.close({ code: 4403, reason: 'Access revoked' });
      })
    );
    await expect(page.getByTestId('public-project-error')).toBeVisible();
    await expect(page.getByTestId('media-container')).toHaveCount(0);
    elements.destroy();
    prose.destroy();
  });
}
