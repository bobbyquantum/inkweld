import { describe, expect, it } from 'bun:test';
import type { Context } from 'hono';
import { InternalError } from '../src/errors';
import type { AppContext } from '../src/types/context';
import {
  RENAME_NEXT_CURSOR_HEADER,
  destroyProjectDurableObject,
  prepareProjectDurableObjectMove,
} from '../src/utils/project-durable-object';

interface FakeNamespace {
  names: string[];
  requests: Request[];
  respondWith: Response;
}

function fakeContext(
  env: Record<string, unknown> | undefined,
  headers: Record<string, string>
): Context<AppContext> {
  return {
    env,
    req: { header: (name: string) => headers[name] },
  } as unknown as Context<AppContext>;
}

function fakeNamespace(respondWith: Response): FakeNamespace & Record<string, unknown> {
  const ns: FakeNamespace & Record<string, unknown> = {
    names: [],
    requests: [],
    respondWith,
    idFromName(name: string) {
      ns.names.push(name);
      return { name };
    },
    get(_id: unknown) {
      return {
        fetch: async (request: Request) => {
          ns.requests.push(request);
          return ns.respondWith;
        },
      };
    },
  };
  return ns;
}

describe('destroyProjectDurableObject', () => {
  it('is a no-op without a YJS_PROJECTS binding (Bun/Node)', async () => {
    await expect(
      destroyProjectDurableObject(fakeContext(undefined, {}), 'alice', 'novel')
    ).resolves.toBeUndefined();
    await expect(
      destroyProjectDurableObject(fakeContext({}, { Authorization: 'Bearer t' }), 'alice', 'novel')
    ).resolves.toBeUndefined();
  });

  it("posts /api/destroy to the project DO with the caller's token", async () => {
    const ns = fakeNamespace(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const c = fakeContext({ YJS_PROJECTS: ns }, { Authorization: 'Bearer owner-token' });

    await destroyProjectDurableObject(c, 'alice', 'novel');

    expect(ns.names).toEqual(['alice:novel']);
    expect(ns.requests).toHaveLength(1);
    const sent = ns.requests[0];
    expect(sent.method).toBe('POST');
    expect(new URL(sent.url).pathname).toBe('/api/destroy');
    expect(new URL(sent.url).searchParams.get('documentId')).toBe('alice:novel:elements');
    expect(sent.headers.get('Authorization')).toBe('Bearer owner-token');
  });

  it('refuses to proceed without a session token', async () => {
    const ns = fakeNamespace(new Response(null, { status: 200 }));
    await expect(
      destroyProjectDurableObject(fakeContext({ YJS_PROJECTS: ns }, {}), 'alice', 'novel')
    ).rejects.toBeInstanceOf(InternalError);
    expect(ns.requests).toHaveLength(0);
  });

  it('surfaces a non-2xx DO response so the row is not deleted', async () => {
    const ns = fakeNamespace(new Response(JSON.stringify({ error: 'nope' }), { status: 403 }));
    const c = fakeContext({ YJS_PROJECTS: ns }, { Authorization: 'Bearer editor-token' });
    await expect(destroyProjectDurableObject(c, 'alice', 'novel')).rejects.toThrow(
      'Failed to remove project documents (403)'
    );
  });
});

describe('prepareProjectDurableObjectMove', () => {
  /** Records each call as `<object> <path>` and answers through `respond`. */
  function scriptedNamespace(respond: (name: string, request: Request) => Response) {
    const calls: string[] = [];
    const bodies: string[] = [];
    const ns = {
      idFromName: (name: string) => ({ name }),
      get: (id: { name: string }) => ({
        fetch: async (request: Request) => {
          const url = new URL(request.url);
          const cursor = url.searchParams.get('startAfter');
          calls.push(`${id.name} ${url.pathname}${cursor ? `?${cursor}` : ''}`);
          if (request.method === 'POST' && url.pathname.endsWith('/import')) {
            bodies.push(await request.text());
          }
          expect(url.searchParams.get('from')).toBe('old');
          expect(url.searchParams.get('to')).toBe('new');
          expect(url.searchParams.get('documentId')).toBe(`${id.name}:elements`);
          expect(request.headers.get('Authorization')).toBe('Bearer owner-token');
          return respond(id.name, request);
        },
      }),
    };
    return { ns, calls, bodies };
  }

  const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  const move = (ns: unknown) => {
    const prepared = prepareProjectDurableObjectMove(
      fakeContext({ YJS_PROJECTS: ns }, { Authorization: 'Bearer owner-token' }),
      'alice',
      'old',
      'new'
    );
    if (!prepared) throw new Error('Expected a Durable Object move');
    return prepared;
  };

  it('is null without a YJS_PROJECTS binding (Bun/Node)', () => {
    expect(prepareProjectDurableObjectMove(fakeContext({}, {}), 'alice', 'old', 'new')).toBeNull();
  });

  it('refuses to start without a session token', () => {
    const { ns } = scriptedNamespace(ok);
    expect(() =>
      prepareProjectDurableObjectMove(fakeContext({ YJS_PROJECTS: ns }, {}), 'alice', 'old', 'new')
    ).toThrow(InternalError);
  });

  it('locks, empties the target, then pages every export into the new object', async () => {
    // Two pages: the first names the key to resume after, the second none.
    const pages = [
      { body: 'page-1', next: 'doc:alice:old:a b' },
      { body: 'page-2', next: null },
    ];
    const { ns, calls, bodies } = scriptedNamespace((_name, request) => {
      if (!request.url.includes('/export')) return ok();
      const page = pages.shift();
      if (!page) throw new Error('Exported past the last page');
      const headers: Record<string, string> = {};
      if (page.next) headers[RENAME_NEXT_CURSOR_HEADER] = encodeURIComponent(page.next);
      return new Response(page.body, { status: 200, headers });
    });

    await move(ns).copy();

    expect(calls).toEqual([
      'alice:old /api/rename/lock',
      'alice:new /api/rename/discard',
      'alice:old /api/rename/export',
      'alice:new /api/rename/import',
      'alice:old /api/rename/export?doc:alice:old:a b',
      'alice:new /api/rename/import',
    ]);
    expect(bodies).toEqual(['page-1', 'page-2']);
  });

  it('rolls back and rethrows when a step fails', async () => {
    const { ns, calls } = scriptedNamespace((_name, request) =>
      request.url.includes('/export') ? new Response('nope', { status: 500 }) : ok()
    );

    await expect(move(ns).copy()).rejects.toThrow(
      'Failed to move project documents (/api/rename/export: 500)'
    );

    expect(calls.slice(-2).sort()).toEqual([
      'alice:new /api/rename/discard',
      'alice:old /api/rename/unlock',
    ]);
  });

  it('keeps rolling back when one undo call fails', async () => {
    const { ns, calls } = scriptedNamespace((_name, request) =>
      request.url.includes('/discard') ? new Response('nope', { status: 503 }) : ok()
    );

    await expect(move(ns).abort()).resolves.toBeUndefined();
    expect(calls.sort()).toEqual(['alice:new /api/rename/discard', 'alice:old /api/rename/unlock']);
  });

  it('wipes the old object on complete', async () => {
    const { ns, calls } = scriptedNamespace(ok);
    await move(ns).complete();
    expect(calls).toEqual(['alice:old /api/rename/complete']);
  });
});
