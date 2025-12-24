import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship';
import { describe, expect, it, vi } from 'vitest';

import { Element, ElementType } from '../../../api-client';
import {
  RelationshipCategory,
  RelationshipTypeDefinition,
} from '../../components/element-ref/element-ref.model';
import {
  AddRelationshipDialogComponent,
  AddRelationshipDialogData,
} from './add-relationship-dialog.component';

describe('AddRelationshipDialogComponent', () => {
  let component: AddRelationshipDialogComponent;
  let fixture: ComponentFixture<AddRelationshipDialogComponent>;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };

  const mockElements: Element[] = [
    {
      id: 'doc-1',
      name: 'Document One',
      type: ElementType.Item,
      parentId: null,
      order: 0,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'char-1',
      name: 'Character Alpha',
      type: ElementType.Worldbuilding,
      schemaId: 'character-v1',
      parentId: null,
      order: 1,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'char-2',
      name: 'Character Beta',
      type: ElementType.Worldbuilding,
      schemaId: 'character-v1',
      parentId: null,
      order: 2,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'loc-1',
      name: 'Location One',
      type: ElementType.Worldbuilding,
      schemaId: 'location-v1',
      parentId: null,
      order: 3,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
  ];

  const mockRelationshipTypes: RelationshipTypeDefinition[] = [
    {
      id: 'references',
      name: 'References',
      inverseLabel: 'Referenced by',
      showInverse: true,
      category: RelationshipCategory.Reference,
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    },
    {
      id: 'knows',
      name: 'Knows',
      inverseLabel: 'Known by',
      showInverse: true,
      category: RelationshipCategory.Social,
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['character-v1'] },
      targetEndpoint: { allowedSchemas: ['character-v1'] },
    },
    {
      id: 'located-at',
      name: 'Located At',
      inverseLabel: 'Contains',
      showInverse: true,
      category: RelationshipCategory.Spatial,
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: ['character-v1', 'Item'] },
      targetEndpoint: { allowedSchemas: ['location-v1'] },
    },
  ];

  const mockDialogData: AddRelationshipDialogData = {
    sourceElementId: 'doc-1',
    sourceSchemaType: 'ITEM',
  };

  let relationshipServiceMock: {
    allTypes: ReturnType<typeof signal<RelationshipTypeDefinition[]>>;
    relationships: ReturnType<typeof signal<never[]>>;
  };

  let projectStateMock: {
    elements: ReturnType<typeof signal<Element[]>>;
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    };

    relationshipServiceMock = {
      allTypes: signal(mockRelationshipTypes),
      relationships: signal([]),
    };

    projectStateMock = {
      elements: signal(mockElements),
    };

    await TestBed.configureTestingModule({
      imports: [
        AddRelationshipDialogComponent,
        MatDialogModule,
        NoopAnimationsModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: RelationshipService, useValue: relationshipServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddRelationshipDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should start with no selected type', () => {
      expect(component.selectedType()).toBeNull();
    });

    it('should start with no selected element', () => {
      expect(component.selectedElement()).toBeNull();
    });

    it('should have available relationship types', () => {
      const types = component.availableTypes();
      expect(types.length).toBeGreaterThan(0);
    });
  });

  describe('type filtering', () => {
    it('should show references type for any element', () => {
      const types = component.availableTypes();
      expect(types.find(t => t.id === 'references')).toBeTruthy();
    });

    it('should filter types based on source schema constraints', async () => {
      // Test with CHARACTER schema type
      TestBed.resetTestingModule();

      mockDialogRef = { close: vi.fn() };

      relationshipServiceMock = {
        allTypes: signal(mockRelationshipTypes),
        relationships: signal([]),
      };

      projectStateMock = {
        elements: signal(mockElements),
      };

      const characterData: AddRelationshipDialogData = {
        sourceElementId: 'char-1',
        sourceSchemaType: 'character-v1',
      };

      await TestBed.configureTestingModule({
        imports: [
          AddRelationshipDialogComponent,
          MatDialogModule,
          NoopAnimationsModule,
        ],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: characterData },
          { provide: RelationshipService, useValue: relationshipServiceMock },
          { provide: ProjectStateService, useValue: projectStateMock },
        ],
      }).compileComponents();

      const charFixture = TestBed.createComponent(
        AddRelationshipDialogComponent
      );
      charFixture.detectChanges();
      const charComponent = charFixture.componentInstance;

      const types = charComponent.availableTypes();
      // CHARACTER should have access to 'references' (no constraints) and 'knows' and 'located-at'
      expect(types.find(t => t.id === 'references')).toBeTruthy();
      expect(types.find(t => t.id === 'knows')).toBeTruthy();
      expect(types.find(t => t.id === 'located-at')).toBeTruthy();
    });
  });

  describe('element filtering', () => {
    it('should filter out source element from available targets', () => {
      // Select a type first
      component.onTypeSelected('references');
      fixture.detectChanges();

      const targets = component.filteredElements();
      // Should not include the source element 'doc-1'
      expect(targets.find(e => e.id === 'doc-1')).toBeFalsy();
    });

    it('should include elements in available targets', () => {
      component.onTypeSelected('references');
      fixture.detectChanges();

      const targets = component.filteredElements();
      expect(targets.find(e => e.id === 'char-1')).toBeTruthy();
      expect(targets.find(e => e.id === 'loc-1')).toBeTruthy();
    });

    it('should filter elements by search text', () => {
      component.onTypeSelected('references');
      component.elementSearchControl.setValue('Alpha');
      fixture.detectChanges();

      const filtered = component.filteredElements();
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe('Character Alpha');
    });
  });

  describe('type selection', () => {
    it('should update selectedTypeId when type is selected', () => {
      component.onTypeSelected('references');
      expect(component.selectedTypeId()).toBe('references');
    });

    it('should clear element selection when type changes', () => {
      // Select type and element
      component.onTypeSelected('references');
      component.selectedElement.set(mockElements[1]);

      // Change type
      component.onTypeSelected('knows');

      // Element should be cleared
      expect(component.selectedElement()).toBeNull();
    });
  });

  describe('element selection', () => {
    it('should update selectedElement when set', () => {
      component.selectedElement.set(mockElements[1]);
      expect(component.selectedElement()).toBe(mockElements[1]);
    });
  });

  describe('submit', () => {
    it('should close dialog with result when submitting', () => {
      component.onTypeSelected('references');
      component.selectedElement.set(mockElements[1]);
      component.note.set('Test note');

      component.submit();

      expect(mockDialogRef.close).toHaveBeenCalledWith({
        relationshipTypeId: 'references',
        targetElementId: mockElements[1].id,
        note: 'Test note',
      });
    });

    it('should not close if no type selected', () => {
      component.selectedElement.set(mockElements[1]);
      component.submit();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });

    it('should not close if no element selected', () => {
      component.onTypeSelected('references');
      component.submit();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('should close dialog with null on cancel', () => {
      component.cancel();
      expect(mockDialogRef.close).toHaveBeenCalledWith(null);
    });
  });

  describe('canSubmit', () => {
    it('should be false with no selections', () => {
      expect(component.canSubmit()).toBe(false);
    });

    it('should be false with only type selected', () => {
      component.onTypeSelected('references');
      expect(component.canSubmit()).toBe(false);
    });

    it('should be true with both type and element selected', () => {
      component.onTypeSelected('references');
      component.selectedElement.set(mockElements[1]);
      expect(component.canSubmit()).toBe(true);
    });
  });

  describe('display helpers', () => {
    it('should return element name for autocomplete display', () => {
      const element = mockElements[1];
      const display = component.displayElement(element);
      expect(display).toBe(element.name);
    });

    it('should return empty string for null element', () => {
      const display = component.displayElement(null);
      expect(display).toBe('');
    });

    it('should get correct icon for element types', () => {
      expect(component.getElementIcon(mockElements[0])).toBe('description'); // Item
      expect(component.getElementIcon(mockElements[1])).toBe('auto_awesome'); // Worldbuilding (character)
      expect(component.getElementIcon(mockElements[3])).toBe('auto_awesome'); // Worldbuilding (location)
    });
  });

  describe('clearSelectedElement', () => {
    it('should clear element selection and search', () => {
      component.onTypeSelected('references');
      component.selectedElement.set(mockElements[1]);
      component.elementSearchControl.setValue('test');

      component.clearSelectedElement();

      expect(component.selectedElement()).toBeNull();
      expect(component.elementSearchControl.value).toBe('');
    });
  });
});
