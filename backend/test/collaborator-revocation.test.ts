import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import type { Context } from 'hono';
import { yjsService } from '../src/services/yjs.service';
import type { AppContext } from '../src/types/context';
import { revokeCollaboratorSockets } from '../src/utils/collaborator-revocation';

function fakeContext(
  env: Record<string, unknown> | undefined,
  headers: Record<string, string>
): Context<AppContext> {
  return {
    env,
    req: { header: (name: string) => headers[name] },
  } as unknown as Context<AppContext>;
}

interface FakeNamespace extends Record<string, unknown> {
  names: string[];
  requests: Request[];
}

function fakeNamespace(respond: (request: Request) => Promise<Response>): FakeNamespace {
  const ns: FakeNamespace = {
    names: [],
    requests: [],
    idFromName(name: string) {
      ns.names.push(name);
      return { name };
    },
    get() {
      return {
        fetch: async (request: Request) => {
          ns.requests.push(request);
          return respond(request);
        },
      };
    },
  };
  return ns;
}

describe('revokeCollaboratorSockets', () => {
  afterEach(() => {
    // Restore the yjsService spy installed by each test.
    (yjsService.revokeUserAccess as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it('closes local sockets and stops there without a YJS_PROJECTS binding', async () => {
    const local = spyOn(yjsService, 'revokeUserAccess').mockReturnValue(1);
    await revokeCollaboratorSockets(
      fakeContext(undefined, { Authorization: 'Bearer t' }),
      'alice',
      'novel',
      'bob',
      'removed'
    );
    expect(local).toHaveBeenCalledWith('alice', 'novel', 'bob', 'removed');
  });

  it('forwards the revocation to the project Durable Object with the caller token', async () => {
    spyOn(yjsService, 'revokeUserAccess').mockReturnValue(0);
    const ns = fakeNamespace(async () => new Response(JSON.stringify({ closed: 2 })));
    await revokeCollaboratorSockets(
      fakeContext({ YJS_PROJECTS: ns }, { Authorization: 'Bearer owner-token' }),
      'alice',
      'novel',
      'bob',
      'changed'
    );

    expect(ns.names).toEqual(['alice:novel']);
    expect(ns.requests).toHaveLength(1);
    const sent = ns.requests[0];
    expect(sent.method).toBe('POST');
    expect(new URL(sent.url).pathname).toBe('/api/revoke');
    expect(new URL(sent.url).searchParams.get('documentId')).toBe('alice:novel:elements');
    expect(sent.headers.get('Authorization')).toBe('Bearer owner-token');
    expect(await sent.json()).toEqual({ userId: 'bob', reason: 'changed' });
  });

  it('skips the Durable Object when the request carries no Authorization header', async () => {
    spyOn(yjsService, 'revokeUserAccess').mockReturnValue(0);
    const ns = fakeNamespace(async () => new Response(null));
    await revokeCollaboratorSockets(
      fakeContext({ YJS_PROJECTS: ns }, {}),
      'alice',
      'novel',
      'bob',
      'removed'
    );
    expect(ns.requests).toHaveLength(0);
  });

  it('is best-effort: a rejected or failing DO call and a throwing local close do not propagate', async () => {
    spyOn(yjsService, 'revokeUserAccess').mockImplementation(() => {
      throw new Error('local boom');
    });
    const denied = fakeNamespace(
      async () => new Response(JSON.stringify({ error: 'nope' }), { status: 403 })
    );
    await expect(
      revokeCollaboratorSockets(
        fakeContext({ YJS_PROJECTS: denied }, { Authorization: 'Bearer t' }),
        'alice',
        'novel',
        'bob',
        'removed'
      )
    ).resolves.toBeUndefined();
    expect(denied.requests).toHaveLength(1);

    const failing = fakeNamespace(async () => {
      throw new Error('DO unreachable');
    });
    await expect(
      revokeCollaboratorSockets(
        fakeContext({ YJS_PROJECTS: failing }, { Authorization: 'Bearer t' }),
        'alice',
        'novel',
        'bob',
        'changed'
      )
    ).resolves.toBeUndefined();
  });
});
