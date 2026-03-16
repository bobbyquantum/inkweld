import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Element, ElementType } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { type ElementRelationship } from '../../components/element-ref/element-ref.model';
import {
  type ElementTag,
  type TagDefinition,
} from '../../components/tags/tag.model';
import { DocumentSyncState } from '../../models/document-sync-state';
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

vi.mock('./authenticated-websocket-provider', () => websocketModuleMocks);

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
      isBuiltIn: false,
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
});
