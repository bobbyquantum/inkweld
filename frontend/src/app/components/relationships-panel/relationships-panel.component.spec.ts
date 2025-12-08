import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship';
import { describe, expect, it, vi } from 'vitest';

import { Element, ElementType } from '../../../api-client';
import {
  ElementRelationship,
  RelationshipType,
} from '../element-ref/element-ref.model';
import { RelationshipsPanelComponent } from './relationships-panel.component';

describe('RelationshipsPanelComponent', () => {
  let component: RelationshipsPanelComponent;
  let fixture: ComponentFixture<RelationshipsPanelComponent>;
  let relationshipServiceMock: Partial<RelationshipService>;
  let projectStateMock: Partial<ProjectStateService>;

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

  const mockCustomTypes: RelationshipType[] = [];

  beforeEach(async () => {
    relationshipServiceMock = {
      relationships: signal(mockRelationships),
      customRelationshipTypes: signal(mockCustomTypes),
    };

    projectStateMock = {
      elements: signal(mockElements),
      openDocument: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [RelationshipsPanelComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: RelationshipService, useValue: relationshipServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
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

  describe('relationship type names', () => {
    it('should return default type names', () => {
      expect(component.getRelationshipTypeName('references')).toBe(
        'References'
      );
      expect(component.getRelationshipTypeName('mentioned-in')).toBe(
        'Mentioned in'
      );
      expect(component.getRelationshipTypeName('related-to')).toBe(
        'Related to'
      );
    });

    it('should return type ID for unknown types', () => {
      expect(component.getRelationshipTypeName('custom-type')).toBe(
        'custom-type'
      );
    });
  });

  describe('navigation', () => {
    it('should navigate to target element for outgoing relationship', () => {
      const rel = mockRelationships[0];
      component.navigateToElement(rel, true);

      expect(projectStateMock.openDocument).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'char-1' })
      );
    });

    it('should navigate to source element for incoming relationship', () => {
      const rel = mockRelationships[1];
      component.navigateToElement(rel, false);

      expect(projectStateMock.openDocument).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'doc-2' })
      );
    });
  });
});
