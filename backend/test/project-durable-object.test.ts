import { describe, expect, it } from 'bun:test';
import type { Context } from 'hono';
import { InternalError } from '../src/errors';
import type { AppContext } from '../src/types/context';
import { destroyProjectDurableObject } from '../src/utils/project-durable-object';

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
