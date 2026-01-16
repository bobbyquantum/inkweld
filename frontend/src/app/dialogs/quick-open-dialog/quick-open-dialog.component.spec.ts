import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Element, ElementType, Project } from '@inkweld/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  QuickOpenResult,
  QuickOpenService,
} from '../../services/core/quick-open.service';
import { ProjectStateService } from '../../services/project/project-state.service';
import { WorldbuildingService } from '../../services/worldbuilding/worldbuilding.service';
import { QuickOpenDialogComponent } from './quick-open-dialog.component';

describe('QuickOpenDialogComponent', () => {
  let component: QuickOpenDialogComponent;
  let fixture: ComponentFixture<QuickOpenDialogComponent>;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let mockQuickOpenService: {
    search: ReturnType<typeof vi.fn>;
  };
  let mockProjectState: {
    openDocument: ReturnType<typeof vi.fn>;
    project: ReturnType<typeof vi.fn>;
  };
  let mockWorldbuildingService: {
    getSchemaById: ReturnType<typeof vi.fn>;
  };

  const mockProject: Project = {
    id: 'project-1',
    title: 'Test Project',
    slug: 'test-project',
    username: 'testuser',
  } as Project;

  const mockElements: Element[] = [
    {
      id: 'doc-1',
      name: 'Introduction',
      type: ElementType.Item,
      level: 0,
      parentId: null,
      expandable: false,
      order: 0,
      version: 1,
      metadata: {},
    },
    {
      id: 'doc-2',
      name: 'Chapter One',
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
  ];

  const mockSearchResults: QuickOpenResult[] = [
    {
      element: mockElements[0],
      matchPositions: [0, 1, 2, 3, 4],
      score: 100,
      path: '',
      isRecent: true,
    },
    {
      element: mockElements[1],
      matchPositions: [],
      score: 50,
      path: '',
      isRecent: false,
    },
  ];

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockQuickOpenService = {
      search: vi.fn().mockReturnValue(mockSearchResults),
    };

    mockProjectState = {
      openDocument: vi.fn(),
      project: vi.fn().mockReturnValue(mockProject),
    };

    mockWorldbuildingService = {
      getSchemaById: vi.fn().mockReturnValue({ icon: 'person' }),
    };

    await TestBed.configureTestingModule({
      imports: [QuickOpenDialogComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: QuickOpenService, useValue: mockQuickOpenService },
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: WorldbuildingService, useValue: mockWorldbuildingService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuickOpenDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('search', () => {
    it('should update search query on input', () => {
      component.onSearchChange('test');
      expect(component.searchQuery()).toBe('test');
    });

    it('should reset selection index when query changes', () => {
      component.onSearchChange('intro');
      expect(component.selectedIndex()).toBe(0);
    });

    it('should call search service on query change', () => {
      component.onSearchChange('test');
      // Trigger computed evaluation
      component.results();
      expect(mockQuickOpenService.search).toHaveBeenCalledWith('test');
    });
  });

  describe('result selection', () => {
    it('should select result and close dialog on click', () => {
      const result = mockSearchResults[0];
      component.onResultClick(result, 0);

      expect(mockProjectState.openDocument).toHaveBeenCalledWith(
        result.element
      );
      expect(mockDialogRef.close).toHaveBeenCalledWith(result.element);
    });

    it('should update selected index on mouse enter', () => {
      component.onResultMouseEnter(1);
      expect(component.selectedIndex()).toBe(1);
    });

    it('should not select undefined result', () => {
      component.selectResult(undefined);
      expect(mockProjectState.openDocument).not.toHaveBeenCalled();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('icons', () => {
    it('should return description icon for Item type', () => {
      const result: QuickOpenResult = {
        element: mockElements[0], // Item type
        matchPositions: [],
        score: 0,
        path: '',
        isRecent: false,
      };
      expect(component.getIcon(result)).toBe('description');
    });

    it('should look up worldbuilding icon from schema', () => {
      const result: QuickOpenResult = {
        element: mockElements[2], // Worldbuilding type with schemaId
        matchPositions: [],
        score: 0,
        path: '',
        isRecent: false,
      };
      expect(component.getIcon(result)).toBe('person');
      expect(mockWorldbuildingService.getSchemaById).toHaveBeenCalledWith(
        'character-v1'
      );
    });

    it('should return category icon for worldbuilding without schema', () => {
      mockWorldbuildingService.getSchemaById.mockReturnValue(null);
      const result: QuickOpenResult = {
        element: mockElements[2],
        matchPositions: [],
        score: 0,
        path: '',
        isRecent: false,
      };
      expect(component.getIcon(result)).toBe('category');
    });
  });

  describe('highlighting', () => {
    it('should highlight matched characters', () => {
      const result: QuickOpenResult = {
        element: { ...mockElements[0], name: 'Test' } as Element,
        matchPositions: [0, 2], // T and s
        score: 0,
        path: '',
        isRecent: false,
      };
      const html = component.getHighlightedName(result);
      expect(html).toContain('<mark>T</mark>');
      expect(html).toContain('<mark>s</mark>');
      expect(html).toContain('e');
      expect(html).toContain('t');
    });

    it('should return plain text when no match positions', () => {
      const result: QuickOpenResult = {
        element: { ...mockElements[0], name: 'Test' } as Element,
        matchPositions: [],
        score: 0,
        path: '',
        isRecent: false,
      };
      const html = component.getHighlightedName(result);
      expect(html).toBe('Test');
      expect(html).not.toContain('<mark>');
    });

    it('should escape HTML characters', () => {
      const result: QuickOpenResult = {
        element: {
          ...mockElements[0],
          name: '<script>alert(1)</script>',
        } as Element,
        matchPositions: [],
        score: 0,
        path: '',
        isRecent: false,
      };
      const html = component.getHighlightedName(result);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('showingRecent', () => {
    it('should return true when query is empty', () => {
      component.onSearchChange('');
      expect(component.showingRecent()).toBe(true);
    });

    it('should return true when query is whitespace', () => {
      component.onSearchChange('   ');
      expect(component.showingRecent()).toBe(true);
    });

    it('should return false when query has content', () => {
      component.onSearchChange('test');
      expect(component.showingRecent()).toBe(false);
    });
  });

  describe('track by', () => {
    it('should return element id for tracking', () => {
      const result = mockSearchResults[0];
      expect(component.trackByElementId(0, result)).toBe(result.element.id);
    });
  });
});
