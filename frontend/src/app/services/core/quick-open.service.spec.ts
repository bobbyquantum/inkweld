import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Element, ElementType, Project } from '@inkweld/index';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectStateService } from '../project/project-state.service';
import { RecentFilesService } from '../project/recent-files.service';
import { QuickOpenService } from './quick-open.service';

describe('QuickOpenService', () => {
  let service: QuickOpenService;
  let mockDialog: { open: ReturnType<typeof vi.fn> };
  let mockProjectState: {
    project: ReturnType<typeof vi.fn>;
    elements: ReturnType<typeof vi.fn>;
  };
  let mockRecentFilesService: {
    getRecentFilesForProject: ReturnType<typeof vi.fn>;
  };
  let mockDialogRef: {
    close: ReturnType<typeof vi.fn>;
    afterClosed: ReturnType<typeof vi.fn>;
  };
  let afterClosedSubject: Subject<unknown>;

  // Mock project and elements
  const mockProject: Project = {
    id: 'project-1',
    title: 'Test Project',
    slug: 'test-project',
    username: 'testuser',
  } as Project;

  const mockElements: Element[] = [
    {
      id: 'folder-1',
      name: 'Chapter 1',
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
      name: 'The Beginning',
      type: ElementType.Item,
      level: 1,
      parentId: 'folder-1',
      expandable: false,
      order: 1,
      version: 1,
      metadata: {},
    },
    {
      id: 'wb-1',
      name: 'Main Character',
      type: ElementType.Worldbuilding,
      level: 0,
      parentId: null,
      expandable: false,
      order: 2,
      version: 1,
      schemaId: 'character-v1',
      metadata: {},
    },
    {
      id: 'doc-3',
      name: 'Final Chapter',
      type: ElementType.Item,
      level: 0,
      parentId: null,
      expandable: false,
      order: 3,
      version: 1,
      metadata: {},
    },
  ];

  beforeEach(() => {
    // Create a subject that we can control when afterClosed emits
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

    mockRecentFilesService = {
      getRecentFilesForProject: vi
        .fn()
        .mockReturnValue([
          { id: 'doc-1', name: 'Introduction', timestamp: Date.now() },
        ]),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        QuickOpenService,
        { provide: MatDialog, useValue: mockDialog },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: RecentFilesService, useValue: mockRecentFilesService },
      ],
    });

    service = TestBed.inject(QuickOpenService);
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should initialize keyboard listener', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      service.initialize();
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        true
      );
    });

    it('should remove keyboard listener on destroy', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      service.initialize();
      service.destroy();
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        true
      );
    });

    it('should not initialize twice', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      service.initialize();
      const firstCallCount = addEventListenerSpy.mock.calls.filter(
        call => call[0] === 'keydown' && call[2] === true
      ).length;
      service.initialize();
      const secondCallCount = addEventListenerSpy.mock.calls.filter(
        call => call[0] === 'keydown' && call[2] === true
      ).length;
      // Should not have added another listener
      expect(secondCallCount).toBe(firstCallCount);
    });
  });

  describe('dialog management', () => {
    it('should open dialog', () => {
      service.open();
      expect(mockDialog.open).toHaveBeenCalled();
      expect(service.isOpen()).toBe(true);
    });

    it('should not open dialog if already open', () => {
      service.open();
      expect(service.isOpen()).toBe(true);
      service.open();
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
    });

    it('should close dialog', () => {
      service.open();
      service.close();
      expect(mockDialogRef.close).toHaveBeenCalled();
    });

    it('should set isOpen to false when dialog closes', () => {
      service.open();
      expect(service.isOpen()).toBe(true);
      // Simulate the dialog closing
      afterClosedSubject.next(undefined);
      afterClosedSubject.complete();
      expect(service.isOpen()).toBe(false);
    });
  });

  describe('search', () => {
    it('should return recent files when query is empty', () => {
      const results = service.search('');
      // Should include recent file first
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].isRecent).toBe(true);
    });

    it('should filter out folders from results', () => {
      const results = service.search('Chapter');
      // Chapter 1 is a folder, should not appear
      expect(results.find(r => r.element.id === 'folder-1')).toBeUndefined();
    });

    it('should find exact matches', () => {
      const results = service.search('Introduction');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].element.name).toBe('Introduction');
    });

    it('should perform fuzzy matching', () => {
      const results = service.search('intro');
      expect(results.find(r => r.element.name === 'Introduction')).toBeTruthy();
    });

    it('should match partial strings', () => {
      const results = service.search('begin');
      expect(
        results.find(r => r.element.name === 'The Beginning')
      ).toBeTruthy();
    });

    it('should include match positions for highlighting', () => {
      const results = service.search('intro');
      const introResult = results.find(r => r.element.name === 'Introduction');
      expect(introResult).toBeTruthy();
      expect(introResult!.matchPositions.length).toBeGreaterThan(0);
    });

    it('should build element path correctly', () => {
      const results = service.search('Introduction');
      const introResult = results.find(r => r.element.name === 'Introduction');
      expect(introResult).toBeTruthy();
      expect(introResult!.path).toBe('Chapter 1');
    });

    it('should return empty array when no project is loaded', () => {
      mockProjectState.project.mockReturnValue(undefined);
      const results = service.search('test');
      expect(results).toEqual([]);
    });

    it('should return empty array when no elements exist', () => {
      mockProjectState.elements.mockReturnValue([]);
      const results = service.search('test');
      expect(results).toEqual([]);
    });

    it('should prioritize recent files in scoring', () => {
      const results = service.search('tion'); // matches Introduction and potentially others
      const introResult = results.find(r => r.element.name === 'Introduction');
      expect(introResult).toBeTruthy();
      expect(introResult!.isRecent).toBe(true);
      // Recent files should have a higher score
      expect(introResult!.score).toBeGreaterThan(50);
    });

    it('should include worldbuilding elements', () => {
      const results = service.search('Character');
      expect(
        results.find(r => r.element.name === 'Main Character')
      ).toBeTruthy();
    });

    it('should limit results to 50', () => {
      // Create many elements
      const manyElements: Element[] = [];
      for (let i = 0; i < 100; i++) {
        manyElements.push({
          id: `doc-${i}`,
          name: `Document ${i}`,
          type: ElementType.Item,
          level: 0,
          parentId: null,
          expandable: false,
          order: i,
          version: 1,
          metadata: {},
        });
      }
      mockProjectState.elements.mockReturnValue(manyElements);

      const results = service.search('Document');
      expect(results.length).toBeLessThanOrEqual(50);
    });
  });

  describe('fuzzy matching', () => {
    it('should match characters in order', () => {
      const results = service.search('intr');
      expect(results.find(r => r.element.name === 'Introduction')).toBeTruthy();
    });

    it('should not match when characters are out of order', () => {
      const results = service.search('rtni');
      expect(
        results.find(r => r.element.name === 'Introduction')
      ).toBeUndefined();
    });

    it('should boost score for word boundary matches', () => {
      // "Main" starts with M which is a word boundary
      const resultsMain = service.search('main');
      const resultsAin = service.search('ain');

      const mainResult = resultsMain.find(
        r => r.element.name === 'Main Character'
      );
      const ainResult = resultsAin.find(
        r => r.element.name === 'Main Character'
      );

      expect(mainResult).toBeTruthy();
      expect(ainResult).toBeTruthy();
      // Word boundary match should score higher
      expect(mainResult!.score).toBeGreaterThan(ainResult!.score);
    });

    it('should boost score for exact matches', () => {
      const results = service.search('Final Chapter');
      const exactMatch = results.find(r => r.element.name === 'Final Chapter');
      expect(exactMatch).toBeTruthy();
      expect(exactMatch!.score).toBeGreaterThan(100);
    });
  });
});
