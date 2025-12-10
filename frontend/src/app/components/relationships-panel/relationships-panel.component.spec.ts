import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { Element, ElementType } from '../../../api-client';
import {
  ElementRelationship,
  RelationshipCategory,
  RelationshipTypeDefinition,
} from '../element-ref/element-ref.model';
import { RelationshipsPanelComponent } from './relationships-panel.component';

describe('RelationshipsPanelComponent', () => {
  let component: RelationshipsPanelComponent;
  let fixture: ComponentFixture<RelationshipsPanelComponent>;
  let relationshipServiceMock: Partial<RelationshipService>;
  let projectStateMock: Partial<ProjectStateService>;
  let dialogMock: Partial<MatDialog>;

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
      id: 'doc-2',
      name: 'Document Two',
      type: ElementType.Item,
      parentId: null,
      order: 1,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
    {
      id: 'char-1',
      name: 'Character One',
      type: ElementType.Character,
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
      type: ElementType.Location,
      parentId: null,
      order: 3,
      level: 0,
      expandable: false,
      version: 1,
      metadata: {},
    },
  ];

  const mockRelationships: ElementRelationship[] = [
    {
      id: 'rel-1',
      sourceElementId: 'doc-1',
      targetElementId: 'char-1',
      relationshipTypeId: 'references',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'rel-2',
      sourceElementId: 'doc-2',
      targetElementId: 'doc-1',
      relationshipTypeId: 'references',
      createdAt: '2024-01-02T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    },
  ];

  const mockCustomTypes: RelationshipTypeDefinition[] = [];

  const mockBuiltInTypes: RelationshipTypeDefinition[] = [
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
      id: 'related-to',
      name: 'Related to',
      inverseLabel: 'Related to',
      showInverse: false,
      category: RelationshipCategory.Reference,
      isBuiltIn: true,
      sourceEndpoint: { allowedSchemas: [] },
      targetEndpoint: { allowedSchemas: [] },
    },
  ];

  beforeEach(async () => {
    relationshipServiceMock = {
      relationships: signal(mockRelationships),
      customRelationshipTypes: signal(mockCustomTypes),
      allTypes: signal([...mockBuiltInTypes, ...mockCustomTypes]),
      addRelationship: vi.fn(),
      removeRelationship: vi.fn(),
    };

    projectStateMock = {
      elements: signal(mockElements),
      openDocument: vi.fn(),
    };

    dialogMock = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(null),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [RelationshipsPanelComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: RelationshipService, useValue: relationshipServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: MatDialog, useValue: dialogMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RelationshipsPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('documentId', 'doc-1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('relationship filtering', () => {
    it('should filter outgoing relationships for current document', () => {
      const outgoing = component.outgoingRelationships();
      expect(outgoing.length).toBe(1);
      expect(outgoing[0].targetElementId).toBe('char-1');
    });

    it('should filter incoming relationships (backlinks) for current document', () => {
      const incoming = component.incomingRelationships();
      expect(incoming.length).toBe(1);
      expect(incoming[0].sourceElementId).toBe('doc-2');
    });

    it('should calculate counts correctly', () => {
      expect(component.outgoingCount()).toBe(1);
      expect(component.incomingCount()).toBe(1);
      expect(component.totalCount()).toBe(2);
    });
  });

  describe('element name resolution', () => {
    it('should resolve element names', () => {
      expect(component.getElementName('doc-1')).toBe('Document One');
      expect(component.getElementName('char-1')).toBe('Character One');
    });

    it('should return Unknown for missing elements', () => {
      expect(component.getElementName('nonexistent')).toBe('Unknown');
    });
  });

  describe('element icon resolution', () => {
    it('should return correct icon for element types', () => {
      expect(component.getElementIcon('char-1')).toBe('person');
      expect(component.getElementIcon('loc-1')).toBe('place');
      expect(component.getElementIcon('doc-1')).toBe('description');
    });

    it('should return link icon for missing elements', () => {
      expect(component.getElementIcon('nonexistent')).toBe('link');
    });
  });

  describe('navigation', () => {
    it('should navigate to target element for outgoing relationship', () => {
      const rel = mockRelationships[0];
      component.navigateToElement(rel, false);

      expect(projectStateMock.openDocument).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'char-1' })
      );
    });

    it('should navigate to source element for incoming relationship', () => {
      const rel = mockRelationships[1];
      component.navigateToElement(rel, true);

      expect(projectStateMock.openDocument).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc-2' })
      );
    });
  });

  describe('relationship grouping', () => {
    it('should group relationships by type', () => {
      const groups = component.groupedRelationships();
      expect(groups.length).toBeGreaterThan(0);
    });

    it('should have outgoing groups before incoming groups', () => {
      const groups = component.groupedRelationships();
      const outgoingIdx = groups.findIndex(g => !g.isIncoming);
      const incomingIdx = groups.findIndex(g => g.isIncoming);

      if (outgoingIdx >= 0 && incomingIdx >= 0) {
        expect(outgoingIdx).toBeLessThan(incomingIdx);
      }
    });

    it('should use type name for outgoing groups', () => {
      const groups = component.groupedRelationships();
      const outgoingGroup = groups.find(g => !g.isIncoming);
      if (outgoingGroup) {
        expect(outgoingGroup.displayLabel).toBe(outgoingGroup.type.name);
      }
    });

    it('should use inverse label for incoming groups', () => {
      const groups = component.groupedRelationships();
      const incomingGroup = groups.find(g => g.isIncoming);
      if (incomingGroup) {
        expect(incomingGroup.displayLabel).toBe(
          incomingGroup.type.inverseLabel
        );
      }
    });

    it('should provide unique group keys', () => {
      const groups = component.groupedRelationships();
      const keys = groups.map(g => component.getGroupKey(g));
      const uniqueKeys = [...new Set(keys)];
      expect(keys.length).toBe(uniqueKeys.length);
    });
  });

  describe('add relationship dialog', () => {
    it('should open dialog when openAddRelationshipDialog is called', () => {
      component.openAddRelationshipDialog();

      expect(dialogMock.open).toHaveBeenCalled();
    });

    it('should pass source element ID to dialog', () => {
      component.openAddRelationshipDialog();

      expect(dialogMock.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          data: expect.objectContaining({
            sourceElementId: 'doc-1',
          }),
        })
      );
    });

    it('should create relationship when dialog returns result', () => {
      const dialogResult = {
        relationshipTypeId: 'references',
        targetElementId: 'char-1',
        note: 'Test note',
      };

      dialogMock.open = vi.fn().mockReturnValue({
        afterClosed: () => of(dialogResult),
      } as Partial<MatDialogRef<unknown>>);

      component.openAddRelationshipDialog();

      expect(relationshipServiceMock.addRelationship).toHaveBeenCalledWith(
        'doc-1',
        'char-1',
        'references',
        { note: 'Test note' }
      );
    });

    it('should not create relationship when dialog is cancelled', () => {
      dialogMock.open = vi.fn().mockReturnValue({
        afterClosed: () => of(null),
      } as Partial<MatDialogRef<unknown>>);

      component.openAddRelationshipDialog();

      expect(relationshipServiceMock.addRelationship).not.toHaveBeenCalled();
    });
  });

  describe('delete relationship', () => {
    it('should call removeRelationship on service', () => {
      const rel = mockRelationships[0];
      const mockEvent = {
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent;

      component.deleteRelationship(rel, mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(relationshipServiceMock.removeRelationship).toHaveBeenCalledWith(
        rel.id
      );
    });
  });
});
