import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type Project } from '@inkweld/index';
import { StorageContextService } from '@services/core/storage-context.service';
import { LocalProjectElementsService } from '@services/local/local-project-elements.service';
import { LiveDocumentRegistryService } from '@services/project/live-document-registry.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { YDocAccessService } from './ydoc-access.service';

describe('YDocAccessService', () => {
  let service: YDocAccessService;
  let project: ReturnType<typeof signal<Project | undefined>>;
  let liveElements: Y.Doc;
  let localElements: { getYjsDocument: ReturnType<typeof vi.fn> };
  let documentService: {
    getConnectedYDoc: ReturnType<typeof vi.fn>;
    hasLocalContent: ReturnType<typeof vi.fn>;
  };
  let worldbuilding: { getYDoc: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    project = signal<Project | undefined>(undefined);
    liveElements = new Y.Doc();
    localElements = {
      getYjsDocument: vi.fn().mockResolvedValue(liveElements),
    };
    documentService = {
      getConnectedYDoc: vi.fn().mockReturnValue(null),
      hasLocalContent: vi.fn().mockResolvedValue(false),
    };
    worldbuilding = { getYDoc: vi.fn().mockReturnValue(null) };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        YDocAccessService,
        {
          provide: StorageContextService,
          useValue: { prefixDocumentId: (id: string) => `cloud-x:${id}` },
        },
        { provide: LocalProjectElementsService, useValue: localElements },
        { provide: LiveDocumentRegistryService, useValue: documentService },
        { provide: WorldbuildingService, useValue: worldbuilding },
        { provide: ProjectStateService, useValue: { project } },
      ],
    });
    service = TestBed.inject(YDocAccessService);
  });

  it('builds the prefixed elements doc id', () => {
    expect(service.elementsDocId('bobby', 'novel')).toBe(
      'cloud-x:bobby:novel:elements'
    );
  });

  it('delegates existence checks to the live document registry', async () => {
    documentService.hasLocalContent.mockResolvedValue(true);
    expect(await service.exists('bobby:novel:e1')).toBe(true);
    expect(documentService.hasLocalContent).toHaveBeenCalledWith(
      'bobby:novel:e1'
    );
  });

  it('uses the live elements doc only for the open project', async () => {
    project.set({ username: 'bobby', slug: 'novel' } as Project);

    const open = await service.acquireElements('bobby', 'novel');
    expect(open.live).toBe(true);
    expect(open.doc).toBe(liveElements);
    await open.release();
    expect(liveElements.isDestroyed).toBe(false);

    const other = await service.acquireElements('bobby', 'other');
    expect(other.live).toBe(false);
    expect(other.doc).not.toBe(liveElements);
    expect(localElements.getYjsDocument).toHaveBeenCalledTimes(1);
    await other.flush();
    await other.release();
    expect(other.doc.isDestroyed).toBe(true);
  });

  it('prefers a connected document doc and falls back to headless', async () => {
    const live = new Y.Doc();
    documentService.getConnectedYDoc.mockReturnValueOnce(live);

    const connected = await service.acquireDocument('bobby:novel:e1');
    expect(connected.live).toBe(true);
    expect(connected.doc).toBe(live);

    const headless = await service.acquireDocument('bobby:novel:e2');
    expect(headless.live).toBe(false);
    headless.doc.getText('t').insert(0, 'x');
    await headless.flush();
    await headless.release();
    expect(headless.doc.isDestroyed).toBe(true);
  });

  it('prefers a connected worldbuilding doc and falls back to headless', async () => {
    const live = new Y.Doc();
    worldbuilding.getYDoc.mockReturnValueOnce(live);

    const connected = await service.acquireWorldbuilding(
      'bobby',
      'novel',
      'w1',
      'worldbuilding:bobby:novel:w1'
    );
    expect(connected.live).toBe(true);
    expect(worldbuilding.getYDoc).toHaveBeenCalledWith('w1', 'bobby', 'novel');

    const headless = await service.acquireWorldbuilding(
      'bobby',
      'novel',
      'w2',
      'worldbuilding:bobby:novel:w2'
    );
    expect(headless.live).toBe(false);
    await headless.release();
  });
});
