import { provideHttpClient } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { SystemConfigService } from '@services/core/system-config.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import {
  ElementRelationship,
  RelationshipCategory,
  RelationshipTypeDefinition,
} from '../element-ref/element-ref.model';
import { ElementRefService } from '../element-ref/element-ref.service';
import { MetaPanelComponent } from './meta-panel.component';

describe('MetaPanelComponent', () => {
  let component: MetaPanelComponent;
  let fixture: ComponentFixture<MetaPanelComponent>;
  let dialogMock: { open: ReturnType<typeof vi.fn> };
  let projectStateMock: {
    elements: ReturnType<typeof signal>;
    openDocument: ReturnType<typeof vi.fn>;
    project: ReturnType<typeof signal>;
  };
  let relationshipServiceMock: {
    relationships: ReturnType<typeof signal>;
    customRelationshipTypes: ReturnType<typeof signal>;
    allTypes: ReturnType<typeof signal>;
    deleteRelationship: ReturnType<typeof vi.fn>;
    addRelationship: ReturnType<typeof vi.fn>;
    removeRelationship: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    relationshipServiceMock = {
      relationships: signal([]),
      customRelationshipTypes: signal([]),
      allTypes: signal<RelationshipTypeDefinition[]>([]),
      deleteRelationship: vi.fn(),
      addRelationship: vi.fn(),
      removeRelationship: vi.fn(),
    };

    projectStateMock = {
      elements: signal([]),
      openDocument: vi.fn(),
      project: signal(null),
    };

    dialogMock = {
      open: vi.fn().mockReturnValue({ afterClosed: () => of(null) }),
    };

    const elementRefServiceMock = {
      showTooltip: vi.fn(),
      hideTooltip: vi.fn(),
    };

    // Mock WorldbuildingService to return schema icons
    const worldbuildingServiceMock = {
      getSchemaById: vi.fn().mockImplementation((schemaId: string) => {
        if (schemaId === 'character-v1') {
          return { id: 'character-v1', name: 'Character', icon: 'person' };
        }
        if (schemaId === 'location-v1') {
          return { id: 'location-v1', name: 'Location', icon: 'place' };
        }
        return null;
      }),
    };

    // Mock SystemConfigService to prevent real API calls
    const systemConfigMock = {
      systemFeatures: signal({
        aiLinting: false,
        aiImageGeneration: false,
        userApprovalRequired: false,
        appMode: 'local',
      }),
      isAiLintingEnabled: signal(false),
      isAiImageGenerationEnabled: signal(false),
      isUserApprovalRequired: signal(false),
      isConfigLoaded: signal(true),
    };

    await TestBed.configureTestingModule({
      imports: [MetaPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        { provide: SystemConfigService, useValue: systemConfigMock },
        { provide: RelationshipService, useValue: relationshipServiceMock },
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: MatDialog, useValue: dialogMock },
        { provide: ElementRefService, useValue: elementRefServiceMock },
        { provide: WorldbuildingService, useValue: worldbuildingServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MetaPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('documentId', 'test-doc-id');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('toggle', () => {
    it('should emit openChange with true when panel is closed', async () => {
      fixture.componentRef.setInput('isOpen', false);
      await fixture.whenStable();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.toggle();

      expect(openChangeSpy).toHaveBeenCalledWith(true);
    });

    it('should emit openChange with false when panel is open', async () => {
      fixture.componentRef.setInput('isOpen', true);
      await fixture.whenStable();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.toggle();

      expect(openChangeSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('open', () => {
    it('should emit openChange with true when closed', async () => {
      fixture.componentRef.setInput('isOpen', false);
      await fixture.whenStable();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.open();

      expect(openChangeSpy).toHaveBeenCalledWith(true);
    });

    it('should not emit when already open', async () => {
      fixture.componentRef.setInput('isOpen', true);
      await fixture.whenStable();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.open();

      expect(openChangeSpy).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should emit openChange with false when open', async () => {
      fixture.componentRef.setInput('isOpen', true);
      await fixture.whenStable();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.close();

      expect(openChangeSpy).toHaveBeenCalledWith(false);
    });

    it('should not emit when already closed', async () => {
      fixture.componentRef.setInput('isOpen', false);
      await fixture.whenStable();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.close();

      expect(openChangeSpy).not.toHaveBeenCalled();
    });
  });

  describe('relationship grouping', () => {
    it('should have no relationships when service returns empty', () => {
      expect(component.hasRelationships()).toBe(false);
      expect(component.groupedRelationships().length).toBe(0);
    });

    it('should group outgoing relationships by type', () => {
      // Set up relationships
      relationshipServiceMock.relationships.set([
        {
          id: 'rel-1',
          sourceElementId: 'test-doc-id',
          targetElementId: 'char-1',
          relationshipTypeId: 'parent',
        },
        {
          id: 'rel-2',
          sourceElementId: 'test-doc-id',
          targetElementId: 'char-2',
          relationshipTypeId: 'parent',
        },
      ]);
      relationshipServiceMock.allTypes.set([
        {
          id: 'parent',
          name: 'Parent',
          inverseLabel: 'Child of',
          showInverse: true,
          category: RelationshipCategory.Familial,
          isBuiltIn: true,
          sourceEndpoint: { allowedSchemas: [] },
          targetEndpoint: { allowedSchemas: [] },
        },
      ]);

      fixture.detectChanges();

      const groups = component.groupedRelationships();
      expect(groups.length).toBe(1);
      expect(groups[0].displayLabel).toBe('Parent');
      expect(groups[0].relationships.length).toBe(2);
      expect(groups[0].isIncoming).toBe(false);
    });

    it('should group incoming relationships separately', () => {
      // Set up relationships
      relationshipServiceMock.relationships.set([
        {
          id: 'rel-1',
          sourceElementId: 'other-char',
          targetElementId: 'test-doc-id',
          relationshipTypeId: 'parent',
        },
      ]);
      relationshipServiceMock.allTypes.set([
        {
          id: 'parent',
          name: 'Parent',
          inverseLabel: 'Child of',
          showInverse: true,
          category: RelationshipCategory.Familial,
          isBuiltIn: true,
          sourceEndpoint: { allowedSchemas: [] },
          targetEndpoint: { allowedSchemas: [] },
        },
      ]);

      fixture.detectChanges();

      const groups = component.groupedRelationships();
      expect(groups.length).toBe(1);
      expect(groups[0].displayLabel).toBe('Child of');
      expect(groups[0].isIncoming).toBe(true);
    });

    it('should not show incoming relationships when showInverse is false', () => {
      relationshipServiceMock.relationships.set([
        {
          id: 'rel-1',
          sourceElementId: 'other-char',
          targetElementId: 'test-doc-id',
          relationshipTypeId: 'brother',
        },
      ]);
      relationshipServiceMock.allTypes.set([
        {
          id: 'brother',
          name: 'Brother',
          inverseLabel: 'Brother of',
          showInverse: false,
          category: RelationshipCategory.Familial,
          isBuiltIn: true,
          sourceEndpoint: { allowedSchemas: [] },
          targetEndpoint: { allowedSchemas: [] },
        },
      ]);

      fixture.detectChanges();

      const groups = component.groupedRelationships();
      expect(groups.length).toBe(0);
    });
  });

  describe('element helpers', () => {
    it('should get element name', () => {
      projectStateMock.elements.set([{ id: 'char-1', name: 'Test Character' }]);
      fixture.detectChanges();

      expect(component.getElementName('char-1')).toBe('Test Character');
    });

    it('should return Unknown for missing element', () => {
      expect(component.getElementName('non-existent')).toBe('Unknown');
    });

    it('should get element icon based on type', () => {
      projectStateMock.elements.set([
        { id: 'folder-1', name: 'Test Folder', type: 'FOLDER' },
        {
          id: 'wb-1',
          name: 'Test Worldbuilding',
          type: 'WORLDBUILDING',
          schemaId: 'character-v1',
        },
        { id: 'item-1', name: 'Test Item', type: 'ITEM' },
      ]);
      fixture.detectChanges();

      expect(component.getElementIcon('folder-1')).toBe('folder');
      expect(component.getElementIcon('item-1')).toBe('description');
      // Worldbuilding elements should get their icon from the schema
      expect(component.getElementIcon('wb-1')).toBe('person');
      expect(component.getElementIcon('non-existent')).toBe('link');
    });

    it('should return category for worldbuilding elements without schema', () => {
      projectStateMock.elements.set([
        {
          id: 'wb-no-schema',
          name: 'No Schema Worldbuilding',
          type: 'WORLDBUILDING',
          schemaId: 'unknown-schema',
        },
      ]);
      fixture.detectChanges();

      expect(component.getElementIcon('wb-no-schema')).toBe('category');
    });
  });

  describe('getGroupKey', () => {
    it('should generate unique key for relationship groups', () => {
      const mockType: RelationshipTypeDefinition = {
        id: 'parent',
        name: 'Parent',
        inverseLabel: 'Child of',
        showInverse: true,
        category: RelationshipCategory.Familial,
        isBuiltIn: true,
        sourceEndpoint: { allowedSchemas: [] },
        targetEndpoint: { allowedSchemas: [] },
      };

      const outgoingGroup = {
        type: mockType,
        isIncoming: false,
        relationships: [],
        displayLabel: 'Parent',
      };
      const incomingGroup = {
        type: mockType,
        isIncoming: true,
        relationships: [],
        displayLabel: 'Child of',
      };

      expect(component.getGroupKey(outgoingGroup)).toBe('parent-out');
      expect(component.getGroupKey(incomingGroup)).toBe('parent-in');
    });
  });

  describe('navigateToElement', () => {
    it('should open target element for outgoing relationship', () => {
      const targetElement = {
        id: 'char-2',
        name: 'Target Char',
        type: 'Character',
      };
      projectStateMock.elements.set([targetElement]);
      fixture.detectChanges();

      const relationship: ElementRelationship = {
        id: 'rel-1',
        sourceElementId: 'test-doc-id',
        targetElementId: 'char-2',
        relationshipTypeId: 'parent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      component.navigateToElement(relationship, false);

      expect(projectStateMock.openDocument).toHaveBeenCalledWith(targetElement);
    });

    it('should open source element for incoming relationship', () => {
      const sourceElement = {
        id: 'char-1',
        name: 'Source Char',
        type: 'Character',
      };
      projectStateMock.elements.set([sourceElement]);
      fixture.detectChanges();

      const relationship: ElementRelationship = {
        id: 'rel-1',
        sourceElementId: 'char-1',
        targetElementId: 'test-doc-id',
        relationshipTypeId: 'parent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      component.navigateToElement(relationship, true);

      expect(projectStateMock.openDocument).toHaveBeenCalledWith(sourceElement);
    });

    it('should not navigate if element not found', () => {
      projectStateMock.elements.set([]);
      fixture.detectChanges();

      const relationship: ElementRelationship = {
        id: 'rel-1',
        sourceElementId: 'test-doc-id',
        targetElementId: 'non-existent',
        relationshipTypeId: 'parent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      component.navigateToElement(relationship, false);

      expect(projectStateMock.openDocument).not.toHaveBeenCalled();
    });
  });

  describe('deleteRelationship', () => {
    it('should call removeRelationship and stop event propagation', () => {
      relationshipServiceMock.removeRelationship = vi.fn();
      fixture.detectChanges();

      const mockEvent = {
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent;

      const relationship: ElementRelationship = {
        id: 'rel-123',
        sourceElementId: 'test-doc-id',
        targetElementId: 'char-1',
        relationshipTypeId: 'parent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      component.deleteRelationship(relationship, mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(relationshipServiceMock.removeRelationship).toHaveBeenCalledWith(
        'rel-123'
      );
    });
  });

  describe('openAddRelationshipDialog', () => {
    it('should open the add relationship dialog', () => {
      relationshipServiceMock.allTypes.set([
        {
          id: 'parent',
          name: 'Parent',
          inverseLabel: 'Child of',
          showInverse: true,
          category: RelationshipCategory.Familial,
          isBuiltIn: true,
          sourceEndpoint: { allowedSchemas: [] },
          targetEndpoint: { allowedSchemas: [] },
        },
      ]);
      fixture.detectChanges();

      component.openAddRelationshipDialog();

      expect(dialogMock.open).toHaveBeenCalled();
    });

    it('should add relationship when dialog returns result', () => {
      const dialogResult = {
        targetElementId: 'char-2',
        relationshipTypeId: 'parent',
        note: 'A note',
      };
      dialogMock.open.mockReturnValue({
        afterClosed: () => of(dialogResult),
      });
      relationshipServiceMock.allTypes.set([]);
      fixture.detectChanges();

      component.openAddRelationshipDialog();

      expect(relationshipServiceMock.addRelationship).toHaveBeenCalledWith(
        'test-doc-id',
        'char-2',
        'parent',
        { note: 'A note' }
      );
    });

    it('should not add relationship when dialog is cancelled', () => {
      dialogMock.open.mockReturnValue({
        afterClosed: () => of(null),
      });
      relationshipServiceMock.allTypes.set([]);
      fixture.detectChanges();

      component.openAddRelationshipDialog();

      expect(relationshipServiceMock.addRelationship).not.toHaveBeenCalled();
    });
  });

  describe('tooltip methods', () => {
    let elementRefServiceMock: {
      showTooltip: ReturnType<typeof vi.fn>;
      hideTooltip: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      elementRefServiceMock = TestBed.inject(ElementRefService) as any;
      vi.spyOn(elementRefServiceMock, 'showTooltip');
      vi.spyOn(elementRefServiceMock, 'hideTooltip');
    });

    it('should call hideTooltip', () => {
      component.hideTooltip();
      expect(elementRefServiceMock.hideTooltip).toHaveBeenCalled();
    });

    it('should call showTooltip with element data', () => {
      const testElement = {
        id: 'char-1',
        name: 'Test Char',
        type: 'CHARACTER',
      };
      projectStateMock.elements.set([testElement]);
      fixture.detectChanges();

      const mockEvent = {
        currentTarget: {
          getBoundingClientRect: () => ({ left: 100, bottom: 200 }),
        },
      } as unknown as MouseEvent;

      component.showTooltipForElement('char-1', mockEvent);

      expect(elementRefServiceMock.showTooltip).toHaveBeenCalledWith({
        elementId: 'char-1',
        elementType: 'CHARACTER',
        displayText: 'Test Char',
        originalName: 'Test Char',
        position: { x: 100, y: 204 },
      });
    });

    it('should not call showTooltip for unknown element', () => {
      projectStateMock.elements.set([]);
      fixture.detectChanges();

      const mockEvent = {
        currentTarget: {
          getBoundingClientRect: () => ({ left: 100, bottom: 200 }),
        },
      } as unknown as MouseEvent;

      component.showTooltipForElement('non-existent', mockEvent);

      expect(elementRefServiceMock.showTooltip).not.toHaveBeenCalled();
    });
  });

  describe('collapsed/expanded state', () => {
    it('should start in collapsed state', () => {
      expect(component.isExpanded()).toBe(false);
    });

    it('should toggle expanded state', () => {
      component.toggleExpanded();
      expect(component.isExpanded()).toBe(true);

      component.toggleExpanded();
      expect(component.isExpanded()).toBe(false);
    });

    it('should provide total relationships count', () => {
      relationshipServiceMock.relationships.set([
        {
          id: 'rel-1',
          sourceElementId: 'test-doc-id',
          targetElementId: 'other-1',
          relationshipTypeId: 'related_to',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'rel-2',
          sourceElementId: 'test-doc-id',
          targetElementId: 'other-2',
          relationshipTypeId: 'related_to',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'rel-3',
          sourceElementId: 'other-3',
          targetElementId: 'test-doc-id',
          relationshipTypeId: 'related_to',
          createdAt: new Date().toISOString(),
        },
      ]);
      fixture.detectChanges();

      expect(component.outgoingCount()).toBe(2);
      expect(component.incomingCount()).toBe(1);
      expect(component.totalRelationshipsCount()).toBe(3);
    });

    it('should provide relationships summary', () => {
      relationshipServiceMock.relationships.set([]);
      fixture.detectChanges();
      expect(component.getRelationshipsSummary()).toBe('No relationships');

      relationshipServiceMock.relationships.set([
        {
          id: 'rel-1',
          sourceElementId: 'test-doc-id',
          targetElementId: 'other-1',
          relationshipTypeId: 'related_to',
          createdAt: new Date().toISOString(),
        },
      ]);
      fixture.detectChanges();
      expect(component.getRelationshipsSummary()).toBe('1 outgoing');

      relationshipServiceMock.relationships.set([
        {
          id: 'rel-1',
          sourceElementId: 'other-1',
          targetElementId: 'test-doc-id',
          relationshipTypeId: 'related_to',
          createdAt: new Date().toISOString(),
        },
      ]);
      fixture.detectChanges();
      expect(component.getRelationshipsSummary()).toBe('1 incoming');

      relationshipServiceMock.relationships.set([
        {
          id: 'rel-1',
          sourceElementId: 'test-doc-id',
          targetElementId: 'other-1',
          relationshipTypeId: 'related_to',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'rel-2',
          sourceElementId: 'other-2',
          targetElementId: 'test-doc-id',
          relationshipTypeId: 'related_to',
          createdAt: new Date().toISOString(),
        },
      ]);
      fixture.detectChanges();
      expect(component.getRelationshipsSummary()).toBe(
        '1 outgoing, 1 incoming'
      );
    });
  });
});
