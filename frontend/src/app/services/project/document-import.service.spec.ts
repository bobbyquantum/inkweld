import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { LoggerService } from '../core/logger.service';
import { StorageContextService } from '../core/storage-context.service';
import { DocumentImportService } from './document-import.service';

/**
 * Keep the docs the service writes from being destroyed, so a test can read
 * back what reached the (mocked) IndexedDB provider.
 */
function captureWrittenDocs(): Y.Doc[] {
  const docs: Y.Doc[] = [];
  vi.spyOn(Y.Doc.prototype, 'destroy').mockImplementation(function (
    this: Y.Doc
  ) {
    docs.push(this);
  });
  return docs;
}

// y-indexeddb is mocked globally in setup-vitest.ts with full on/off support.
// Real yjs is used here (not mocked) because vi.mock('yjs') is unreliable with
// isolate: false — the service may already have a bound reference to the real
// module from another test file's import. Real yjs is fine since it only does
// in-memory CRDT operations; the storage layer (y-indexeddb) is the mock.

describe('DocumentImportService', () => {
  let service: DocumentImportService;
  let logger: { debug: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        DocumentImportService,
        { provide: LoggerService, useValue: logger },
      ],
    });

    service = TestBed.inject(DocumentImportService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('writeDocumentContent', () => {
    it('should write document content to IndexedDB', async () => {
      const documentId = 'testuser:project-slug:elem-123';
      const content = [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      ];

      await service.writeDocumentContent(documentId, content);

      expect(logger.debug).toHaveBeenCalledWith(
        'DocumentImport',
        expect.stringContaining(documentId)
      );
    });

    it('should handle empty content', async () => {
      const documentId = 'testuser:project-slug:elem-456';
      const content: unknown[] = [];

      await service.writeDocumentContent(documentId, content);

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle complex nested content', async () => {
      const documentId = 'testuser:project-slug:elem-789';
      const content = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'text', marks: [{ type: 'bold' }], text: 'World' },
            ],
          },
        ],
      };

      await service.writeDocumentContent(documentId, content);

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle null content', async () => {
      const documentId = 'testuser:project-slug:elem-null';

      await service.writeDocumentContent(documentId, null);

      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('writeWorldbuildingData', () => {
    it('stores the data under the active profile prefix', async () => {
      const prefix = vi.spyOn(
        TestBed.inject(StorageContextService),
        'prefixDocumentId'
      );

      await service.writeWorldbuildingData(
        { elementId: 'wb-1', schemaId: 'character-v1', data: {} },
        'testuser',
        'project-slug'
      );

      // "local:" is the prefix when no configuration is stored
      expect(prefix).toHaveBeenCalledWith(
        'worldbuilding:testuser:project-slug:wb-1'
      );
      expect(prefix).toHaveReturnedWith(
        'local:worldbuilding:testuser:project-slug:wb-1'
      );
    });

    it('should write worldbuilding data to IndexedDB', async () => {
      const wb = {
        elementId: 'wb-elem-123',
        schemaId: 'character-v1',
        data: {
          name: 'John Doe',
          age: 30,
          description: 'A test character',
        },
      };

      await service.writeWorldbuildingData(wb, 'testuser', 'project-slug');

      expect(logger.debug).toHaveBeenCalledWith(
        'DocumentImport',
        expect.stringContaining(wb.elementId)
      );
    });

    it('should handle empty data object', async () => {
      const wb = {
        elementId: 'wb-elem-empty',
        schemaId: 'location-v1',
        data: {},
      };

      await service.writeWorldbuildingData(wb, 'testuser', 'project-slug');

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle complex nested worldbuilding data', async () => {
      const wb = {
        elementId: 'wb-elem-complex',
        schemaId: 'character-v1',
        data: {
          name: 'Jane Smith',
          traits: ['brave', 'intelligent'],
          relationships: {
            allies: ['character-1', 'character-2'],
            enemies: ['villain-1'],
          },
          stats: {
            strength: 10,
            intelligence: 15,
          },
        },
      };

      await service.writeWorldbuildingData(wb, 'testuser', 'my-project');

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle worldbuilding data with arrays', async () => {
      const wb = {
        elementId: 'wb-elem-arrays',
        schemaId: 'wb-item-v1',
        data: {
          tags: ['magic', 'weapon', 'artifact'],
          properties: [
            { name: 'damage', value: 10 },
            { name: 'durability', value: 100 },
          ],
        },
      };

      await service.writeWorldbuildingData(wb, 'user', 'slug');

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should write a per-element appearance into the identity map', async () => {
      const wb = {
        elementId: 'wb-elem-appearance',
        schemaId: 'character-v1',
        data: { name: 'Themed Character' },
        appearance: {
          menu: {
            type: 'gradient' as const,
            mode: 'manual' as const,
            light: 'linear-gradient(160deg, #ffffff 0%, #eeeeee 100%)',
            dark: 'linear-gradient(160deg, #000000 0%, #111111 100%)',
          },
        },
      };

      // A successful await proves the nested Y.Map conversion did not throw;
      // the success-path log is only emitted after the transaction commits.
      await service.writeWorldbuildingData(wb, 'testuser', 'project-slug');

      expect(logger.debug).toHaveBeenCalledWith(
        'DocumentImport',
        expect.stringContaining('wb-elem-appearance')
      );
    });

    it('should write dot-notation keys as nested Y.Map structures', async () => {
      const wb = {
        elementId: 'wb-elem-dot',
        schemaId: 'character-v1',
        data: {
          'appearance.height': '180cm',
          'appearance.tags': ['tall', 'blonde'],
          name: 'Test Character',
        },
      };

      // writeWorldbuildingData throws on error (catch re-throws),
      // so a successful await proves the dot-notation path didn't break
      await service.writeWorldbuildingData(wb, 'testuser', 'project-slug');

      // logger.debug is only called on the success path
      expect(logger.debug).toHaveBeenCalledWith(
        'DocumentImport',
        expect.stringContaining('wb-elem-dot')
      );
    });

    describe('grouped fields', () => {
      /** The element's data map, as the editor stores a Character. */
      function editorCharacter(): Y.Doc {
        const doc = new Y.Doc();
        const data = doc.getMap<unknown>('worldbuilding');
        doc.transact(() => {
          data.set('name', 'Mira');
          const appearance = new Y.Map<unknown>();
          data.set('appearance', appearance);
          appearance.set('height', '172cm tall');
          const marks = new Y.Array<unknown>();
          marks.push(['scar', 'tattoo']);
          appearance.set('marks', marks);
          const voice = new Y.Map<unknown>();
          data.set('voice', voice);
          voice.set('accent', 'Coastal');
          const traits = new Y.Array<unknown>();
          traits.push(['brave']);
          data.set('traits', traits);
        });
        return doc;
      }

      async function importData(
        data: Record<string, unknown>
      ): Promise<Y.Map<unknown>> {
        const docs = captureWrittenDocs();
        await service.writeWorldbuildingData(
          { elementId: 'wb-grouped', schemaId: 'character-v1', data },
          'testuser',
          'project-slug'
        );
        expect(docs).toHaveLength(1);
        return docs[0].getMap<unknown>('worldbuilding');
      }

      it('restores the nested groups an export writes', async () => {
        const source = editorCharacter();
        const sourceData = source.getMap<unknown>('worldbuilding');
        // What export writes to worldbuilding.json: nested plain objects
        const exported = JSON.parse(
          JSON.stringify(sourceData.toJSON())
        ) as Record<string, unknown>;
        expect(exported['appearance']).toEqual({
          height: '172cm tall',
          marks: ['scar', 'tattoo'],
        });

        const imported = await importData(exported);

        const appearance = imported.get('appearance');
        expect(appearance).toBeInstanceOf(Y.Map);
        expect((appearance as Y.Map<unknown>).get('height')).toBe('172cm tall');
        expect((appearance as Y.Map<unknown>).get('marks')).toBeInstanceOf(
          Y.Array
        );
        expect(imported.get('traits')).toBeInstanceOf(Y.Array);
        const { schemaId, ...rest } = imported.toJSON();
        expect(schemaId).toBe('character-v1');
        expect(rest).toEqual(sourceData.toJSON());
      });

      it('restores dot-notation keys into the same nested groups', async () => {
        const imported = await importData({
          'appearance.height': '180cm',
          'appearance.marks': ['scar'],
          'voice.accent': 'Coastal',
          name: 'Test Character',
        });

        expect(imported.get('appearance')).toBeInstanceOf(Y.Map);
        expect(imported.toJSON()).toMatchObject({
          name: 'Test Character',
          appearance: { height: '180cm', marks: ['scar'] },
          voice: { accent: 'Coastal' },
        });
      });

      it('merges nested objects and dot-notation keys for one group', async () => {
        const imported = await importData({
          appearance: { height: '172cm tall' },
          'appearance.build': 'Wiry',
        });

        expect(imported.toJSON()['appearance']).toEqual({
          height: '172cm tall',
          build: 'Wiry',
        });
      });

      it('keeps objects inside a group as plain values', async () => {
        const imported = await importData({
          casting: { notes: { draft: 'first pass' } },
        });

        const casting = imported.get('casting') as Y.Map<unknown>;
        expect(casting).toBeInstanceOf(Y.Map);
        expect(casting.get('notes')).toEqual({ draft: 'first pass' });
      });
    });
  });
});
