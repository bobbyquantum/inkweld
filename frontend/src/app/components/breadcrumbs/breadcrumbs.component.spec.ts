import { NO_ERRORS_SCHEMA, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Element, ElementType, Project } from '@inkweld/index';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BreadcrumbsComponent } from './breadcrumbs.component';

describe('BreadcrumbsComponent', () => {
  let component: BreadcrumbsComponent;
  let fixture: ComponentFixture<BreadcrumbsComponent>;
  let projectStateServiceMock: Partial<ProjectStateService>;
  let elementTreeServiceMock: Partial<ElementTreeService>;

  const mockProject: Project = {
    id: '1',
    title: 'Test Project',
    slug: 'test-project',
    description: 'Test Description',
    username: 'testuser',
    createdDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
  };

  const mockElements: Element[] = [
    {
      id: 'folder-1',
      name: 'Chapter 1',
      type: ElementType.Folder,
      parentId: null,
      level: 0,
      expandable: true,
      order: 0,
      version: 0,
    },
    {
      id: 'doc-1',
      name: 'Scene 1',
      type: ElementType.Item,
      parentId: 'folder-1',
      level: 1,
      expandable: false,
      order: 1,
      version: 0,
    },
  ];

  beforeEach(async () => {
    const projectSignal = signal<Project | undefined>(mockProject);
    const elementsSignal = signal<Element[]>(mockElements);

    projectStateServiceMock = {
      project: projectSignal,
      elements: elementsSignal,
      openDocument: vi.fn(),
    };

    elementTreeServiceMock = {
      getAncestors: vi.fn().mockImplementation((elements: Element[], index: number) => {
        // Return parent for doc-1
        if (index === 1) {
          return [mockElements[0]]; // Return folder-1 as ancestor
        }
        return [];
      }),
    };

    await TestBed.configureTestingModule({
      imports: [BreadcrumbsComponent, NoopAnimationsModule],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: projectStateServiceMock },
        { provide: ElementTreeService, useValue: elementTreeServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BreadcrumbsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('breadcrumbPath', () => {
    it('should return empty array when no elementId', () => {
      fixture.detectChanges();
      expect(component.breadcrumbPath()).toEqual([]);
    });

    it('should build breadcrumb path for nested element', () => {
      component.elementId = 'testuser:test-project:doc-1';
      fixture.detectChanges();

      const path = component.breadcrumbPath();
      expect(path.length).toBe(2);
      expect(path[0].id).toBe('folder-1');
      expect(path[1].id).toBe('doc-1');
    });

    it('should handle simple element ID format', () => {
      component.elementId = 'doc-1';
      fixture.detectChanges();

      const path = component.breadcrumbPath();
      expect(path.length).toBe(2);
    });
  });

  describe('showBreadcrumbs', () => {
    it('should not show breadcrumbs for root element', () => {
      component.elementId = 'testuser:test-project:folder-1';
      // Mock getAncestors to return empty for root
      elementTreeServiceMock.getAncestors = vi.fn().mockReturnValue([]);
      fixture.detectChanges();

      expect(component.showBreadcrumbs()).toBe(false);
    });

    it('should show breadcrumbs for nested element', () => {
      component.elementId = 'testuser:test-project:doc-1';
      fixture.detectChanges();

      expect(component.showBreadcrumbs()).toBe(true);
    });
  });

  describe('getElementIcon', () => {
    it('should return folder icon for folder type', () => {
      const folderElement = mockElements[0];
      expect(component.getElementIcon(folderElement)).toBe('folder');
    });

    it('should return description icon for item type', () => {
      const itemElement = mockElements[1];
      expect(component.getElementIcon(itemElement)).toBe('description');
    });

    it('should return custom icon from metadata if available', () => {
      const elementWithIcon: Element = {
        ...mockElements[1],
        metadata: { icon: 'custom_icon' },
      };
      expect(component.getElementIcon(elementWithIcon)).toBe('custom_icon');
    });
  });

  describe('navigateToElement', () => {
    it('should call projectState.openDocument', () => {
      const element = mockElements[0];
      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Event;

      component.navigateToElement(element, mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(projectStateServiceMock.openDocument).toHaveBeenCalledWith(element);
    });
  });

  describe('isLast', () => {
    it('should return true for last element in path', () => {
      component.elementId = 'testuser:test-project:doc-1';
      fixture.detectChanges();

      const lastElement = mockElements[1];
      expect(component.isLast(lastElement)).toBe(true);
    });

    it('should return false for non-last element', () => {
      component.elementId = 'testuser:test-project:doc-1';
      fixture.detectChanges();

      const firstElement = mockElements[0];
      expect(component.isLast(firstElement)).toBe(false);
    });
  });
});
