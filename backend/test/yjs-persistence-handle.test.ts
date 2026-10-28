/**
 * The project-keyed LevelDB handle in YjsService must be shared by every
 * document of a project, even when the documents are opened concurrently
 * (a client opening a project connects many WebSockets at once).
 *
 * Creating the handle used to `await` the y-leveldb module between checking
 * the map and storing the new handle, so concurrent first opens each built
 * their own LevelDB on the same path. Only one could take the LevelDB lock;
 * the others failed to open, and when a failed one was left in the map every
 * update for the project was silently dropped ("Database is not open").
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { config } from '../src/config/env';
import { fileStorageService } from '../src/services/file-storage.service';
import { YjsService } from '../src/services/yjs.service';

const USERNAME = 'raceuser';
const SLUG = 'raceproj';
const DOC_NAMES = ['elements', 'doc-a', 'doc-b', 'doc-c', 'doc-d', 'doc-e'];

const docId = (name: string) => `${USERNAME}:${SLUG}:${name}/`;

/** Read the persisted text of each document through a fresh service. */
async function readPersistedTexts(names: string[]): Promise<string[]> {
  const reader = new YjsService();
  try {
    const docs = await Promise.all(names.map((name) => reader.getDocument(docId(name))));
    return docs.map((doc) => doc.doc.getText('prosemirror').toString());
  } finally {
    await reader.cleanup();
  }
}

describe('YjsService project LevelDB handle', () => {
  const originalDataPath = config.dataPath;
  let tempRoot: string;
  let service: YjsService;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(tmpdir(), 'inkweld-yjs-handle-'));
    config.dataPath = tempRoot;
    (fileStorageService as unknown as { basePath: string }).basePath = tempRoot;
    service = new YjsService();
  });

  afterEach(async () => {
    await service.cleanup();
    config.dataPath = originalDataPath;
    (fileStorageService as unknown as { basePath: string }).basePath = originalDataPath;
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('persists every document of a project opened concurrently', async () => {
    const docs = await Promise.all(DOC_NAMES.map((name) => service.getDocument(docId(name))));
    for (const [index, doc] of docs.entries()) {
      doc.doc.getText('prosemirror').insert(0, `text ${DOC_NAMES[index]}`);
    }
    // Close the handle so the writes are flushed and a new service can open it.
    await service.cleanup();

    expect(await readPersistedTexts(DOC_NAMES)).toEqual(DOC_NAMES.map((name) => `text ${name}`));
  });

  it('shares one handle between a revision read and concurrent document opens', async () => {
    const [, ...docs] = await Promise.all([
      service.getDocumentRevisions(USERNAME, SLUG, [`${USERNAME}:${SLUG}:doc-a`]),
      ...DOC_NAMES.map((name) => service.getDocument(docId(name))),
    ]);
    for (const [index, doc] of docs.entries()) {
      doc.doc.getText('prosemirror').insert(0, `text ${DOC_NAMES[index]}`);
    }
    await service.cleanup();

    expect(await readPersistedTexts(DOC_NAMES)).toEqual(DOC_NAMES.map((name) => `text ${name}`));
  });

  it('opens a document while the project handle is still closing after an eviction', async () => {
    const first = await service.getDocument(docId('doc-a'));
    first.doc.getText('prosemirror').insert(0, 'text doc-a');

    // Evicting the project's last document closes its handle; don't wait for it.
    const evicting = (
      service as unknown as { evictIdleDocument(doc: unknown): Promise<void> }
    ).evictIdleDocument(first);
    const second = await service.getDocument(docId('doc-b'));
    second.doc.getText('prosemirror').insert(0, 'text doc-b');
    await evicting;
    await service.cleanup();

    expect(await readPersistedTexts(['doc-a', 'doc-b'])).toEqual(['text doc-a', 'text doc-b']);
  });
});
