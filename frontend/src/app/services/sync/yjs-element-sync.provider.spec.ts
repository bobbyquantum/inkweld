import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType } from '@inkweld/index';
import { type ElementRelationship } from '@models/element-ref.model';
import { type ElementTag, type TagDefinition } from '@models/tag.model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { DocumentSyncState } from '../../models/document-sync-state';
import { type MediaProjectTag } from '../../models/media-project-tag.model';
import { type MediaTag } from '../../models/media-tag.model';
import {
  ChapterNumbering,
  PublishFormat,
  type PublishPlan,
} from '../../models/publish-plan';
import { type ElementTypeSchema } from '../../models/schema-types';
import { AuthTokenService } from '../auth/auth-token.service';
import { LoggerService } from '../core/logger.service';
import { StorageContextService } from '../core/storage-context.service';
import { VersionCompatibilityService } from '../core/version-compatibility.service';
import { YjsElementSyncProvider } from './yjs-element-sync.provider';

const websocketModuleMocks = vi.hoisted(() => ({
  createAuthenticatedWebsocketProvider: vi.fn(),
  setupReauthentication: vi.fn(),
}));

vi.mock(
  '@services/sync/authenticated-websocket-provider',
  () => websocketModuleMocks
);

describe('YjsElementSyncProvider', () => {
  let provider: YjsElementSyncProvider;
  let authTokenService: { getToken: ReturnType<typeof vi.fn> };
  let storageContext: { prefixDocumentId: ReturnType<typeof vi.fn> };
  let versionCompatibility: { syncBlocked: ReturnType<typeof vi.fn> };
  let websocketProvider: {
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    awareness: {
      setLocalState: ReturnType<typeof vi.fn>;
      setLocalStateField: ReturnType<typeof vi.fn>;
      getStates: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      off: ReturnType<typeof vi.fn>;
      clientID: number;
    };
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  const sampleElements: Element[] = [
    {
      id: 'element-1',
      name: 'Chapter 1',
      type: ElementType.Item,
      parentId: null,
      level: 0,
      order: 0,
      expandable: false,
      version: 0,
      metadata: {},
    },
  ];
  const samplePlans: PublishPlan[] = [
    {
      id: 'plan-1',
      name: 'Launch plan',
      format: PublishFormat.HTML,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      metadata: {
        title: 'Launch plan',
        author: 'Test Author',
        language: 'en',
      },
      items: [],
      options: {
        chapterNumbering: ChapterNumbering.None,
        sceneBreakText: '* * *',
        includeWordCounts: false,
        includeToc: true,
        includeCover: false,
        fontFamily: 'Georgia',
        fontSize: 12,
        lineHeight: 1.5,
      },
    },
  ];
  const sampleRelationships: ElementRelationship[] = [
    {
      id: 'relationship-1',
      sourceElementId: 'element-1',
      targetElementId: 'element-2',
      relationshipTypeId: 'ally',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];
  const sampleSchemas: ElementTypeSchema[] = [
    {
      id: 'schema-1',
      name: 'Character',
      icon: 'person',
      description: 'Character schema',
      version: 1,
      tabs: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];
  const sampleElementTags: ElementTag[] = [
    {
      id: 'tag-link-1',
      elementId: 'element-1',
      tagId: 'tag-1',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
  ];
  const sampleCustomTags: TagDefinition[] = [
    {
      id: 'tag-1',
      name: 'Important',
      icon: 'label',
      color: '#ff0000',
    },
  ];

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    authTokenService = {
      getToken: vi.fn().mockReturnValue('token'),
    };
    storageContext = {
      prefixDocumentId: vi.fn((documentId: string) => `prefix:${documentId}`),
    };
    versionCompatibility = {
      syncBlocked: vi.fn().mockReturnValue(false),
    };
    websocketProvider = {
      on: vi.fn(),
      off: vi.fn(),
      connect: vi.fn(),
      destroy: vi.fn(),
      awareness: {
        setLocalState: vi.fn(),
        setLocalStateField: vi.fn(),
        getStates: vi.fn().mockReturnValue(new Map()),
        on: vi.fn(),
        off: vi.fn(),
        clientID: 123,
      },
    };

    websocketModuleMocks.createAuthenticatedWebsocketProvider.mockResolvedValue(
      websocketProvider
    );
    websocketModuleMocks.setupReauthentication.mockImplementation(
      () => undefined
    );

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        YjsElementSyncProvider,
        { provide: LoggerService, useValue: logger },
        { provide: AuthTokenService, useValue: authTokenService },
        {
          provide: StorageContextService,
          useValue: storageContext,
        },
        {
          provide: VersionCompatibilityService,
          useValue: versionCompatibility,
        },
      ],
    });

    provider = TestBed.inject(YjsElementSyncProvider);
  });

  function attachDoc(): Y.Doc {
    const doc = new Y.Doc();
    (provider as unknown as { doc: Y.Doc | null }).doc = doc;
    return doc;
  }

  it('returns disconnected state when not connected', () => {
    expect(provider.isConnected()).toBe(false);
    expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
    expect(provider.getElements()).toEqual([]);
    expect(provider.getPublishPlans()).toEqual([]);
    expect(provider.getRelationships()).toEqual([]);
    expect(provider.getCustomTags()).toEqual([]);
    expect(provider.getProjectMeta()).toBeUndefined();
  });

  it('updates yjs-backed collections and exposes them through getters', () => {
    const doc = attachDoc();

    provider.updateElements(sampleElements);
    provider.updatePublishPlans(samplePlans);
    provider.updateRelationships(sampleRelationships);
    provider.updateCustomRelationshipTypes([]);
    provider.updateSchemas(sampleSchemas);
    provider.updateElementTags(sampleElementTags);
    provider.updateCustomTags(sampleCustomTags);
    provider.updateProjectMeta({
      name: 'Project Title',
      description: 'Project Description',
      coverMediaId: 'cover-1',
    });

    expect(provider.getElements()).toEqual(sampleElements);
    expect(provider.getPublishPlans()).toEqual(samplePlans);
    expect(provider.getRelationships()).toEqual(sampleRelationships);
    expect(provider.getSchemas()).toEqual(sampleSchemas);
    expect(provider.getElementTags()).toEqual(sampleElementTags);
    expect(provider.getCustomTags()).toEqual(sampleCustomTags);
    expect(provider.getProjectMeta()).toMatchObject({
      name: 'Project Title',
      description: 'Project Description',
      coverMediaId: 'cover-1',
    });
    expect(doc.getArray('elements').toArray()).toEqual(sampleElements);
    expect(doc.getArray('publishPlans').toArray()).toEqual(samplePlans);
    expect(doc.getArray('relationships').toArray()).toEqual(
      sampleRelationships
    );
    expect(doc.getArray('schemas').toArray()).toEqual(sampleSchemas);
    expect(doc.getArray('elementTags').toArray()).toEqual(sampleElementTags);
    expect(doc.getArray('customTags').toArray()).toEqual(sampleCustomTags);
    expect(doc.getMap('projectMeta').get('name')).toBe('Project Title');
  });

  it('warns and keeps state unchanged when updates are attempted without a document', () => {
    provider.updateElements(sampleElements);
    provider.updatePublishPlans(samplePlans);
    provider.updateRelationships(sampleRelationships);
    provider.updateCustomRelationshipTypes([]);
    provider.updateSchemas(sampleSchemas);
    provider.updateElementTags(sampleElementTags);
    provider.updateCustomTags(sampleCustomTags);
    provider.updateProjectMeta({ name: 'Ignored' });

    expect(logger.warn).toHaveBeenCalledTimes(8);
    expect(provider.getElements()).toEqual([]);
    expect(provider.getProjectMeta()).toBeUndefined();
  });

  it('loads arrays and project metadata from the backing yjs document', () => {
    const doc = attachDoc();
    doc.getArray<Element>('elements').insert(0, sampleElements);
    doc.getArray<PublishPlan>('publishPlans').insert(0, samplePlans);
    doc
      .getArray<ElementRelationship>('relationships')
      .insert(0, sampleRelationships);
    doc.getArray<ElementTypeSchema>('schemas').insert(0, sampleSchemas);
    doc.getArray<ElementTag>('elementTags').insert(0, sampleElementTags);
    doc.getArray<TagDefinition>('customTags').insert(0, sampleCustomTags);
    doc.getMap<string>('projectMeta').set('name', 'Loaded Project');
    doc.getMap<string>('projectMeta').set('description', 'Loaded Description');

    (
      provider as unknown as { loadElementsFromDoc: () => void }
    ).loadElementsFromDoc();

    expect(provider.getElements()).toEqual(sampleElements);
    expect(provider.getPublishPlans()).toEqual(samplePlans);
    expect(provider.getRelationships()).toEqual(sampleRelationships);
    expect(provider.getSchemas()).toEqual(sampleSchemas);
    expect(provider.getElementTags()).toEqual(sampleElementTags);
    expect(provider.getCustomTags()).toEqual(sampleCustomTags);
    expect(provider.getProjectMeta()).toMatchObject({
      name: 'Loaded Project',
      description: 'Loaded Description',
    });
  });

  it('reacts to observed yjs changes after observers are installed', () => {
    const doc = attachDoc();

    (
      provider as unknown as { setupDocumentObserver: () => void }
    ).setupDocumentObserver();

    doc.getArray<Element>('elements').insert(0, sampleElements);
    doc.getArray<PublishPlan>('publishPlans').insert(0, samplePlans);
    doc
      .getArray<ElementRelationship>('relationships')
      .insert(0, sampleRelationships);
    doc.getArray<ElementTypeSchema>('schemas').insert(0, sampleSchemas);
    doc.getMap<string>('projectMeta').set('name', 'Observed Project');

    expect(provider.getElements()).toEqual(sampleElements);
    expect(provider.getPublishPlans()).toEqual(samplePlans);
    expect(provider.getRelationships()).toEqual(sampleRelationships);
    expect(provider.getSchemas()).toEqual(sampleSchemas);
    expect(provider.getProjectMeta()).toMatchObject({
      name: 'Observed Project',
    });
  });

  it('handles websocket status transitions and reconnect scheduling', async () => {
    vi.useFakeTimers();
    const connect = vi.fn();
    (
      provider as unknown as { wsProvider: { connect: () => void } | null }
    ).wsProvider = { connect };

    (
      provider as unknown as { handleWebSocketStatus: (status: string) => void }
    ).handleWebSocketStatus('connecting');
    expect(provider.getSyncState()).toBe(DocumentSyncState.Syncing);

    (
      provider as unknown as { handleWebSocketStatus: (status: string) => void }
    ).handleWebSocketStatus('disconnected');
    expect(provider.getSyncState()).toBe(DocumentSyncState.Local);

    await vi.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(1);

    (
      provider as unknown as { handleWebSocketStatus: (status: string) => void }
    ).handleWebSocketStatus('connected');
    expect(provider.getSyncState()).toBe(DocumentSyncState.Synced);

    vi.useRealTimers();
  });

  it('marks auth failures as unavailable and treats other errors as local-only', () => {
    (
      provider as unknown as { handleConnectionError: (event: unknown) => void }
    ).handleConnectionError(new Error('401 Unauthorized'));

    expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);

    (
      provider as unknown as { handleConnectionError: (event: unknown) => void }
    ).handleConnectionError('temporary network failure');

    expect(provider.getSyncState()).toBe(DocumentSyncState.Local);
  });

  it('installs browser online and offline handlers that reconnect and downgrade sync state', () => {
    const connect = vi.fn();
    (
      provider as unknown as { wsProvider: { connect: () => void } | null }
    ).wsProvider = { connect };

    (
      provider as unknown as { setupNetworkHandlers: () => void }
    ).setupNetworkHandlers();

    globalThis.dispatchEvent(new Event('offline'));
    expect(provider.getSyncState()).toBe(DocumentSyncState.Local);

    globalThis.dispatchEvent(new Event('online'));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects and resets local state', () => {
    const doc = attachDoc();
    const destroy = vi.fn();
    const removeEventListenerSpy = vi.spyOn(globalThis, 'removeEventListener');

    doc.getArray<Element>('elements').insert(0, sampleElements);
    (
      provider as unknown as { wsProvider: { destroy: () => void } | null }
    ).wsProvider = { destroy };
    (
      provider as unknown as {
        idbProvider: { destroy: () => Promise<void> } | null;
      }
    ).idbProvider = {
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    (
      provider as unknown as { onlineHandler: (() => void) | null }
    ).onlineHandler = () => {};
    (
      provider as unknown as { offlineHandler: (() => void) | null }
    ).offlineHandler = () => {};

    provider.disconnect();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(removeEventListenerSpy).toHaveBeenCalled();
    expect(provider.getElements()).toEqual([]);
    expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
  });

  it('creates a default readme element for new projects', () => {
    const elements = (
      provider as unknown as { createDefaultElements: () => Element[] }
    ).createDefaultElements();

    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({
      name: 'README',
      type: ElementType.Item,
      parentId: null,
    });
  });

  describe('connect', () => {
    it('fails fast when the websocket url is missing', async () => {
      const result = await provider.connect({
        username: 'testuser',
        slug: 'test-project',
      });

      expect(result).toEqual({
        success: false,
        error: 'WebSocket URL is required for Yjs sync',
      });
    });

    it('falls back to local mode when no auth token is available', async () => {
      authTokenService.getToken.mockReturnValue(null);

      const result = await provider.connect({
        username: 'testuser',
        slug: 'test-project',
        webSocketUrl: 'ws://localhost:8333',
      });

      expect(result).toEqual({ success: true });
      expect(provider.getSyncState()).toBe(DocumentSyncState.Local);
      expect(storageContext.prefixDocumentId).toHaveBeenCalledWith(
        'testuser:test-project:elements'
      );
    });

    it('falls back to local mode when sync is blocked by version compatibility', async () => {
      versionCompatibility.syncBlocked.mockReturnValue(true);

      const result = await provider.connect({
        username: 'testuser',
        slug: 'test-project',
        webSocketUrl: 'ws://localhost:8333',
      });

      expect(result).toEqual({ success: true });
      expect(provider.getSyncState()).toBe(DocumentSyncState.Local);
    });

    it('preserves queued awareness across pre-connect cleanup', () => {
      provider.setLocalAwareness({
        user: { name: 'alice', color: '#abcdef' },
        location: 'timeline:e1',
      });

      // Simulate connect() preserving pending awareness across disconnect().
      const queued = (provider as unknown as { pendingAwareness: unknown })
        .pendingAwareness;
      provider.disconnect();
      (provider as unknown as { pendingAwareness: unknown }).pendingAwareness =
        queued;

      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupAwarenessHandlers: () => void }
      ).setupAwarenessHandlers();

      expect(
        websocketProvider.awareness.setLocalStateField
      ).toHaveBeenCalledWith('user', { name: 'alice', color: '#abcdef' });
      expect(
        websocketProvider.awareness.setLocalStateField
      ).toHaveBeenCalledWith('location', 'timeline:e1');
    });

    it.skip('falls back to local mode when websocket authentication fails', async () => {
      websocketModuleMocks.createAuthenticatedWebsocketProvider.mockRejectedValueOnce(
        new Error('auth failed')
      );

      const result = await provider.connect({
        username: 'testuser',
        slug: 'test-project',
        webSocketUrl: 'ws://localhost:8333',
      });

      expect(result).toEqual({ success: true });
      expect(provider.getSyncState()).toBe(DocumentSyncState.Local);
      expect(logger.error).toHaveBeenCalled();
    });

    it.skip('connects successfully and cleans up on disconnect', async () => {
      const callbacks: Record<string, (payload: unknown) => void> = {};
      websocketProvider.on.mockImplementation((event: string, cb: any) => {
        callbacks[event] = cb;
      });

      const result = await provider.connect({
        username: 'testuser',
        slug: 'test-project',
        webSocketUrl: 'ws://localhost:8333',
      });

      expect(result).toEqual({ success: true });
      expect(provider.isConnected()).toBe(true);
      expect(provider.getSyncState()).toBe(DocumentSyncState.Synced);
      expect(
        websocketModuleMocks.createAuthenticatedWebsocketProvider
      ).toHaveBeenCalledWith(
        'ws://localhost:8333/api/v1/ws/yjs?documentId=testuser:test-project:elements',
        '',
        expect.any(Y.Doc),
        'token',
        { resyncInterval: 10000 }
      );
      expect(websocketModuleMocks.setupReauthentication).toHaveBeenCalledTimes(
        1
      );

      callbacks['sync']?.(true);
      callbacks['status']?.({ status: 'connected' });
      expect(provider.getSyncState()).toBe(DocumentSyncState.Synced);

      provider.disconnect();

      expect(websocketProvider.destroy).toHaveBeenCalledTimes(1);
      expect(provider.isConnected()).toBe(false);
      expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });
  });

  describe('Media Tags', () => {
    const sampleMediaTags: MediaTag[] = [
      {
        id: 'mt-1',
        mediaId: 'media-1',
        elementId: 'elem-1',
        createdAt: '2025-01-01T00:00:00Z',
      },
    ];
    const sampleMediaProjectTags: MediaProjectTag[] = [
      {
        id: 'mpt-1',
        mediaId: 'media-1',
        tagId: 'tag-1',
        createdAt: '2025-01-01T00:00:00Z',
      },
    ];

    it('should return empty media tags initially', () => {
      expect(provider.getMediaTags()).toEqual([]);
    });

    it('should return empty media project tags initially', () => {
      expect(provider.getMediaProjectTags()).toEqual([]);
    });

    it('should update media tags in yjs doc', () => {
      const doc = attachDoc();
      provider.updateMediaTags(sampleMediaTags);
      expect(provider.getMediaTags()).toEqual(sampleMediaTags);
      expect(doc.getArray('mediaTags').toArray()).toEqual(sampleMediaTags);
    });

    it('should update media project tags in yjs doc', () => {
      const doc = attachDoc();
      provider.updateMediaProjectTags(sampleMediaProjectTags);
      expect(provider.getMediaProjectTags()).toEqual(sampleMediaProjectTags);
      expect(doc.getArray('mediaProjectTags').toArray()).toEqual(
        sampleMediaProjectTags
      );
    });

    it('should warn when updating media tags without doc', () => {
      provider.updateMediaTags(sampleMediaTags);
      expect(logger.warn).toHaveBeenCalledWith(
        'YjsSync',
        'Cannot update media tags - not connected'
      );
    });

    it('should warn when updating media project tags without doc', () => {
      provider.updateMediaProjectTags(sampleMediaProjectTags);
      expect(logger.warn).toHaveBeenCalledWith(
        'YjsSync',
        'Cannot update media project tags - not connected'
      );
    });

    it('should load media tags from existing yjs doc', () => {
      const doc = attachDoc();
      doc.getArray<MediaTag>('mediaTags').insert(0, sampleMediaTags);
      doc
        .getArray<MediaProjectTag>('mediaProjectTags')
        .insert(0, sampleMediaProjectTags);

      (
        provider as unknown as { loadElementsFromDoc: () => void }
      ).loadElementsFromDoc();

      expect(provider.getMediaTags()).toEqual(sampleMediaTags);
      expect(provider.getMediaProjectTags()).toEqual(sampleMediaProjectTags);
    });

    it('should emit media tags via observable', () => {
      attachDoc();
      const emitted: MediaTag[][] = [];
      provider.mediaTags$.subscribe(tags => emitted.push(tags));

      provider.updateMediaTags(sampleMediaTags);
      expect(emitted).toContainEqual(sampleMediaTags);
    });

    it('should emit media project tags via observable', () => {
      attachDoc();
      const emitted: MediaProjectTag[][] = [];
      provider.mediaProjectTags$.subscribe(tags => emitted.push(tags));

      provider.updateMediaProjectTags(sampleMediaProjectTags);
      expect(emitted).toContainEqual(sampleMediaProjectTags);
    });

    it('should replace existing media tags on update', () => {
      const doc = attachDoc();
      provider.updateMediaTags(sampleMediaTags);
      expect(provider.getMediaTags().length).toBe(1);

      const newTags: MediaTag[] = [
        {
          id: 'mt-2',
          mediaId: 'media-2',
          elementId: 'elem-2',
          createdAt: '2025-01-02T00:00:00Z',
        },
        {
          id: 'mt-3',
          mediaId: 'media-3',
          elementId: 'elem-3',
          createdAt: '2025-01-03T00:00:00Z',
        },
      ];
      provider.updateMediaTags(newTags);
      expect(provider.getMediaTags()).toEqual(newTags);
      expect(doc.getArray('mediaTags').toArray()).toEqual(newTags);
    });
  });

  describe('awareness / presence', () => {
    it('queues awareness fields and applies them to the websocket provider once connected', () => {
      // Before wsProvider exists, queue should accumulate.
      provider.setLocalAwareness({
        user: { name: 'alice', color: '#abcdef' },
      });
      provider.setLocalAwareness({ location: 'timeline:e1' });

      // Attach the mocked ws provider, then trigger applyPendingAwareness.
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { applyPendingAwareness: () => void }
      ).applyPendingAwareness();

      expect(
        websocketProvider.awareness.setLocalStateField
      ).toHaveBeenCalledWith('user', { name: 'alice', color: '#abcdef' });
      expect(
        websocketProvider.awareness.setLocalStateField
      ).toHaveBeenCalledWith('location', 'timeline:e1');
    });

    it('emits remote presence excluding the local clientID', () => {
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      websocketProvider.awareness.getStates.mockReturnValue(
        new Map<number, unknown>([
          [123, { user: { name: 'self', color: '#000000' } }],
          [
            456,
            {
              user: { name: 'bob', color: '#112233' },
              location: 'timeline:e1',
            },
          ],
        ])
      );

      const received: unknown[] = [];
      const sub = provider.remotePresence$.subscribe(users => {
        received.push(users);
      });

      (
        provider as unknown as { emitRemotePresence: () => void }
      ).emitRemotePresence();

      sub.unsubscribe();
      const last = received[received.length - 1] as Array<{
        clientId: number;
        username: string;
      }>;
      expect(last.map(u => u.clientId)).toEqual([456]);
      expect(last[0]).toMatchObject({
        clientId: 456,
        username: 'bob',
        color: '#112233',
        location: 'timeline:e1',
      });
    });

    it('subscribes to awareness change/update events on setup', () => {
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupAwarenessHandlers: () => void }
      ).setupAwarenessHandlers();

      expect(websocketProvider.awareness.on).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
      expect(websocketProvider.awareness.on).toHaveBeenCalledWith(
        'update',
        expect.any(Function)
      );
    });

    it('clears local awareness state on disconnect', () => {
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupAwarenessHandlers: () => void }
      ).setupAwarenessHandlers();

      provider.disconnect();

      expect(websocketProvider.awareness.setLocalState).toHaveBeenCalledWith(
        null
      );
      expect(websocketProvider.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('pinnedElementIds in projectMeta', () => {
    it('stores and retrieves pinnedElementIds via updateProjectMeta', () => {
      attachDoc();

      provider.updateProjectMeta({
        name: 'Test Project',
        description: '',
        pinnedElementIds: ['elem-1', 'elem-2'],
      });

      const meta = provider.getProjectMeta();
      expect(meta?.pinnedElementIds).toEqual(['elem-1', 'elem-2']);
    });

    it('deletes pinnedElementIds key when array is empty', () => {
      const doc = attachDoc();

      provider.updateProjectMeta({
        name: 'Test Project',
        description: '',
        pinnedElementIds: ['elem-1'],
      });
      provider.updateProjectMeta({
        pinnedElementIds: [],
      });

      // The yjs map key should be deleted
      expect(doc.getMap('projectMeta').get('pinnedElementIds')).toBeUndefined();
      // In-memory state reflects empty array
      expect(provider.getProjectMeta()?.pinnedElementIds).toEqual([]);
    });

    it('returns undefined pinnedElementIds when key is absent', () => {
      attachDoc();

      provider.updateProjectMeta({ name: 'No Pins', description: '' });

      expect(provider.getProjectMeta()?.pinnedElementIds).toBeUndefined();
    });

    it('handles invalid JSON in pinnedElementIds gracefully', () => {
      const doc = attachDoc();

      doc.transact(() => {
        doc.getMap<string>('projectMeta').set('name', 'Test');
        doc.getMap<string>('projectMeta').set('pinnedElementIds', 'not-json');
      });
      (
        provider as unknown as { loadElementsFromDoc: () => void }
      ).loadElementsFromDoc();

      expect(provider.getProjectMeta()?.pinnedElementIds).toBeUndefined();
    });
  });
});
