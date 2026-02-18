import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Element, ElementType } from '@inkweld/index';
import { MockedObject, vi } from 'vitest';

import { FindInDocumentService } from '../../services/core/find-in-document.service';
import {
  ProjectSearchProgress,
  ProjectSearchResult,
  ProjectSearchService,
} from '../../services/core/project-search.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { ProjectSearchDialogComponent } from './project-search-dialog.component';

const makeElement = (
  id: string,
  name: string,
  type = ElementType.Item
): Element => ({
  id,
  name,
  type,
  parentId: null,
  order: 0,
  level: 0,
  expandable: false,
  version: 1,
  metadata: {},
});

const makeResult = (id: string, name: string): ProjectSearchResult => ({
  element: makeElement(id, name),
  documentId: `user:proj:${id}`,
  path: '',
  snippets: [{ before: 'foo ', match: 'bar', after: ' baz' }],
  matchCount: 1,
});

describe('ProjectSearchDialogComponent', () => {
  let component: ProjectSearchDialogComponent;
  let fixture: ComponentFixture<ProjectSearchDialogComponent>;
  let mockDialogRef: MockedObject<MatDialogRef<ProjectSearchDialogComponent>>;
  let mockProjectSearchService: MockedObject<ProjectSearchService>;
  let mockProjectState: MockedObject<ProjectStateService>;
  let mockFindInDocument: MockedObject<FindInDocumentService>;

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    } as Partial<
      MockedObject<MatDialogRef<ProjectSearchDialogComponent>>
    > as MockedObject<MatDialogRef<ProjectSearchDialogComponent>>;

    mockProjectSearchService = {
      search: vi
        .fn()
        .mockResolvedValue(
          undefined
        ) as MockedObject<ProjectSearchService>['search'],
    } as Partial<
      MockedObject<ProjectSearchService>
    > as MockedObject<ProjectSearchService>;

    mockProjectState = {
      openDocument: vi.fn(),
    } as Partial<
      MockedObject<ProjectStateService>
    > as MockedObject<ProjectStateService>;

    mockFindInDocument = {
      open: vi.fn(),
      search: vi.fn(),
    } as Partial<
      MockedObject<FindInDocumentService>
    > as MockedObject<FindInDocumentService>;

    await TestBed.configureTestingModule({
      imports: [ProjectSearchDialogComponent, MatDialogModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: ProjectSearchService, useValue: mockProjectSearchService },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: FindInDocumentService, useValue: mockFindInDocument },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectSearchDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial state', () => {
    it('should have empty search query', () => {
      expect(component.searchQuery()).toBe('');
    });

    it('should not be searching', () => {
      expect(component.isSearching()).toBe(false);
    });

    it('should have no results', () => {
      expect(component.results).toHaveLength(0);
    });

    it('hasQuery should be false when query is empty', () => {
      expect(component.hasQuery).toBe(false);
    });
  });

  describe('onSearchChange', () => {
    it('should update searchQuery signal', () => {
      component.onSearchChange('hello world');
      expect(component.searchQuery()).toBe('hello world');
    });

    it('should clear results and abort search when query is too short', () => {
      component.onSearchChange('x');
      expect(component.isSearching()).toBe(false);
      expect(component.results).toHaveLength(0);
    });

    it('should mark hasQuery true for query >= 2 chars', () => {
      component.onSearchChange('ab');
      expect(component.hasQuery).toBe(true);
    });

    it('hasQuery should be false for whitespace-only query', () => {
      component.onSearchChange('  ');
      expect(component.hasQuery).toBe(false);
    });
  });

  describe('keyboard navigation', () => {
    const twoResults: ProjectSearchProgress = {
      scanned: 1,
      total: 1,
      results: [makeResult('a', 'Alpha'), makeResult('b', 'Beta')],
      done: true,
    };

    beforeEach(() => {
      component.progress.set(twoResults);
      component.selectedIndex.set(0);
    });

    it('ArrowDown increments selectedIndex', () => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      document.dispatchEvent(event);
      expect(component.selectedIndex()).toBe(1);
    });

    it('ArrowDown does not exceed last result', () => {
      component.selectedIndex.set(1);
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      document.dispatchEvent(event);
      expect(component.selectedIndex()).toBe(1);
    });

    it('ArrowUp decrements selectedIndex', () => {
      component.selectedIndex.set(1);
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      document.dispatchEvent(event);
      expect(component.selectedIndex()).toBe(0);
    });

    it('ArrowUp does not go below 0', () => {
      component.selectedIndex.set(0);
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      document.dispatchEvent(event);
      expect(component.selectedIndex()).toBe(0);
    });

    it('Escape closes the dialog', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);
      expect(mockDialogRef.close).toHaveBeenCalled();
    });

    it('Enter calls selectResult for current selection', () => {
      component.selectedIndex.set(0);
      const spy = vi.spyOn(component, 'selectResult');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      document.dispatchEvent(event);
      expect(spy).toHaveBeenCalledWith(twoResults.results[0]);
    });
  });

  describe('onResultMouseEnter', () => {
    it('should NOT change selectedIndex before mouse has moved (prevents render-time hover)', () => {
      component.selectedIndex.set(0);
      component.onResultMouseEnter(2);
      expect(component.selectedIndex()).toBe(0);
    });

    it('should change selectedIndex after a mousemove event has fired', () => {
      document.dispatchEvent(new MouseEvent('mousemove'));
      component.selectedIndex.set(0);
      component.onResultMouseEnter(2);
      expect(component.selectedIndex()).toBe(2);
    });
  });

  describe('onResultClick', () => {
    it('should set selectedIndex and call selectResult', () => {
      const result = makeResult('c', 'Charlie');
      const spy = vi.spyOn(component, 'selectResult');
      component.onResultClick(result, 3);
      expect(component.selectedIndex()).toBe(3);
      expect(spy).toHaveBeenCalledWith(result);
    });
  });

  describe('selectResult', () => {
    it('should do nothing when result is undefined', () => {
      component.selectResult(undefined);
      expect(mockProjectState.openDocument).not.toHaveBeenCalled();
    });

    it('should open document and close dialog', () => {
      const result = makeResult('d', 'Delta');
      component.searchQuery.set('search term');
      component.selectResult(result);
      expect(mockProjectState.openDocument).toHaveBeenCalledWith(
        result.element
      );
      expect(mockDialogRef.close).toHaveBeenCalled();
    });
  });

  describe('getIcon', () => {
    it('returns folder icon for Folder type', () => {
      const result = makeResult('f', 'Folder');
      result.element = makeElement('f', 'Folder', ElementType.Folder);
      expect(component.getIcon(result)).toBe('folder');
    });

    it('returns category icon for Worldbuilding type', () => {
      const result = makeResult('w', 'WB');
      result.element = makeElement('w', 'WB', ElementType.Worldbuilding);
      expect(component.getIcon(result)).toBe('category');
    });

    it('returns description icon for Item type', () => {
      const result = makeResult('i', 'Item');
      result.element = makeElement('i', 'Item', ElementType.Item);
      expect(component.getIcon(result)).toBe('description');
    });
  });

  describe('getSnippetHtml', () => {
    it('escapes HTML in before/after/match and wraps match in <mark>', () => {
      const html = component.getSnippetHtml({
        before: '<b>',
        match: 'hello',
        after: '</b>',
      });
      expect(html).toBe('&lt;b&gt;<mark>hello</mark>&lt;/b&gt;');
    });
  });

  describe('progressValue', () => {
    it('returns 0 when total is 0', () => {
      component.progress.set({
        scanned: 0,
        total: 0,
        results: [],
        done: false,
      });
      expect(component.progressValue).toBe(0);
    });

    it('returns 50 when half done', () => {
      component.progress.set({
        scanned: 5,
        total: 10,
        results: [],
        done: false,
      });
      expect(component.progressValue).toBe(50);
    });

    it('returns 100 when fully scanned', () => {
      component.progress.set({
        scanned: 10,
        total: 10,
        results: [],
        done: true,
      });
      expect(component.progressValue).toBe(100);
    });
  });
});
