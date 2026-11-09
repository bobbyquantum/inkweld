import { expect, type Page, test, type WebSocketRoute } from '@playwright/test';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

/**
 * Exercise the real shared project UI against deterministic public HTTP/Yjs
 * data. Backend suites separately exercise authorization and socket revocation.
 */

// CI runs these against a production build, whose Angular service worker
// answers fetches itself, so page.route never sees them. Blocking service
// workers keeps the mocked HTTP data in play in dev and prod builds.
test.use({ serviceWorkers: 'block' });

// A link names the project's server when the app is served from elsewhere.
const SHARED_SERVER = 'https://shared.invalid';

/** One request the mocked server answered. */
interface ServedRequest {
  method: string;
  authorization?: string;
  url: string;
}

/**
 * A file in the mocked server's media. The listing gives no type for it, as
 * R2's listings don't; the file itself is served with `contentType`.
 */
interface ServedMedia {
  filename: string;
  contentType: string;
  body: Buffer;
}

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/** The elements document: one chapter. */
function elementsDoc(): Y.Doc {
  const doc = new Y.Doc();
  doc.getArray('elements').insert(0, [
    {
      id: 'chapter',
      name: 'Public chapter',
      type: 'ITEM',
      level: 0,
      order: 0,
      parentId: null,
    },
  ]);
  return doc;
}

/** The chapter's prose: one paragraph per line, optionally in bold. */
function proseDoc(lines: string[], { bold = false } = {}): Y.Doc {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('prosemirror');
  fragment.insert(
    0,
    lines.map(line => {
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.insert(0, line, bold ? { strong: {} } : undefined);
      paragraph.insert(0, [text]);
      return paragraph;
    })
  );
  return doc;
}

/**
 * Answer the app's public-link HTTP requests and sockets for `reader/story`
 * from `elements`, `prose` and `media`, recording what was asked for.
 */
async function servePublicProject(
  page: Page,
  {
    elements,
    prose,
    media = [],
  }: { elements: Y.Doc; prose: Y.Doc; media?: ServedMedia[] }
): Promise<{
  requests: ServedRequest[];
  sockets: Set<WebSocketRoute>;
  socketUrls: string[];
}> {
  const sockets = new Set<WebSocketRoute>();
  const socketUrls: string[] = [];
  const requests: ServedRequest[] = [];

  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    requests.push({
      method: request.method(),
      authorization: request.headers()['authorization'],
      url: request.url(),
    });
    const path = new URL(request.url()).pathname;
    const file = media.find(
      item => path === `/api/v1/media/reader/story/${item.filename}`
    );
    if (file) {
      await route.fulfill({
        body: file.body,
        contentType: file.contentType,
      });
      return;
    }
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
      body = {
        items: media.map(({ filename, body }) => ({
          filename,
          size: body.length,
          uploadedAt: new Date(0).toISOString(),
        })),
        total: media.length,
      };
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
    socketUrls.push(socket.url());
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

  return { requests, sockets, socketUrls };
}

for (const { savedProfile, server } of [
  { savedProfile: false, server: null },
  { savedProfile: true, server: null },
  { savedProfile: false, server: SHARED_SERVER },
]) {
  const variant = server
    ? 'link names its server'
    : savedProfile
      ? 'saved profile'
      : 'first visit';
  test(`public project uses the normal read-only UI (${variant})`, async ({
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

    const elements = elementsDoc();
    const prose = proseDoc(['Formatted public story'], { bold: true });
    const { requests, sockets, socketUrls } = await servePublicProject(page, {
      elements,
      prose,
    });

    const query = server ? `?server=${encodeURIComponent(server)}` : '';
    await page.goto(`/public/reader/story${query}`);
    await expect(page.getByTestId('home-tab-content')).toContainText(
      'Public story'
    );
    await expect(page).toHaveURL(/\/public\/reader\/story(\?server=[^/]*)?$/);
    await page.goto(`/public/reader/story/document/chapter${query}`);
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
    // In-app navigation has dropped the link's ?server=, and a reload must
    // still read from the server it named
    await expect(page).toHaveURL(/\/public\/reader\/story\/media$/);
    await page.reload();
    await expect(page.getByTestId('media-container')).toBeVisible();

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
    if (server) {
      // Everything is read from the server the link named
      expect(requests.every(request => request.url.startsWith(server))).toBe(
        true
      );
      expect(socketUrls.length).toBeGreaterThan(0);
      expect(
        socketUrls.every(url => url.startsWith(server.replace(/^http/, 'ws')))
      ).toBe(true);
    }

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

test('public project shows media thumbnails, scrolls, and has no publishing', async ({
  page,
}) => {
  const elements = elementsDoc();
  const prose = proseDoc(
    Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1} of the story.`)
  );
  // The listing has no types (see ServedMedia): the app must still see an image
  await servePublicProject(page, {
    elements,
    prose,
    media: [
      { filename: 'img-cover-art.png', contentType: 'image/png', body: PNG },
    ],
  });

  await page.goto('/public/reader/story');
  await expect(page.getByTestId('home-tab-content')).toContainText(
    'Public story'
  );
  // Publishing is the writers' own: no button, and its pages go home
  await expect(page.getByTestId('sidebar-media-button')).toBeVisible();
  await expect(page.getByTestId('sidebar-publishing-button')).toHaveCount(0);
  await page.goto('/public/reader/story/publish-plans');
  await expect(page).toHaveURL(/\/public\/reader\/story$/);
  await expect(page.getByTestId('home-tab-content')).toBeVisible();

  await page.getByTestId('sidebar-media-button').click();
  const thumbnail = page.getByTestId('media-thumbnail');
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(() =>
      thumbnail.evaluate(img => (img as HTMLImageElement).naturalWidth)
    )
    .toBe(1);

  // Read-only text still scrolls under the wheel
  await page.goto('/public/reader/story/document/chapter');
  const editor = page.getByTestId('document-editor');
  await expect(editor).toContainText('Paragraph 150 of the story.');
  const content = editor.locator('[contenteditable]').first();
  await expect(content).toHaveAttribute('contenteditable', 'false');
  await content.hover();
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => content.evaluate(element => element.scrollTop))
    .toBeGreaterThan(0);

  elements.destroy();
  prose.destroy();
});
