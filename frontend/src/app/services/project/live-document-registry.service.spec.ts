import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { LiveDocumentRegistryService } from './live-document-registry.service';

/** Create a y-indexeddb-shaped database with `records` rows in `updates`. */
function seedDatabase(name: string, records: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('updates', { autoIncrement: true });
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('updates', 'readwrite');
      const store = tx.objectStore('updates');
      for (let i = 0; i < records; i++) store.add(new Uint8Array([i]));
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise(resolve => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe('LiveDocumentRegistryService', () => {
  let service: LiveDocumentRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        LiveDocumentRegistryService,
      ],
    });
    service = TestBed.inject(LiveDocumentRegistryService);
  });

  it('tracks registered live docs', () => {
    const doc = new Y.Doc();
    expect(service.hasConnection('u:p:d1')).toBe(false);
    expect(service.getConnectedYDoc('u:p:d1')).toBeNull();

    service.register('u:p:d1', doc);
    expect(service.hasConnection('u:p:d1')).toBe(true);
    expect(service.getConnectedYDoc('u:p:d1')).toBe(doc);

    service.unregister('u:p:d1');
    expect(service.getConnectedYDoc('u:p:d1')).toBeNull();
  });

  it('clears every live doc at once', () => {
    service.register('u:p:a', new Y.Doc());
    service.register('u:p:b', new Y.Doc());
    service.clear();
    expect(service.hasConnection('u:p:a')).toBe(false);
    expect(service.hasConnection('u:p:b')).toBe(false);
  });

  it('exposes a local-edit stream', () => {
    const seen: string[] = [];
    const sub = service.localEdit$.subscribe(id => seen.push(id));
    service.localEdit$.next('u:p:d1');
    sub.unsubscribe();
    expect(seen).toEqual(['u:p:d1']);
  });

  describe('hasLocalContent', () => {
    const NAME = 'registry-spec:doc';

    beforeEach(() => deleteDatabase(NAME));

    it('is true for a registered live doc without touching IndexedDB', async () => {
      service.register(NAME, new Y.Doc());
      expect(await service.hasLocalContent(NAME)).toBe(true);
    });

    it('is false for a document with no database, and does not create one', async () => {
      expect(await service.hasLocalContent(NAME)).toBe(false);
      const names = (await indexedDB.databases()).map(d => d.name);
      expect(names).not.toContain(NAME);
    });

    it('is false for a schema-only database with no persisted updates', async () => {
      await seedDatabase(NAME, 0);
      expect(await service.hasLocalContent(NAME)).toBe(false);
    });

    it('is true when persisted updates exist', async () => {
      await seedDatabase(NAME, 2);
      expect(await service.hasLocalContent(NAME)).toBe(true);
    });
  });
});
