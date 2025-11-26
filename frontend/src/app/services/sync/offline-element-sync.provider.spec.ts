import { TestBed } from '@angular/core/testing';
import { Element, ElementType } from '@inkweld/index';
import { BehaviorSubject, Subject } from 'rxjs';
import { vi } from 'vitest';

import { DocumentSyncState } from '../../models/document-sync-state';
import { LoggerService } from '../core/logger.service';
import { OfflineProjectElementsService } from '../offline/offline-project-elements.service';
import { OfflineElementSyncProvider } from './offline-element-sync.provider';

describe('OfflineElementSyncProvider', () => {
  let provider: OfflineElementSyncProvider;
  let mockOfflineElementsService: {
    loadElements: ReturnType<typeof vi.fn>;
    elements: ReturnType<typeof vi.fn>;
    saveElements: ReturnType<typeof vi.fn>;
    closeConnection: ReturnType<typeof vi.fn>;
    _elementsSubject: BehaviorSubject<Element[]>;
    _errorsSubject: Subject<string>;
  };
  let mockLoggerService: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    group: ReturnType<typeof vi.fn>;
  };

  const mockElement: Element = {
    id: 'elem-1',
    name: 'Test Element',
    type: ElementType.Folder,
    parentId: null,
    level: 0,
    order: 0,
    expandable: true,
    version: 0,
    metadata: {},
  };

  beforeEach(() => {
    const elementsSubject = new BehaviorSubject<Element[]>([]);
    const errorsSubject = new Subject<string>();

    mockOfflineElementsService = {
      loadElements: vi.fn().mockResolvedValue(undefined),
      elements: vi.fn(() => elementsSubject.getValue()),
      saveElements: vi.fn().mockResolvedValue(undefined),
      closeConnection: vi.fn().mockResolvedValue(undefined),
      _elementsSubject: elementsSubject,
      _errorsSubject: errorsSubject,
    };

    mockLoggerService = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      group: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        OfflineElementSyncProvider,
        {
          provide: OfflineProjectElementsService,
          useValue: mockOfflineElementsService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    });

    provider = TestBed.inject(OfflineElementSyncProvider);
  });

  describe('Initial State', () => {
    it('should start with Unavailable sync state', () => {
      expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('should start with empty elements', () => {
      expect(provider.getElements()).toEqual([]);
    });

    it('should start disconnected', () => {
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('connect()', () => {
    const config = {
      username: 'testuser',
      slug: 'test-project',
    };

    it('should connect successfully', async () => {
      const result = await provider.connect(config);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should load elements from offline storage', async () => {
      await provider.connect(config);

      expect(mockOfflineElementsService.loadElements).toHaveBeenCalledWith(
        'testuser',
        'test-project'
      );
    });

    it('should update sync state to Offline', async () => {
      await provider.connect(config);

      expect(provider.getSyncState()).toBe(DocumentSyncState.Offline);
    });

    it('should mark as connected', async () => {
      await provider.connect(config);

      expect(provider.isConnected()).toBe(true);
    });

    it('should emit loaded elements', async () => {
      mockOfflineElementsService._elementsSubject.next([mockElement]);
      mockOfflineElementsService.elements.mockReturnValue([mockElement]);

      await provider.connect(config);

      expect(provider.getElements()).toEqual([mockElement]);
    });

    it('should handle connection errors gracefully', async () => {
      mockOfflineElementsService.loadElements.mockRejectedValue(
        new Error('Storage error')
      );

      const result = await provider.connect(config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
    });
  });

  describe('disconnect()', () => {
    const config = {
      username: 'testuser',
      slug: 'test-project',
    };

    it('should disconnect and reset state', async () => {
      await provider.connect(config);

      provider.disconnect();

      expect(provider.isConnected()).toBe(false);
      expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('should clear elements on disconnect', async () => {
      mockOfflineElementsService._elementsSubject.next([mockElement]);
      mockOfflineElementsService.elements.mockReturnValue([mockElement]);
      await provider.connect(config);

      provider.disconnect();

      expect(provider.getElements()).toEqual([]);
    });
  });

  describe('updateElements()', () => {
    const config = {
      username: 'testuser',
      slug: 'test-project',
    };

    it('should save elements to offline storage', async () => {
      await provider.connect(config);

      const elements = [mockElement];
      provider.updateElements(elements);

      expect(mockOfflineElementsService.saveElements).toHaveBeenCalledWith(
        'testuser',
        'test-project',
        elements
      );
    });

    it('should update local state immediately (optimistic update)', async () => {
      await provider.connect(config);

      const elements = [mockElement];
      provider.updateElements(elements);

      // State should be updated synchronously (optimistic update)
      expect(provider.getElements()).toEqual(elements);
    });

    it('should warn if not connected', () => {
      provider.updateElements([mockElement]);

      expect(mockLoggerService.warn).toHaveBeenCalled();
    });
  });

  describe('Observables', () => {
    const config = {
      username: 'testuser',
      slug: 'test-project',
    };

    it('should emit sync state changes', async () => {
      const states: DocumentSyncState[] = [];
      const sub = provider.syncState$.subscribe(state => states.push(state));

      await provider.connect(config);
      provider.disconnect();

      sub.unsubscribe();

      expect(states).toContain(DocumentSyncState.Unavailable);
      expect(states).toContain(DocumentSyncState.Offline);
    });

    it('should emit element changes immediately', async () => {
      await provider.connect(config);

      provider.updateElements([mockElement]);

      // Elements should be updated synchronously
      const elements = provider.getElements();
      expect(elements).toEqual([mockElement]);
    });
  });
});
