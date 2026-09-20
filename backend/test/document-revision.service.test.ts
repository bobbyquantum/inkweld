import { describe, it, expect, mock } from 'bun:test';

import { getProjectDocumentRevisions } from '../src/services/document-revision.service';
import type { DurableObjectNamespace, DurableObjectStub } from '../src/types/cloudflare';

/**
 * Build a fake `YJS_PROJECTS` namespace whose stub records the request it was
 * given and returns a canned response. Mirrors the shape the real binding
 * exposes (idFromName/get).
 */
function makeNamespace(response: Response | (() => Promise<Response>)): {
  namespace: DurableObjectNamespace;
  requests: Request[];
} {
  const requests: Request[] = [];
  const stub: DurableObjectStub = {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return typeof response === 'function' ? response() : response;
    },
  };
  const namespace: DurableObjectNamespace = {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => stub,
  };
  return { namespace, requests };
}

describe('getProjectDocumentRevisions (Cloudflare path)', () => {
  it('forwards to the DO and returns its document entries', async () => {
    const { namespace, requests } = makeNamespace(
      Response.json({
        documents: [
          { documentId: 'alice:novel:c1', revision: 'doc:alice:novel:c1:update:5:00000000' },
          { documentId: 'alice:novel:c2', revision: null },
        ],
      })
    );

    const result = await getProjectDocumentRevisions(
      'alice',
      'novel',
      { YJS_PROJECTS: namespace },
      'token-123'
    );

    expect(result).toHaveLength(2);
    expect(result[0].revision).toBe('doc:alice:novel:c1:update:5:00000000');
    expect(result[1].revision).toBeNull();

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toContain('/api/revisions');
    expect(requests[0].url).toContain('documentId=alice%3Anovel%3Aelements');
    expect(requests[0].headers.get('Authorization')).toBe('Bearer token-123');
  });

  it('returns an empty list when the DO responds with an error', async () => {
    const { namespace } = makeNamespace(
      new Response('boom', { status: 500, statusText: 'Server Error' })
    );

    const result = await getProjectDocumentRevisions(
      'alice',
      'novel',
      { YJS_PROJECTS: namespace },
      'token'
    );

    expect(result).toEqual([]);
  });

  it('returns an empty list when the DO fetch rejects', async () => {
    const { namespace } = makeNamespace(async () => {
      throw new Error('network down');
    });

    const result = await getProjectDocumentRevisions(
      'alice',
      'novel',
      { YJS_PROJECTS: namespace },
      'token'
    );

    expect(result).toEqual([]);
  });
});
