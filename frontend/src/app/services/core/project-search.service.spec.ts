import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Element, ElementType, Project } from '@inkweld/index';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentService } from '../project/document.service';
import { ProjectStateService } from '../project/project-state.service';
import {
  ProjectSearchProgress,
  ProjectSearchService,
} from './project-search.service';

describe('ProjectSearchService', () => {
  let service: ProjectSearchService;
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockProjectState: {
    project: ReturnType<typeof vi.fn>;
    elements: ReturnType<typeof vi.fn>;
  };
  let mockDocumentService: {
    getDocumentContent: ReturnType<
      typeof vi.fn<(documentId: string) => Promise<unknown>>
    >;
  };
  let mockDialogRef: {
    close: ReturnType<typeof vi.fn>;
    afterClosed: ReturnType<typeof vi.fn>;
  };
  let afterClosedSubject: Subject<unknown>;

  const mockProject: Project = {
    id: 'project-1',
    title: 'Test Project',
    slug: 'test-project',
    username: 'testuser',
  } as Project;

  const mockElements: Element[] = [
    {
      id: 'folder-1',
      name: 'Chapter One',
      type: ElementType.Folder,
      level: 0,
      parentId: null,
      expandable: true,
      order: 0,
      version: 1,
      metadata: {},
    },
    {
      id: 'doc-1',
      name: 'Introduction',
      type: ElementType.Item,
      level: 1,
      parentId: 'folder-1',
      expandable: false,
      order: 0,
      version: 1,
      metadata: {},
    },
    {
      id: 'doc-2',
      name: 'Action Scene',
      type: ElementType.Item,
      level: 0,
      parentId: null,
      expandable: false,
      order: 1,
      version: 1,
      metadata: {},
    },
    {
      id: 'wb-1',
      name: 'Hero Character',
      type: ElementType.Worldbuilding,
      level: 0,
      parentId: null,
      expandable: false,
      order: 2,
      version: 1,
      metadata: {},
    },
  ];

  /** Simple ProseMirror paragraph node factory */
  const makeDoc = (...texts: string[]) =>
    texts.map(text => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    }));

  beforeEach(() => {
    afterClosedSubject = new Subject<unknown>();

    mockDialogRef = {
      close: vi.fn(),
      afterClosed: vi.fn().mockReturnValue(afterClosedSubject.asObservable()),
    };

    mockDialog = {
      open: vi.fn().mockReturnValue(mockDialogRef),
    };

    mockProjectState = {
      project: vi.fn().mockReturnValue(mockProject),
      elements: vi.fn().mockReturnValue(mockElements),
    };

    mockDocumentService = {
      getDocumentContent: vi
        .fn<(documentId: string) => Promise<unknown>>()
        .mockResolvedValue([]),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ProjectSearchService,
        { provide: MatDialog, useValue: mockDialog },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: DocumentService, useValue: mockDocumentService },
      ],
    });

    service = TestBed.inject(ProjectSearchService);
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should register a keydown listener on initialize()', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      service.initialize();
      expect(addSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        true
      );
    });

    it('should not register a second listener when called twice', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      service.initialize();
      const countAfterFirst = addSpy.mock.calls.filter(
        call => call[0] === 'keydown' && call[2] === true
      ).length;
      service.initialize();
      const countAfterSecond = addSpy.mock.calls.filter(
        call => call[0] === 'keydown' && call[2] === true
      ).length;
      expect(countAfterSecond).toBe(countAfterFirst);
    });

    it('should remove the keydown listener on destroy()', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      service.initialize();
      service.destroy();
      expect(removeSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        true
      );
    });

    it('should not throw when destroy() is called before initialize()', () => {
      expect(() => service.destroy()).not.toThrow();
    });
  });

  describe('dialog management', () => {
    it('should open the dialog and set isOpen to true', () => {
      service.open();
      expect(mockDialog.open).toHaveBeenCalledOnce();
      expect(service.isOpen()).toBe(true);
    });

    it('should not open the dialog if it is already open', () => {
      service.open();
      service.open();
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
    });

    it('should set isOpen to false when the dialog is closed externally', () => {
      service.open();
      expect(service.isOpen()).toBe(true);

      afterClosedSubject.next(undefined);
      afterClosedSubject.complete();

      expect(service.isOpen()).toBe(false);
    });

    it('should close the dialog via close()', () => {
      service.open();
      service.close();
      expect(mockDialogRef.close).toHaveBeenCalledOnce();
    });

    it('should not throw when close() is called without an open dialog', () => {
      expect(() => service.close()).not.toThrow();
    });
  });

  describe('search()', () => {
    const collectProgress = async (
      query: string,
      elements = mockElements,
      getContentFn = mockDocumentService.getDocumentContent
    ): Promise<ProjectSearchProgress[]> => {
      mockProjectState.elements.mockReturnValue(elements);
      mockDocumentService.getDocumentContent = getContentFn;

      const updates: ProjectSearchProgress[] = [];
      await service.search(
        query,
        p => updates.push(p),
        new AbortController().signal
      );
      return updates;
    };

    it('performs text search even for single-character query', async () => {
      const updates = await collectProgress('a');
      // Single-char query now runs a normal text search rather than early-exit
      expect(updates.length).toBeGreaterThan(0);
      const last = updates[updates.length - 1];
      expect(last.done).toBe(true);
    });

    it('returns all non-folder elements in browse mode for empty query', async () => {
      const updates = await collectProgress('');
      expect(updates).toHaveLength(1);
      expect(updates[0].done).toBe(true);
      expect(updates[0].results.length).toBeGreaterThan(0);
    });

    it('emits done immediately when no project is loaded', async () => {
      mockProjectState.project.mockReturnValue(null);
      const updates = await collectProgress('hello');
      expect(updates[0].done).toBe(true);
      expect(updates[0].results).toEqual([]);
    });

    it('skips folder elements', async () => {
      // Only doc-1, doc-2, wb-1 should be scanned (not folder-1)
      const docContents: Record<string, unknown[]> = {
        'testuser:test-project:doc-1': makeDoc('The hero entered the room.'),
        'testuser:test-project:doc-2': makeDoc('An action scene.'),
        'testuser:test-project:wb-1': makeDoc('Hero description.'),
      };
      mockDocumentService.getDocumentContent.mockImplementation((id: string) =>
        Promise.resolve(docContents[id] ?? [])
      );

      await service.search(
        'hero',
        _p => undefined,
        new AbortController().signal
      );

      // folder-1 must never be queried
      const calledIds = mockDocumentService.getDocumentContent.mock.calls.map(
        (call: unknown[]) => call[0]
      );
      expect(calledIds).not.toContain('testuser:test-project:folder-1');
    });

    it('returns a result when query matches document content', async () => {
      mockDocumentService.getDocumentContent.mockImplementation(
        (id: string) => {
          if (id === 'testuser:test-project:doc-1') {
            return Promise.resolve(makeDoc('The hero defeated the dragon.'));
          }
          return Promise.resolve([]);
        }
      );

      const updates = await collectProgress('hero');
      const final = updates[updates.length - 1];

      expect(final.done).toBe(true);
      expect(final.results).toHaveLength(1);
      expect(final.results[0].element.id).toBe('doc-1');
      expect(final.results[0].matchCount).toBe(1);
    });

    it('counts multiple matches within the same document', async () => {
      mockDocumentService.getDocumentContent.mockImplementation(
        (id: string) => {
          if (id === 'testuser:test-project:doc-1') {
            return Promise.resolve(
              makeDoc('The hero appeared. The hero left. The hero returned.')
            );
          }
          return Promise.resolve([]);
        }
      );

      const updates = await collectProgress('hero');
      const final = updates[updates.length - 1];
      expect(final.results[0].matchCount).toBe(3);
    });

    it('limits snippets to 3 per result', async () => {
      mockDocumentService.getDocumentContent.mockImplementation(
        (id: string) => {
          if (id === 'testuser:test-project:doc-1') {
            return Promise.resolve(
              makeDoc('one hero. two hero. three hero. four hero. five hero.')
            );
          }
          return Promise.resolve([]);
        }
      );

      const updates = await collectProgress('hero');
      const final = updates[updates.length - 1];
      expect(final.results[0].snippets.length).toBeLessThanOrEqual(3);
    });

    it('includes correct snippet shape (before/match/after)', async () => {
      mockDocumentService.getDocumentContent.mockImplementation(
        (id: string) => {
          if (id === 'testuser:test-project:doc-1') {
            return Promise.resolve(makeDoc('The hero saved the day.'));
          }
          return Promise.resolve([]);
        }
      );

      const updates = await collectProgress('hero');
      const snippet = updates[updates.length - 1].results[0].snippets[0];

      expect(snippet.match.toLowerCase()).toBe('hero');
      expect(typeof snippet.before).toBe('string');
      expect(typeof snippet.after).toBe('string');
    });

    it('is case-insensitive', async () => {
      mockDocumentService.getDocumentContent.mockImplementation(
        (id: string) => {
          if (id === 'testuser:test-project:doc-1') {
            return Promise.resolve(makeDoc('HERO stood tall.'));
          }
          return Promise.resolve([]);
        }
      );

      const updates = await collectProgress('hero');
      expect(updates[updates.length - 1].results).toHaveLength(1);
    });

    it('builds correct breadcrumb path for a nested element', async () => {
      mockDocumentService.getDocumentContent.mockImplementation(
        (id: string) => {
          if (id === 'testuser:test-project:doc-1') {
            return Promise.resolve(makeDoc('The hero of the story.'));
          }
          return Promise.resolve([]);
        }
      );

      const updates = await collectProgress('hero');
      const result = updates[updates.length - 1].results[0];
      // doc-1 is a child of folder-1 ("Chapter One")
      expect(result.path).toBe('Chapter One');
    });

    it('builds empty path for a root-level element', async () => {
      mockDocumentService.getDocumentContent.mockImplementation(
        (id: string) => {
          if (id === 'testuser:test-project:doc-2') {
            return Promise.resolve(makeDoc('A great adventure.'));
          }
          return Promise.resolve([]);
        }
      );

      const updates = await collectProgress('adventure');
      const result = updates[updates.length - 1].results.find(
        r => r.element.id === 'doc-2'
      );
      expect(result).toBeTruthy();
      expect(result!.path).toBe('');
    });

    it('emits incremental progress updates', async () => {
      mockDocumentService.getDocumentContent.mockResolvedValue([]);
      const updates: ProjectSearchProgress[] = [];
      await service.search(
        'anything',
        p => updates.push(p),
        new AbortController().signal
      );

      // Should have an initial update + one per non-folder element + final
      // At minimum: initial + final
      expect(updates.length).toBeGreaterThan(1);
    });

    it('aborts scan when AbortSignal fires', async () => {
      const controller = new AbortController();
      let callCount = 0;

      mockDocumentService.getDocumentContent.mockImplementation(
        (_id: string) => {
          callCount++;
          // Abort after the first document is read
          if (callCount === 1) controller.abort();
          return Promise.resolve([]);
        }
      );

      const updates: ProjectSearchProgress[] = [];
      await service.search('hero', p => updates.push(p), controller.signal);

      // Should have stopped early — not all 3 documents processed
      expect(callCount).toBeLessThan(3);
    });

    it('does not emit final done update when aborted', async () => {
      const controller = new AbortController();
      controller.abort(); // abort immediately

      const updates: ProjectSearchProgress[] = [];
      await service.search('match', p => updates.push(p), controller.signal);

      const doneUpdates = updates.filter(u => u.done);
      // When aborted right away the initial onProgress (done:false) may not fire
      // and no final done:true should be emitted
      expect(doneUpdates).toHaveLength(0);
    });

    it('skips documents that throw during content retrieval', async () => {
      mockDocumentService.getDocumentContent.mockImplementation(
        (id: string) => {
          if (id === 'testuser:test-project:doc-1') {
            return Promise.reject(new Error('IndexedDB read error'));
          }
          if (id === 'testuser:test-project:doc-2') {
            return Promise.resolve(makeDoc('The hero searched.'));
          }
          return Promise.resolve([]);
        }
      );

      const updates = await collectProgress('hero');
      const final = updates[updates.length - 1];
      expect(final.done).toBe(true);
      // doc-1 errored but doc-2 should still produce a result
      expect(final.results.some(r => r.element.id === 'doc-2')).toBe(true);
    });
  });
});
