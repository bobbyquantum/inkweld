import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoggerService } from '../core/logger.service';
import { DocumentImportService } from './document-import.service';

// Mock y-indexeddb with vi.hoisted to ensure mocks are available before vi.mock
const { mockDestroy, mockWhenSynced } = vi.hoisted(() => ({
  mockDestroy: vi.fn().mockResolvedValue(undefined),
  mockWhenSynced: Promise.resolve(),
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class MockIndexeddbPersistence {
    whenSynced = mockWhenSynced;
    synced = true;
    destroy = mockDestroy;
    on = vi.fn();
    off = vi.fn();
  },
}));

// Mock yjs with vi.hoisted
const { mockMapSet, mockTransact, mockDocDestroy } = vi.hoisted(() => ({
  mockMapSet: vi.fn(),
  mockTransact: vi.fn((callback: () => void) => callback()),
  mockDocDestroy: vi.fn(),
}));
vi.mock('yjs', () => ({
  Doc: class MockDoc {
    getMap = vi.fn().mockReturnValue({ set: mockMapSet });
    getXmlFragment = vi.fn().mockReturnValue({});
    transact = mockTransact;
    destroy = mockDocDestroy;
  },
  Array: class MockArray {
    private items: unknown[] = [];
    push(items: unknown[]) {
      this.items.push(...items);
    }
    toArray() {
      return this.items;
    }
  },
  Map: class MockMap {
    private data: Record<string, unknown> = {};
    set(key: string, value: unknown) {
      this.data[key] = value;
    }
    get(key: string) {
      return this.data[key];
    }
    toJSON() {
      return this.data;
    }
  },
}));

describe('DocumentImportService', () => {
  let service: DocumentImportService;
  let logger: { debug: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DocumentImportService,
        { provide: LoggerService, useValue: logger },
      ],
    });

    service = TestBed.inject(DocumentImportService);
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
  });
});
