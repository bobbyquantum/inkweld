import { afterEach, beforeEach, describe, it, expect } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

import { config } from '../src/config/env';
import { getProjectDocumentRevisions } from '../src/services/document-revision.service';
import { fileStorageService } from '../src/services/file-storage.service';
import { yjsService } from '../src/services/yjs.service';
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

describe('getProjectDocumentRevisions (Bun path)', () => {
  const USERNAME = 'revuser';
  const SLUG = 'revproj';
  const originalDataPath = config.dataPath;
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(tmpdir(), 'inkweld-doc-revision-'));
    config.dataPath = tempRoot;
    (fileStorageService as unknown as { basePath: string }).basePath = tempRoot;
  });

  afterEach(async () => {
    await yjsService.cleanup();
    config.dataPath = originalDataPath;
    (fileStorageService as unknown as { basePath: string }).basePath = originalDataPath;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  async function addItem(id: string): Promise<void> {
    const elements = await yjsService.getDocument(`${USERNAME}:${SLUG}:elements/`);
    elements.doc.getArray('elements').push([{ id, name: id, type: 'ITEM', order: 0 }]);
  }

  it('reports a revision for a document written under the WebSocket (trailing-slash) name', async () => {
    await addItem('doc1');
    // Browser clients connect with an empty room name, so the server persists
    // the prose document as `<user>:<slug>:<docId>/`.
    const doc = await yjsService.getDocument(`${USERNAME}:${SLUG}:doc1/`);
    doc.doc.getText('prosemirror').insert(0, 'hello');

    const entries = await getProjectDocumentRevisions(USERNAME, SLUG);

    expect(entries).toHaveLength(1);
    // The id the client matches on is reported without the slash.
    expect(entries[0].documentId).toBe(`${USERNAME}:${SLUG}:doc1`);
    expect(entries[0].revision).not.toBeNull();
    expect(entries[0].unknown).toBeUndefined();
  });

  it('still reports a revision for a document written without the slash', async () => {
    await addItem('doc2');
    const doc = await yjsService.getDocument(`${USERNAME}:${SLUG}:doc2`);
    doc.doc.getText('prosemirror').insert(0, 'hello');

    const entries = await getProjectDocumentRevisions(USERNAME, SLUG);

    expect(entries[0].documentId).toBe(`${USERNAME}:${SLUG}:doc2`);
    expect(entries[0].revision).not.toBeNull();
  });

  it('moves the token when either stored form receives a new update', async () => {
    await addItem('doc3');
    const slashed = await yjsService.getDocument(`${USERNAME}:${SLUG}:doc3/`);
    const bare = await yjsService.getDocument(`${USERNAME}:${SLUG}:doc3`);
    slashed.doc.getText('prosemirror').insert(0, 'a');
    slashed.doc.getText('prosemirror').insert(0, 'b');
    bare.doc.getText('prosemirror').insert(0, 'c');

    const first = (await getProjectDocumentRevisions(USERNAME, SLUG))[0].revision;
    expect(first).not.toBeNull();

    // The bare form's clock is behind the slash form's; a max() would hide this.
    bare.doc.getText('prosemirror').insert(0, 'd');
    const second = (await getProjectDocumentRevisions(USERNAME, SLUG))[0].revision;
    expect(second).not.toBe(first);

    slashed.doc.getText('prosemirror').insert(0, 'e');
    const third = (await getProjectDocumentRevisions(USERNAME, SLUG))[0].revision;
    expect(third).not.toBe(second);
  });

  it('reports null for a document never persisted under either name', async () => {
    await addItem('doc4');

    const entries = await getProjectDocumentRevisions(USERNAME, SLUG);

    expect(entries).toEqual([{ documentId: `${USERNAME}:${SLUG}:doc4`, revision: null }]);
  });
});
