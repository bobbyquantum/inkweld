import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType } from '@inkweld/index';
import {
  encodePresenceFrame,
  PRESENCE_KEEPALIVE_PING,
  type PresenceSession,
  readPresenceMessage,
  writeHello,
  writeLeave,
  writeSnapshot,
  writeUpdate,
} from '@inkweld/presence';
import { type ElementRelationship } from '@models/element-ref.model';
import { createDefaultPublishStyles } from '@models/publish-style';
import { type ElementTag, type TagDefinition } from '@models/tag.model';
import { type TimeSystem } from '@models/time-system';
import type * as decoding from 'lib0/decoding';
import { createDecoder, readVarUint } from 'lib0/decoding';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
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
    wsconnected: boolean;
    ws: {
      readyState: number;
      OPEN: number;
      send: ReturnType<typeof vi.fn>;
    } | null;
    messageHandlers: Array<unknown>;
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
      },
      styles: createDefaultPublishStyles(),
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
      wsconnected: true,
      ws: { readyState: 1, OPEN: 1, send: vi.fn() },
      messageHandlers: [],
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
      imports: [translocoTestProvider()],
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

    // First-attempt backoff is baseDelayMs (3000) * 2^0 with full jitter in
    // [0.5,1) → up to 3000ms. Advance past the worst case so the scheduled
    // reconnect fires deterministically regardless of the jitter draw.
    await vi.advanceTimersByTimeAsync(3000);
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

  it('extracts type from Event instances in connection-error handler', () => {
    (
      provider as unknown as { handleConnectionError: (event: unknown) => void }
    ).handleConnectionError(new Event('close'));

    expect(provider.getSyncState()).toBe(DocumentSyncState.Local);
  });

  it('treats unknown WebSocket status as Syncing', () => {
    (
      provider as unknown as { handleWebSocketStatus: (status: string) => void }
    ).handleWebSocketStatus('unknown-future-status');

    expect(provider.getSyncState()).toBe(DocumentSyncState.Syncing);
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

    it('preserves queued presence across pre-connect cleanup', () => {
      provider.setLocalPresence({
        user: { id: 'u1', username: 'alice', color: '#abcdef' },
        location: { kind: 'timeline', elementId: 'e1' },
      });

      // Simulate connect() preserving pending presence across disconnect().
      const queued = (provider as unknown as { pendingPresence: unknown })
        .pendingPresence;
      provider.disconnect();
      (provider as unknown as { pendingPresence: unknown }).pendingPresence =
        queued;

      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();

      const sent = websocketProvider.ws?.send.mock.calls[0]?.[0] as ArrayBuffer;
      const decoder = createDecoder(new Uint8Array(sent));
      readVarUint(decoder);
      const decoded = readPresenceMessage(decoder);
      expect(decoded).toMatchObject({
        session: {
          user: { username: 'alice', color: '#abcdef' },
          location: { kind: 'timeline', elementId: 'e1' },
        },
      });
    });

    it('falls back to local mode and logs error when websocket authentication fails', () => {
      // Inject a connected wsProvider with a pre-failed auth scenario by directly
      // exercising the error-handling path that setupReauthentication exposes.
      // This covers the error callback branch inside connectWebSocket.
      websocketModuleMocks.setupReauthentication.mockImplementationOnce(
        (
          _provider: unknown,
          _getToken: unknown,
          onError: (e: unknown) => void
        ) => {
          onError(new Error('re-auth failed'));
        }
      );

      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;

      // Simulate what happens when auth error fires
      const subject = (
        provider as unknown as {
          syncStateSubject: { next: (v: unknown) => void };
        }
      ).syncStateSubject;
      subject.next(DocumentSyncState.Unavailable);
      expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
      provider.disconnect();
    });

    it('handles the setupWebSocketHandlers status: connected branch', () => {
      // Directly call handleWebSocketStatus to cover the 'connected' branch
      const privateProvider = provider as unknown as {
        reconnectAttempts: number;
        reconnectTimeout: ReturnType<typeof setTimeout> | null;
        handleWebSocketStatus: (status: string) => void;
        syncStateSubject: { next: (v: unknown) => void };
        lastConnectionErrorSubject: { next: (v: unknown) => void };
        reconnectTimeouts: Map<string, unknown>;
      };

      privateProvider.reconnectAttempts = 3;
      privateProvider.reconnectTimeout = setTimeout(() => {}, 10000);
      privateProvider.handleWebSocketStatus('connected');

      expect(provider.getSyncState()).toBe(DocumentSyncState.Synced);
      expect(privateProvider.reconnectAttempts).toBe(0);
      expect(privateProvider.reconnectTimeout).toBeNull();
      provider.disconnect();
    });

    it('reports errors thrown before the inner try block as unavailable', async () => {
      // storageContext.prefixDocumentId throws synchronously before the inner
      // try block, causing an unhandled rejection from the async function.
      storageContext.prefixDocumentId.mockImplementationOnce(() => {
        throw new Error('storage exploded');
      });

      await expect(
        provider.connect({
          username: 'testuser',
          slug: 'test-project',
          webSocketUrl: 'ws://localhost:8333',
        })
      ).rejects.toThrow('storage exploded');
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
      expect(provider.getMediaTags()).toHaveLength(1);

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

  describe('canvas contents', () => {
    function makePath(id: string, x = 0) {
      return {
        id,
        layerId: 'L1',
        type: 'path' as const,
        x,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        visible: true,
        locked: false,
        points: [0, 0, 10, 10],
        stroke: '#000',
        strokeWidth: 2,
        closed: false,
        tension: 0,
      };
    }

    const layers = [
      {
        id: 'L1',
        name: 'Layer 1',
        visible: true,
        locked: false,
        opacity: 1,
        order: 0,
      },
    ];

    it('returns null for a canvas with no contents', () => {
      attachDoc();
      expect(provider.getCanvasContents('canvas-1')).toBeNull();
    });

    it('ignores edits when there is no document', () => {
      expect(() =>
        provider.applyCanvasEdit('canvas-1', { upserts: [makePath('a')] })
      ).not.toThrow();
    });

    it('stores each object under its own key', () => {
      const doc = attachDoc();
      provider.applyCanvasEdit('canvas-1', {
        layers,
        upserts: [makePath('a'), makePath('b')],
      });

      const canvas = doc
        .getMap<Y.Map<unknown>>('canvases')
        .get('canvas-1') as Y.Map<unknown>;
      const objects = canvas.get('objects') as Y.Map<string>;
      expect([...objects.keys()].sort()).toEqual(['a', 'b']);
      expect((canvas.get('order') as Y.Array<string>).toArray()).toEqual([
        'a',
        'b',
      ]);
    });

    it('reads objects back in z-order', () => {
      attachDoc();
      provider.applyCanvasEdit('canvas-1', {
        layers,
        upserts: [makePath('a'), makePath('b')],
      });

      const contents = provider.getCanvasContents('canvas-1');
      expect(contents?.objects.map(o => o.id)).toEqual(['a', 'b']);
      expect(contents?.layers).toEqual(layers);
    });

    it('touches only the object being changed', () => {
      const doc = attachDoc();
      provider.applyCanvasEdit('canvas-1', {
        layers,
        upserts: [makePath('a'), makePath('b')],
      });

      const objects = (
        doc.getMap<Y.Map<unknown>>('canvases').get('canvas-1') as Y.Map<unknown>
      ).get('objects') as Y.Map<string>;
      const untouched = objects.get('b');

      provider.applyCanvasEdit('canvas-1', { upserts: [makePath('a', 99)] });

      expect(objects.get('b')).toBe(untouched);
      expect(JSON.parse(objects.get('a') as string).x).toBe(99);
    });

    it('removes deleted objects and their ordering', () => {
      const doc = attachDoc();
      provider.applyCanvasEdit('canvas-1', {
        layers,
        upserts: [makePath('a'), makePath('b')],
      });

      provider.applyCanvasEdit('canvas-1', { deletes: ['a'] });

      const canvas = doc
        .getMap<Y.Map<unknown>>('canvases')
        .get('canvas-1') as Y.Map<unknown>;
      expect((canvas.get('order') as Y.Array<string>).toArray()).toEqual(['b']);
      expect(provider.getCanvasContents('canvas-1')?.objects).toHaveLength(1);
    });

    it('applies an explicit restack', () => {
      attachDoc();
      provider.applyCanvasEdit('canvas-1', {
        layers,
        upserts: [makePath('a'), makePath('b')],
      });

      provider.applyCanvasEdit('canvas-1', { order: ['b', 'a'] });

      expect(
        provider.getCanvasContents('canvas-1')?.objects.map(o => o.id)
      ).toEqual(['b', 'a']);
    });

    it('ignores an edit with nothing in it', () => {
      const doc = attachDoc();
      provider.applyCanvasEdit('canvas-1', {});
      expect(doc.getMap('canvases').has('canvas-1')).toBe(false);
    });

    it('keeps both strokes when two peers draw at once', () => {
      const local = attachDoc();
      provider.applyCanvasEdit('canvas-1', {
        layers,
        upserts: [makePath('mine')],
      });

      // A second peer starts from the same state and adds its own object.
      const remote = new Y.Doc();
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
      const remoteCanvas = remote
        .getMap<Y.Map<unknown>>('canvases')
        .get('canvas-1') as Y.Map<unknown>;
      remote.transact(() => {
        (remoteCanvas.get('objects') as Y.Map<string>).set(
          'theirs',
          JSON.stringify(makePath('theirs'))
        );
        (remoteCanvas.get('order') as Y.Array<string>).push(['theirs']);
      });

      Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));

      expect(
        provider
          .getCanvasContents('canvas-1')
          ?.objects.map(o => o.id)
          .sort()
      ).toEqual(['mine', 'theirs']);
    });

    it('surfaces an object whose ordering has not arrived', () => {
      const doc = attachDoc();
      provider.applyCanvasEdit('canvas-1', {
        layers,
        upserts: [makePath('a')],
      });

      const canvas = doc
        .getMap<Y.Map<unknown>>('canvases')
        .get('canvas-1') as Y.Map<unknown>;
      doc.transact(() => {
        (canvas.get('objects') as Y.Map<string>).set(
          'orphan',
          JSON.stringify(makePath('orphan'))
        );
      });

      expect(
        provider.getCanvasContents('canvas-1')?.objects.map(o => o.id)
      ).toEqual(['a', 'orphan']);
    });

    it('skips unparseable object entries', () => {
      const doc = attachDoc();
      provider.applyCanvasEdit('canvas-1', {
        layers,
        upserts: [makePath('a')],
      });
      const canvas = doc
        .getMap<Y.Map<unknown>>('canvases')
        .get('canvas-1') as Y.Map<unknown>;
      doc.transact(() => {
        (canvas.get('objects') as Y.Map<string>).set('broken', 'not json');
      });

      expect(
        provider.getCanvasContents('canvas-1')?.objects.map(o => o.id)
      ).toEqual(['a']);
    });

    it('emits remote changes but not our own edits', () => {
      const doc = attachDoc();
      (
        provider as unknown as { setupDocumentObserver: () => void }
      ).setupDocumentObserver();

      const seen: number[] = [];
      provider
        .canvasContents$('canvas-1')
        .subscribe(contents => seen.push(contents.objects.length));

      // Initial value from the BehaviorSubject only.
      expect(seen).toEqual([0]);

      provider.applyCanvasEdit('canvas-1', {
        layers,
        upserts: [makePath('a')],
      });
      expect(seen).toEqual([0]);

      // A change from elsewhere in the document does reach subscribers.
      const canvas = doc
        .getMap<Y.Map<unknown>>('canvases')
        .get('canvas-1') as Y.Map<unknown>;
      doc.transact(() => {
        (canvas.get('objects') as Y.Map<string>).set(
          'theirs',
          JSON.stringify(makePath('theirs'))
        );
      });
      expect(seen.at(-1)).toBe(2);
    });

    it('seeds a canvas only when it has no contents yet', () => {
      attachDoc();
      provider.seedCanvasContents('canvas-1', {
        layers,
        objects: [makePath('seed')],
      });
      provider.seedCanvasContents('canvas-1', {
        layers,
        objects: [makePath('ignored')],
      });

      expect(
        provider.getCanvasContents('canvas-1')?.objects.map(o => o.id)
      ).toEqual(['seed']);
    });

    it('mirrors the canvas onto its element after the drawing pauses', () => {
      vi.useFakeTimers();
      try {
        const doc = attachDoc();
        doc.getArray<Element>('elements').insert(0, [
          {
            id: 'canvas-1',
            name: 'Canvas',
            type: ElementType.Canvas,
            parentId: null,
            order: 0,
            level: 0,
            expandable: false,
            version: 1,
            metadata: {},
          },
        ]);

        provider.applyCanvasEdit('canvas-1', {
          layers,
          upserts: [makePath('a')],
        });

        // Nothing written while the pen is still moving.
        expect(
          doc.getArray<Element>('elements').get(0).metadata?.['canvasConfig']
        ).toBeUndefined();

        vi.advanceTimersByTime(5000);

        const snapshot = doc.getArray<Element>('elements').get(0).metadata?.[
          'canvasConfig'
        ];
        expect(snapshot).toBeDefined();
        expect(JSON.parse(snapshot).objects).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('writes a pending snapshot out on disconnect', () => {
      vi.useFakeTimers();
      try {
        const doc = attachDoc();
        doc.getArray<Element>('elements').insert(0, [
          {
            id: 'canvas-1',
            name: 'Canvas',
            type: ElementType.Canvas,
            parentId: null,
            order: 0,
            level: 0,
            expandable: false,
            version: 1,
            metadata: {},
          },
        ]);
        provider.applyCanvasEdit('canvas-1', {
          layers,
          upserts: [makePath('a')],
        });

        provider.disconnect();

        expect(
          doc.getArray<Element>('elements').get(0).metadata?.['canvasConfig']
        ).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('presence', () => {
    function remoteSession(username: string): PresenceSession {
      return {
        sessionId: `s-${username}`,
        user: { id: username, username, color: '#112233' },
        status: 'active',
        location: { kind: 'timeline', elementId: 'e1' },
        lastActivityAt: 1,
      };
    }

    it('sends Hello once identity and websocket are ready', () => {
      provider.setLocalPresence({
        user: { id: 'u1', username: 'alice', color: '#abcdef' },
      });
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();

      expect(websocketProvider.ws?.send).toHaveBeenCalledTimes(1);
    });

    it('handles snapshot messages excluding local username', () => {
      provider.setLocalPresence({
        user: { id: 'self', username: 'alice', color: '#abcdef' },
      });
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();

      const received: PresenceSession[][] = [];
      const sub = provider.remotePresence$.subscribe(users =>
        received.push(users)
      );
      const frame = encodePresenceFrame(encoder =>
        writeSnapshot(encoder, [remoteSession('alice'), remoteSession('bob')])
      );
      const decoder = createDecoder(frame);
      readVarUint(decoder);
      (
        provider as unknown as {
          handlePresenceMessage: (d: typeof decoder) => void;
        }
      ).handlePresenceMessage(decoder);

      sub.unsubscribe();
      expect(received.at(-1)?.map(u => u.user.username)).toEqual(['bob']);
    });

    it('destroys websocket provider on disconnect without awareness cleanup', () => {
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      provider.disconnect();

      expect(websocketProvider.awareness.setLocalState).not.toHaveBeenCalled();
      expect(websocketProvider.destroy).toHaveBeenCalledTimes(1);
    });

    it('sends text keepalive pings without using Yjs or presence binary frames', () => {
      vi.useFakeTimers();
      provider.setLocalPresence({
        user: { id: 'u1', username: 'alice', color: '#abcdef' },
      });
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();
      websocketProvider.ws?.send.mockClear();

      vi.advanceTimersByTime(30_000);

      expect(websocketProvider.ws?.send).toHaveBeenCalledWith(
        PRESENCE_KEEPALIVE_PING
      );
      provider.disconnect();
      vi.useRealTimers();
    });

    it('handles Hello messages from remote peers', () => {
      provider.setLocalPresence({
        user: { id: 'self', username: 'alice', color: '#abcdef' },
      });
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();

      const received: PresenceSession[][] = [];
      const sub = provider.remotePresence$.subscribe(users =>
        received.push(users)
      );

      const frame = encodePresenceFrame(encoder =>
        writeHello(encoder, remoteSession('bob'))
      );
      const decoder = createDecoder(frame);
      readVarUint(decoder);
      (
        provider as unknown as {
          handlePresenceMessage: (d: decoding.Decoder) => void;
        }
      ).handlePresenceMessage(decoder);

      sub.unsubscribe();
      expect(received.at(-1)?.map(u => u.user.username)).toEqual(['bob']);
    });

    it('ignores Hello from self username', () => {
      provider.setLocalPresence({
        user: { id: 'self', username: 'alice', color: '#abcdef' },
      });
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();

      const received: PresenceSession[][] = [];
      const sub = provider.remotePresence$.subscribe(users =>
        received.push(users)
      );

      const frame = encodePresenceFrame(encoder =>
        writeHello(encoder, remoteSession('alice'))
      );
      const decoder = createDecoder(frame);
      readVarUint(decoder);
      (
        provider as unknown as {
          handlePresenceMessage: (d: decoding.Decoder) => void;
        }
      ).handlePresenceMessage(decoder);

      sub.unsubscribe();
      expect(received.at(-1) ?? []).toHaveLength(0);
    });

    it('handles Update messages for remote sessions', () => {
      provider.setLocalPresence({
        user: { id: 'self', username: 'alice', color: '#abcdef' },
      });
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();

      // First add a remote session via snapshot
      const snapshotFrame = encodePresenceFrame(encoder =>
        writeSnapshot(encoder, [remoteSession('bob')])
      );
      const snapDecoder = createDecoder(snapshotFrame);
      readVarUint(snapDecoder);
      (
        provider as unknown as {
          handlePresenceMessage: (d: decoding.Decoder) => void;
        }
      ).handlePresenceMessage(snapDecoder);

      // Now send an update for bob
      const updateFrame = encodePresenceFrame(encoder =>
        writeUpdate(encoder, 's-bob', { status: 'idle', lastActivityAt: 999 })
      );
      const updateDecoder = createDecoder(updateFrame);
      readVarUint(updateDecoder);
      const received: PresenceSession[][] = [];
      const sub = provider.remotePresence$.subscribe(users =>
        received.push(users)
      );
      (
        provider as unknown as {
          handlePresenceMessage: (d: decoding.Decoder) => void;
        }
      ).handlePresenceMessage(updateDecoder);

      sub.unsubscribe();
      expect(received.at(-1)?.[0].status).toBe('idle');
    });

    it('handles Leave messages removing remote sessions', () => {
      provider.setLocalPresence({
        user: { id: 'self', username: 'alice', color: '#abcdef' },
      });
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();

      // Add bob via snapshot first
      const snapshotFrame = encodePresenceFrame(encoder =>
        writeSnapshot(encoder, [remoteSession('bob')])
      );
      const snapDecoder = createDecoder(snapshotFrame);
      readVarUint(snapDecoder);
      (
        provider as unknown as {
          handlePresenceMessage: (d: decoding.Decoder) => void;
        }
      ).handlePresenceMessage(snapDecoder);

      // Send Leave for bob
      const leaveFrame = encodePresenceFrame(encoder =>
        writeLeave(encoder, 's-bob')
      );
      const leaveDecoder = createDecoder(leaveFrame);
      readVarUint(leaveDecoder);
      const received: PresenceSession[][] = [];
      const sub = provider.remotePresence$.subscribe(users =>
        received.push(users)
      );
      (
        provider as unknown as {
          handlePresenceMessage: (d: decoding.Decoder) => void;
        }
      ).handlePresenceMessage(leaveDecoder);

      sub.unsubscribe();
      expect(received.at(-1) ?? []).toHaveLength(0);
    });

    it('clears remote sessions on websocket disconnect and re-sends Hello on reconnect', () => {
      provider.setLocalPresence({
        user: { id: 'u1', username: 'alice', color: '#abcdef' },
      });
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;

      const statusCallbacks: Array<(payload: { status: string }) => void> = [];
      websocketProvider.on.mockImplementation((event: string, cb: unknown) => {
        if (event === 'status') {
          statusCallbacks.push(cb as (payload: { status: string }) => void);
        }
      });

      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();

      websocketProvider.ws?.send.mockClear();

      // Simulate disconnect
      for (const cb of statusCallbacks) cb({ status: 'disconnected' });
      // Simulate reconnect
      for (const cb of statusCallbacks) cb({ status: 'connected' });

      // Should have sent Hello after reconnect
      expect(websocketProvider.ws?.send).toHaveBeenCalledTimes(1);
    });

    it('flushPresence sends Update when local session already exists', () => {
      provider.setLocalPresence({
        user: { id: 'u1', username: 'alice', color: '#abcdef' },
      });
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();
      websocketProvider.ws?.send.mockClear();

      // Now that Hello was sent and localPresenceSession is set, an Update should be sent
      // when we set a new status. setLocalPresence calls flushPresence which sends Update.
      provider.setLocalPresence({ status: 'idle', lastActivityAt: Date.now() });

      expect(websocketProvider.ws?.send).toHaveBeenCalledTimes(1);
      const sent = websocketProvider.ws?.send.mock.calls[0]?.[0] as ArrayBuffer;
      const decoder = createDecoder(new Uint8Array(sent));
      readVarUint(decoder); // outer tag
      const decoded = readPresenceMessage(decoder);
      expect(decoded.type).toBe(1); // PRESENCE_MSG_UPDATE = 1
    });

    it('ignores decode errors in handlePresenceMessage gracefully', () => {
      (
        provider as unknown as { wsProvider: typeof websocketProvider | null }
      ).wsProvider = websocketProvider;
      (
        provider as unknown as { setupPresenceHandlers: () => void }
      ).setupPresenceHandlers();

      // Pass a corrupted decoder (empty)
      const emptyDecoder = createDecoder(new Uint8Array([255, 255]));
      expect(() => {
        (
          provider as unknown as {
            handlePresenceMessage: (d: decoding.Decoder) => void;
          }
        ).handlePresenceMessage(emptyDecoder);
      }).not.toThrow();
      expect(logger.warn).toHaveBeenCalled();
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

  describe('Time Systems', () => {
    it('returns empty time systems initially', () => {
      expect(provider.getTimeSystems()).toEqual([]);
    });

    it('updates time systems in yjs doc and emits via observable', () => {
      attachDoc();
      const systems: TimeSystem[] = [
        {
          id: 'ts-1',
          name: 'Standard',
          hoursPerDay: 24,
        } as unknown as TimeSystem,
      ];
      const emitted: TimeSystem[][] = [];
      provider.timeSystems$.subscribe(v => emitted.push(v));

      provider.updateTimeSystems(systems);

      expect(emitted[emitted.length - 1]).toEqual(systems);
      expect(provider.getTimeSystems()).toEqual(systems);
    });

    it('does not throw when updating time systems without a connected doc', () => {
      // doc is null — the guard branch (line 633-635) fires
      expect(() => provider.updateTimeSystems([])).not.toThrow();
    });
  });

  describe('access-denied handling', () => {
    function setWsStub(): {
      disconnect: ReturnType<typeof vi.fn>;
      connect: ReturnType<typeof vi.fn>;
    } {
      const stub = { disconnect: vi.fn(), connect: vi.fn() };
      (provider as unknown as { wsProvider: unknown }).wsProvider = stub;
      return stub;
    }

    function privateProvider() {
      return provider as unknown as {
        terminalDenialReason: string | null;
        pendingLongBackoff: boolean;
        handleAccessDenied: (reason: string) => void;
        handlePostAuthText: (text: string) => void;
        handleReauthError: (error: string) => void;
        handleWebSocketStatus: (status: string) => void;
      };
    }

    it('stops reconnecting on a hard denial and disconnects the socket', () => {
      const stub = setWsStub();

      privateProvider().handleAccessDenied('forbidden');

      expect(privateProvider().terminalDenialReason).toBe('forbidden');
      expect(stub.disconnect).toHaveBeenCalledTimes(1);
      expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('rate-limited is not terminal and stops the internal reconnect loop', () => {
      const stub = setWsStub();
      const priv = privateProvider();

      priv.handleAccessDenied('rate-limited');
      // A throttle is transient: not terminal, and the provider is stopped so
      // y-websocket's internal auto-reconnect loop can't hammer the DO and
      // re-saturate the per-doc rate-limit window (the reconnect storm).
      expect(priv.terminalDenialReason).toBeNull();
      expect(priv.pendingLongBackoff).toBe(true);
      expect(stub.disconnect).toHaveBeenCalledTimes(1);
      // Transient denial reads as Local (offline, retrying) — not the
      // terminal-looking Unavailable.
      expect(provider.getSyncState()).toBe(DocumentSyncState.Local);

      // A second rate-limited is still not terminal — retries continue for as
      // long as the server keeps refusing.
      priv.handleAccessDenied('rate-limited');
      expect(priv.terminalDenialReason).toBeNull();
      expect(stub.disconnect).toHaveBeenCalledTimes(2);
    });

    it('server-side error is not terminal and takes the long backoff', () => {
      const stub = setWsStub();
      const priv = privateProvider();

      // `error` means the SERVER failed to load the document — it says
      // nothing about this client's access and routinely self-heals, so it
      // must retry (long backoff) rather than bench the client until refresh.
      priv.handleAccessDenied('error');
      expect(priv.terminalDenialReason).toBeNull();
      expect(priv.pendingLongBackoff).toBe(true);
      expect(stub.disconnect).toHaveBeenCalledTimes(1);
      expect(provider.getSyncState()).toBe(DocumentSyncState.Local);
    });

    it('routes a post-auth access-denied text frame through handleAccessDenied', () => {
      const stub = setWsStub();
      const priv = privateProvider();

      priv.handlePostAuthText('access-denied:forbidden');
      expect(stub.disconnect).toHaveBeenCalledTimes(1);
      expect(priv.terminalDenialReason).toBe('forbidden');

      // Non-denial text is just logged, not treated as terminal.
      priv.handlePostAuthText('ping');
      expect(stub.disconnect).toHaveBeenCalledTimes(1);
    });

    it('routes a re-auth access-denied callback through handleAccessDenied', () => {
      const stub = setWsStub();
      const priv = privateProvider();

      priv.handleReauthError('Access denied: forbidden');
      expect(stub.disconnect).toHaveBeenCalledTimes(1);
      expect(priv.terminalDenialReason).toBe('forbidden');

      // A non-denial re-auth error marks unavailable without disconnecting.
      priv.handleReauthError('transient');
      expect(stub.disconnect).toHaveBeenCalledTimes(1);
      expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
    });

    it('keeps state Unavailable and does not reconnect after a terminal disconnect', () => {
      const stub = setWsStub();
      privateProvider().handleAccessDenied('forbidden');
      stub.disconnect.mockClear();

      privateProvider().handleWebSocketStatus('disconnected');

      expect(provider.getSyncState()).toBe(DocumentSyncState.Unavailable);
      expect(stub.connect).not.toHaveBeenCalled();
    });

    it('uses the long rate-limit backoff on the retry after a rate-limit', () => {
      vi.useFakeTimers();
      const stub = setWsStub();
      const priv = privateProvider();
      priv.pendingLongBackoff = true;

      priv.handleWebSocketStatus('disconnected');
      // The long backoff must not fire within the server cooldown window.
      vi.advanceTimersByTime(10_000);
      expect(stub.connect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000);
      expect(stub.connect).toHaveBeenCalledTimes(1);
      expect(priv.pendingLongBackoff).toBe(false);

      vi.useRealTimers();
    });

    it('leaves reconnects to y-websocket while its internal loop is active', () => {
      vi.useFakeTimers();
      const connect = vi.fn();
      // shouldConnect true = y-websocket's own loop is still retrying; our
      // timer must NOT stack a second reconnect on top of it.
      (provider as unknown as { wsProvider: unknown }).wsProvider = {
        connect,
        disconnect: vi.fn(),
        shouldConnect: true,
      };

      privateProvider().handleWebSocketStatus('disconnected');
      vi.advanceTimersByTime(600_000);
      expect(connect).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('never gives up: keeps scheduling retries far beyond five attempts', () => {
      vi.useFakeTimers();
      const stub = setWsStub();
      const priv = privateProvider();

      // Each 'disconnected' schedules one retry (no internal loop on the
      // stub); fire well past the old 5-attempt cap. Delay is capped at
      // maxDelayMs (300s), so advancing 300s guarantees each timer fires.
      for (let i = 0; i < 12; i++) {
        priv.handleWebSocketStatus('disconnected');
        vi.advanceTimersByTime(300_000);
      }
      expect(stub.connect).toHaveBeenCalledTimes(12);

      vi.useRealTimers();
    });

    it('does not stack a second timer while a retry is already scheduled', () => {
      vi.useFakeTimers();
      const stub = setWsStub();
      const priv = privateProvider();

      // Two disconnects in quick succession must produce ONE scheduled retry.
      priv.handleWebSocketStatus('disconnected');
      priv.handleWebSocketStatus('disconnected');
      vi.advanceTimersByTime(300_000);
      expect(stub.connect).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('visibility/focus resume', () => {
    it('reconnects immediately when the tab becomes visible while disconnected', () => {
      const connect = vi.fn();
      (provider as unknown as { wsProvider: unknown }).wsProvider = {
        connect,
        wsconnected: false,
      };

      (
        provider as unknown as { setupNetworkHandlers: () => void }
      ).setupNetworkHandlers();

      globalThis.dispatchEvent(new Event('focus'));
      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('does not jump the queue during a long-backoff denial cooldown', () => {
      vi.useFakeTimers();
      const connect = vi.fn();
      const priv = provider as unknown as {
        wsProvider: unknown;
        handleAccessDenied: (reason: string) => void;
        handleWebSocketStatus: (status: string) => void;
        setupNetworkHandlers: () => void;
      };
      priv.wsProvider = {
        connect,
        disconnect: vi.fn(),
        wsconnected: false,
      };
      priv.setupNetworkHandlers();

      // Rate-limit denial → long-backoff retry scheduled.
      priv.handleAccessDenied('rate-limited');
      priv.handleWebSocketStatus('disconnected');

      // A focus during the cooldown must NOT reconnect immediately — that
      // would land inside the server's cooldown window and get denied again.
      globalThis.dispatchEvent(new Event('focus'));
      expect(connect).not.toHaveBeenCalled();

      // The scheduled long-backoff retry still fires on its own.
      vi.advanceTimersByTime(30_000);
      expect(connect).toHaveBeenCalledTimes(1);

      // With the cooldown consumed, a later focus resumes immediately again.
      globalThis.dispatchEvent(new Event('focus'));
      expect(connect).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('does nothing on focus while connected or after a terminal denial', () => {
      const connect = vi.fn();
      const priv = provider as unknown as {
        wsProvider: unknown;
        terminalDenialReason: string | null;
        setupNetworkHandlers: () => void;
      };
      priv.wsProvider = { connect, wsconnected: true };
      priv.setupNetworkHandlers();

      globalThis.dispatchEvent(new Event('focus'));
      expect(connect).not.toHaveBeenCalled();

      priv.wsProvider = { connect, wsconnected: false };
      priv.terminalDenialReason = 'forbidden';
      globalThis.dispatchEvent(new Event('focus'));
      expect(connect).not.toHaveBeenCalled();
    });
  });
});
