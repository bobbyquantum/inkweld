import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ProjectStateService } from '@services/project/project-state.service';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Element, ElementType, Project } from '../../../../../api-client';
import { WorldbuildingTabComponent } from './worldbuilding-tab.component';

describe('WorldbuildingTabComponent', () => {
  let component: WorldbuildingTabComponent;
  let fixture: ComponentFixture<WorldbuildingTabComponent>;
  let mockProjectState: {
    project: ReturnType<typeof signal<Project | null>>;
    elements: ReturnType<typeof signal<Element[]>>;
    canWrite: ReturnType<typeof signal<boolean>>;
  };
  let paramMapSubject: BehaviorSubject<any>;

  const mockProject: Project = {
    id: 'test-project-id',
    username: 'testuser',
    slug: 'test-project',
    title: 'Test Project',
    description: '',
    createdDate: '2024-01-01',
    updatedDate: '2024-01-01',
  };

  const mockElement: Element = {
    id: 'element-123',
    name: 'Test Character',
    type: ElementType.Worldbuilding,
    schemaId: 'character-v1',
    parentId: null,
    order: 0,
    level: 0,
    expandable: false,
    version: 1,
    metadata: {},
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };

  beforeEach(async () => {
    paramMapSubject = new BehaviorSubject(
      convertToParamMap({ tabId: 'element-123' })
    );

    mockProjectState = {
      project: signal<Project | null>(null),
      elements: signal<Element[]>([]),
      canWrite: signal<boolean>(true),
    };

    await TestBed.configureTestingModule({
      imports: [WorldbuildingTabComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectState },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMapSubject.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WorldbuildingTabComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should subscribe to route params and set element ID', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      fixture.detectChanges();

      expect(component['elementId']()).toBe('element-123');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[WorldbuildingTab] Element ID from route params: element-123'
      );

      consoleLogSpy.mockRestore();
    });

    it('should set element type when element is found in project state', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});
      mockProjectState.elements.set([mockElement]);

      fixture.detectChanges();

      expect(component['elementType']()).toBe(ElementType.Worldbuilding);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[WorldbuildingTab] Element type: WORLDBUILDING'
      );

      consoleLogSpy.mockRestore();
    });

    it('should warn when element is not found in project state', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});
      mockProjectState.elements.set([]);

      fixture.detectChanges();

      expect(component['elementType']()).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[WorldbuildingTab] Element not found yet: element-123, waiting for elements to load...'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle empty tabId param', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});
      paramMapSubject.next(convertToParamMap({}));

      fixture.detectChanges();

      expect(component['elementId']()).toBe('');

      consoleLogSpy.mockRestore();
    });

    it('should update when route params change', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});
      fixture.detectChanges();

      expect(component['elementId']()).toBe('element-123');

      // Change route params
      paramMapSubject.next(convertToParamMap({ tabId: 'element-456' }));

      expect(component['elementId']()).toBe('element-456');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[WorldbuildingTab] Element ID from route params: element-456'
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('project changes effect', () => {
    it('should update username and slug when project is set', () => {
      fixture.detectChanges();

      expect(component['username']()).toBeUndefined();
      expect(component['slug']()).toBeUndefined();

      mockProjectState.project.set(mockProject);
      fixture.detectChanges(); // Trigger effect

      expect(component['username']()).toBe('testuser');
      expect(component['slug']()).toBe('test-project');
    });

    it('should not update when project is null', () => {
      fixture.detectChanges();

      mockProjectState.project.set(null);

      expect(component['username']()).toBeUndefined();
      expect(component['slug']()).toBeUndefined();
    });
  });

  describe('elements changes effect', () => {
    it('should update element type when elements are loaded', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});
      fixture.detectChanges();

      expect(component['elementType']()).toBeNull();

      // Elements load
      mockProjectState.elements.set([mockElement]);
      fixture.detectChanges(); // Trigger effect

      expect(component['elementType']()).toBe(ElementType.Worldbuilding);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[WorldbuildingTab] Element type loaded: WORLDBUILDING'
      );

      consoleLogSpy.mockRestore();
    });

    it('should not update element type if already set', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});
      mockProjectState.elements.set([mockElement]);
      fixture.detectChanges();

      const callCount = consoleLogSpy.mock.calls.filter(call =>
        call[0]?.includes('Element type loaded')
      ).length;

      // Trigger elements change again
      mockProjectState.elements.set([mockElement]);

      const newCallCount = consoleLogSpy.mock.calls.filter(call =>
        call[0]?.includes('Element type loaded')
      ).length;

      expect(newCallCount).toBe(callCount);

      consoleLogSpy.mockRestore();
    });

    it('should not update if element ID does not match', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});
      const differentElement: Element = {
        ...mockElement,
        id: 'different-id',
      };

      fixture.detectChanges();
      mockProjectState.elements.set([differentElement]);

      expect(component['elementType']()).toBeNull();

      consoleLogSpy.mockRestore();
    });

    it('should handle empty elements array', () => {
      fixture.detectChanges();

      mockProjectState.elements.set([]);

      expect(component['elementType']()).toBeNull();
    });
  });

  describe('ngOnDestroy', () => {
    it('should unsubscribe from route params', () => {
      fixture.detectChanges();

      const subscription = component['paramSubscription'];
      expect(subscription).not.toBeNull();

      const unsubscribeSpy = vi.spyOn(subscription!, 'unsubscribe');

      component.ngOnDestroy();

      expect(unsubscribeSpy).toHaveBeenCalled();
      expect(component['paramSubscription']).toBeNull();
    });

    it('should handle null subscription gracefully', () => {
      fixture.detectChanges();
      component['paramSubscription'] = null;

      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('findElement', () => {
    it('should find element by ID', () => {
      mockProjectState.elements.set([mockElement]);
      fixture.detectChanges();

      const found = component['findElement']('element-123');

      expect(found).toEqual(mockElement);
    });

    it('should return null when element not found', () => {
      mockProjectState.elements.set([mockElement]);
      fixture.detectChanges();

      const found = component['findElement']('non-existent-id');

      expect(found).toBeNull();
    });

    it('should return null for empty elements array', () => {
      mockProjectState.elements.set([]);
      fixture.detectChanges();

      const found = component['findElement']('element-123');

      expect(found).toBeNull();
    });

    it('should find element in array with multiple elements', () => {
      const elements: Element[] = [
        { ...mockElement, id: 'element-1' },
        { ...mockElement, id: 'element-2' },
        { ...mockElement, id: 'element-3' },
      ];

      mockProjectState.elements.set(elements);
      fixture.detectChanges();

      const found = component['findElement']('element-2');

      expect(found?.id).toBe('element-2');
    });
  });

  describe('template rendering', () => {
    it('should show worldbuilding editor when elementId and elementType are set', () => {
      mockProjectState.project.set(mockProject);
      mockProjectState.elements.set([mockElement]);
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const editor = compiled.querySelector('app-worldbuilding-editor');

      expect(editor).toBeTruthy();
    });

    it('should show error message when elementId is not set', () => {
      paramMapSubject.next(convertToParamMap({}));
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const errorMessage = compiled.querySelector('.error-message');

      expect(errorMessage).toBeTruthy();
      expect(errorMessage.textContent).toContain(
        'Unable to load worldbuilding element'
      );
      expect(errorMessage.textContent).toContain('Not provided');
    });

    it('should show error message when elementType is not set', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement;
      const errorMessage = compiled.querySelector('.error-message');

      expect(errorMessage).toBeTruthy();
      expect(errorMessage.textContent).toContain('element-123');
    });
  });
});
