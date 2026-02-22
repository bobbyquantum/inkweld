import { provideZonelessChangeDetection, signal } from '@angular/core';
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
import { RelationshipService } from '../../services/relationship/relationship.service';
import { TagService } from '../../services/tag/tag.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
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
  let mockTagService: Partial<TagService>;
  let mockRelationshipService: Partial<RelationshipService>;
  let mockWorldbuildingService: Partial<WorldbuildingService>;

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
      elements: signal<Element[]>([]),
      project: signal(undefined),
    } as Partial<
      MockedObject<ProjectStateService>
    > as MockedObject<ProjectStateService>;

    mockFindInDocument = {
      open: vi.fn(),
      search: vi.fn(),
    } as Partial<
      MockedObject<FindInDocumentService>
    > as MockedObject<FindInDocumentService>;

    mockTagService = {
      allTags: signal([]),
      elementTags: signal([]),
      getElementsWithTag: vi.fn().mockReturnValue([]),
    } as Partial<TagService>;

    mockRelationshipService = {
      hasRelationships: vi.fn().mockReturnValue(false),
      getRelationshipView: vi
        .fn()
        .mockReturnValue({ outgoing: [], incoming: [] }),
      relationships: signal([]),
    } as Partial<RelationshipService>;

    mockWorldbuildingService = {
      getSchemas: vi.fn().mockReturnValue([]),
      getSchemaById: vi.fn().mockReturnValue(null),
    } as Partial<WorldbuildingService>;

    await TestBed.configureTestingModule({
      imports: [ProjectSearchDialogComponent, MatDialogModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: ProjectSearchService, useValue: mockProjectSearchService },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: FindInDocumentService, useValue: mockFindInDocument },
        { provide: TagService, useValue: mockTagService },
        { provide: RelationshipService, useValue: mockRelationshipService },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
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

    it('should reset displayedCount on change', () => {
      component.loadMore(); // increase it first
      component.onSearchChange('x');
      expect(component.displayedCount()).toBe(50); // PAGE_SIZE
    });

    it('should mark hasQuery true for query >= 2 chars', () => {
      component.onSearchChange('ab');
      expect(component.hasQuery).toBe(true);
    });

    it('hasQuery should be false for single char query', () => {
      component.onSearchChange('x');
      expect(component.hasQuery).toBe(false);
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

  describe('filters', () => {
    describe('toggleFilters', () => {
      it('should toggle showFilters signal', () => {
        expect(component.showFilters()).toBe(false);
        component.toggleFilters();
        expect(component.showFilters()).toBe(true);
        component.toggleFilters();
        expect(component.showFilters()).toBe(false);
      });
    });

    describe('toggleTag', () => {
      it('should add tag ID when not selected', () => {
        component.toggleTag('tag-1');
        expect(component.selectedTagIds()).toEqual(['tag-1']);
      });

      it('should remove tag ID when already selected', () => {
        component.toggleTag('tag-1');
        component.toggleTag('tag-1');
        expect(component.selectedTagIds()).toEqual([]);
      });

      it('should support multiple tags', () => {
        component.toggleTag('tag-1');
        component.toggleTag('tag-2');
        expect(component.selectedTagIds()).toEqual(['tag-1', 'tag-2']);
      });
    });

    describe('toggleElementType', () => {
      it('should add element type when not selected', () => {
        component.toggleElementType(ElementType.Item);
        expect(component.selectedElementTypes()).toEqual([ElementType.Item]);
      });

      it('should remove element type when already selected', () => {
        component.toggleElementType(ElementType.Item);
        component.toggleElementType(ElementType.Item);
        expect(component.selectedElementTypes()).toEqual([]);
      });
    });

    describe('setRelatedToElement', () => {
      it('should set related element ID', () => {
        component.setRelatedToElement('el-1');
        expect(component.relatedToElementId()).toBe('el-1');
      });

      it('should clear with empty string', () => {
        component.setRelatedToElement('el-1');
        component.setRelatedToElement('');
        expect(component.relatedToElementId()).toBe('');
      });
    });

    describe('clearFilters', () => {
      it('should reset all filters', () => {
        component.toggleTag('tag-1');
        component.toggleElementType(ElementType.Worldbuilding);
        component.setRelatedToElement('el-1');
        expect(component.activeFilterCount()).toBe(3);

        component.clearFilters();
        expect(component.selectedTagIds()).toEqual([]);
        expect(component.selectedElementTypes()).toEqual([]);
        expect(component.relatedToElementId()).toBe('');
        expect(component.activeFilterCount()).toBe(0);
      });
    });

    describe('activeFilterCount', () => {
      it('should be 0 with no filters', () => {
        expect(component.activeFilterCount()).toBe(0);
      });

      it('should count tags as one filter', () => {
        component.toggleTag('tag-1');
        component.toggleTag('tag-2');
        expect(component.activeFilterCount()).toBe(1);
      });

      it('should count element types as one filter', () => {
        component.toggleElementType(ElementType.Item);
        expect(component.activeFilterCount()).toBe(1);
      });

      it('should count related-to as one filter', () => {
        component.setRelatedToElement('el-1');
        expect(component.activeFilterCount()).toBe(1);
      });

      it('should count all filter types independently', () => {
        component.toggleTag('tag-1');
        component.toggleElementType(ElementType.Item);
        component.setRelatedToElement('el-1');
        expect(component.activeFilterCount()).toBe(3);
      });
    });

    describe('isTagSelected', () => {
      it('should return false when tag is not selected', () => {
        expect(component.isTagSelected('tag-1')).toBe(false);
      });

      it('should return true when tag is selected', () => {
        component.toggleTag('tag-1');
        expect(component.isTagSelected('tag-1')).toBe(true);
      });
    });

    describe('isElementTypeSelected', () => {
      it('should return false when type is not selected', () => {
        expect(component.isElementTypeSelected(ElementType.Item)).toBe(false);
      });

      it('should return true when type is selected', () => {
        component.toggleElementType(ElementType.Item);
        expect(component.isElementTypeSelected(ElementType.Item)).toBe(true);
      });
    });

    describe('toggleSchema', () => {
      it('should add schema ID when not selected', () => {
        component.toggleSchema('schema-1');
        expect(component.selectedSchemaIds()).toEqual(['schema-1']);
      });

      it('should remove schema ID when already selected', () => {
        component.toggleSchema('schema-1');
        component.toggleSchema('schema-1');
        expect(component.selectedSchemaIds()).toEqual([]);
      });

      it('isSchemaSelected should return correct state', () => {
        expect(component.isSchemaSelected('schema-1')).toBe(false);
        component.toggleSchema('schema-1');
        expect(component.isSchemaSelected('schema-1')).toBe(true);
      });

      it('should count in activeFilterCount', () => {
        component.toggleSchema('schema-1');
        expect(component.activeFilterCount()).toBe(1);
      });

      it('clearFilters should reset schema selection', () => {
        component.toggleSchema('schema-1');
        component.clearFilters();
        expect(component.selectedSchemaIds()).toEqual([]);
      });
    });
  });

  describe('pagination', () => {
    it('loadMore should increase displayedCount', () => {
      const initial = component.displayedCount();
      component.loadMore();
      expect(component.displayedCount()).toBeGreaterThan(initial);
    });

    it('visibleResults should limit results to displayedCount', () => {
      const manyResults: ProjectSearchResult[] = Array.from(
        { length: 80 },
        (_, i) => makeResult(`el-${i}`, `Element ${i}`)
      );
      component.progress.set({
        scanned: 80,
        total: 80,
        results: manyResults,
        done: true,
      });
      // Default page size is 50
      expect(component.results.length).toBe(50);
      expect(component.hasMoreResults()).toBe(true);
      expect(component.totalResults).toBe(80);

      component.loadMore();
      expect(component.results.length).toBe(80);
      expect(component.hasMoreResults()).toBe(false);
    });
  });

  describe('getIcon', () => {
    it('returns folder icon for Folder type', () => {
      const result = makeResult('f', 'Folder');
      result.element = makeElement('f', 'Folder', ElementType.Folder);
      expect(component.getIcon(result)).toBe('folder');
    });

    it('returns description icon for Item type', () => {
      const result = makeResult('i', 'Item');
      result.element = makeElement('i', 'Item', ElementType.Item);
      expect(component.getIcon(result)).toBe('description');
    });

    it('returns schema icon for worldbuilding element with schema', () => {
      const el = makeElement('w', 'WB', ElementType.Worldbuilding);
      el.schemaId = 'char-schema';
      const result = makeResult('w', 'WB');
      result.element = el;
      vi.mocked(mockWorldbuildingService.getSchemaById!).mockReturnValue({
        id: 'char-schema',
        name: 'Character',
        icon: 'person',
        description: '',
        version: 1,
        isBuiltIn: false,
        tabs: [],
      });
      expect(component.getIcon(result)).toBe('person');
    });

    it('returns category icon for Worldbuilding type without schema', () => {
      const result = makeResult('w2', 'WB2');
      result.element = makeElement('w2', 'WB2', ElementType.Worldbuilding);
      expect(component.getIcon(result)).toBe('category');
    });
  });
});
