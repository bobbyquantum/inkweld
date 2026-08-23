import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ElementRefService } from '@components/element-ref/element-ref.service';
import { type Element, ElementType } from '@inkweld/index';
import { type ElementRelationship } from '@models/element-ref.model';
import { FieldType } from '@models/schema-types';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { AppearanceService } from '@services/worldbuilding/appearance.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { RelationshipFieldComponent } from './relationship-field.component';

describe('RelationshipFieldComponent', () => {
  let component: RelationshipFieldComponent;
  let fixture: ComponentFixture<RelationshipFieldComponent>;

  const field = {
    key: 'mother',
    label: 'Mother',
    type: FieldType.RELATIONSHIP,
    relationshipTypeId: 'fieldrel-mother',
    targetSchemaId: 'character-v1',
  };

  const hero: Element = {
    id: 'hero',
    name: 'Hero',
    type: ElementType.Worldbuilding,
    schemaId: 'character-v1',
    parentId: null,
    order: 0,
    level: 0,
    expandable: false,
    version: 1,
    metadata: {},
  };

  const mother: Element = {
    id: 'mother-el',
    name: 'Mother',
    type: ElementType.Worldbuilding,
    schemaId: 'character-v1',
    parentId: null,
    order: 1,
    level: 0,
    expandable: false,
    version: 1,
    metadata: {},
  };

  let elements: Element[];
  let relationships: ElementRelationship[];

  let projectState: { elements: ReturnType<typeof signal<Element[]>> };
  let relationshipService: {
    relationships: ReturnType<typeof signal<ElementRelationship[]>>;
    addRelationship: ReturnType<typeof vi.fn>;
    removeRelationship: ReturnType<typeof vi.fn>;
  };
  let worldbuildingService: {
    getSchemaIcon: ReturnType<typeof vi.fn>;
    getIdentityData: ReturnType<typeof vi.fn>;
  };
  let dialogGateway: { openElementPickerDialog: ReturnType<typeof vi.fn> };
  let elementRefService: {
    showTooltip: ReturnType<typeof vi.fn>;
    hideTooltip: ReturnType<typeof vi.fn>;
  };
  let appearanceService: { resolveImageReference: ReturnType<typeof vi.fn> };

  const makeRel = (
    id: string,
    sourceElementId: string,
    targetElementId: string,
    relationshipTypeId = 'fieldrel-mother'
  ): ElementRelationship => ({
    id,
    sourceElementId,
    targetElementId,
    relationshipTypeId,
    createdAt: '',
    updatedAt: '',
  });

  beforeEach(async () => {
    elements = [hero, mother];
    relationships = [];

    projectState = { elements: signal<Element[]>(elements) };
    relationshipService = {
      relationships: signal<ElementRelationship[]>(relationships),
      addRelationship: vi.fn(),
      removeRelationship: vi.fn(),
    };
    worldbuildingService = {
      getSchemaIcon: vi.fn().mockReturnValue('person'),
      getIdentityData: vi.fn().mockResolvedValue({ image: null }),
    };
    dialogGateway = {
      openElementPickerDialog: vi.fn().mockResolvedValue(null),
    };
    elementRefService = { showTooltip: vi.fn(), hideTooltip: vi.fn() };
    appearanceService = {
      resolveImageReference: vi.fn().mockResolvedValue(null),
    };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), RelationshipFieldComponent],
      providers: [
        { provide: ProjectStateService, useValue: projectState },
        { provide: RelationshipService, useValue: relationshipService },
        { provide: WorldbuildingService, useValue: worldbuildingService },
        { provide: DialogGatewayService, useValue: dialogGateway },
        { provide: ElementRefService, useValue: elementRefService },
        { provide: AppearanceService, useValue: appearanceService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RelationshipFieldComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('field', field);
    fixture.componentRef.setInput('sourceElementId', 'hero');
    fixture.componentRef.setInput('username', 'user');
    fixture.componentRef.setInput('slug', 'proj');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show the add button when no element is linked', () => {
    expect(
      fixture.nativeElement.querySelector('[data-testid="rel-add"]')
    ).not.toBeNull();
  });

  it('should not show the add button when readOnly', () => {
    fixture.componentRef.setInput('readOnly', true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="rel-add"]')
    ).toBeNull();
  });

  it('should render a card for each linked element', () => {
    relationships.push(makeRel('r1', 'hero', 'mother-el'));
    relationshipService.relationships.set([...relationships]);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector(
      '[data-testid="rel-card-mother-el"]'
    );
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Mother');
  });

  it('should ignore relationships of other types', () => {
    relationships.push(makeRel('r1', 'hero', 'mother-el', 'other-type'));
    relationshipService.relationships.set([...relationships]);
    fixture.detectChanges();

    expect(component.linkedRelationships()).toHaveLength(0);
  });

  it('should ignore relationships from other source elements', () => {
    relationships.push(makeRel('r1', 'someone-else', 'mother-el'));
    relationshipService.relationships.set([...relationships]);
    fixture.detectChanges();

    expect(component.linkedRelationships()).toHaveLength(0);
  });

  it('should render a deleted placeholder for a missing target', () => {
    relationships.push(makeRel('r1', 'hero', 'ghost-id'));
    relationshipService.relationships.set([...relationships]);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="rel-card-deleted-ghost-id"]'
      )
    ).not.toBeNull();
  });

  it('should add a relationship when a single element is picked', async () => {
    dialogGateway.openElementPickerDialog.mockResolvedValue({
      elements: [mother],
    });

    await component.openPicker();

    expect(relationshipService.addRelationship).toHaveBeenCalledWith(
      'hero',
      'mother-el',
      'fieldrel-mother'
    );
  });

  it('should pass the target schema filter to the picker', async () => {
    dialogGateway.openElementPickerDialog.mockResolvedValue(null);

    await component.openPicker();

    expect(dialogGateway.openElementPickerDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        filterType: ElementType.Worldbuilding,
        filterSchemaId: 'character-v1',
        maxSelections: 1,
      })
    );
  });

  it('should replace the existing link in single mode', async () => {
    relationships.push(makeRel('r1', 'hero', 'mother-el'));
    relationshipService.relationships.set([...relationships]);

    const other: Element = { ...mother, id: 'other-el', name: 'Other' };
    elements.push(other);
    projectState.elements.set([...elements]);
    dialogGateway.openElementPickerDialog.mockResolvedValue({
      elements: [other],
    });

    await component.openPicker();

    expect(relationshipService.removeRelationship).toHaveBeenCalledWith('r1');
    expect(relationshipService.addRelationship).toHaveBeenCalledWith(
      'hero',
      'other-el',
      'fieldrel-mother'
    );
  });

  it('should remove a link via removeLink', () => {
    relationships.push(makeRel('r1', 'hero', 'mother-el'));
    relationshipService.relationships.set([...relationships]);
    fixture.detectChanges();

    component.removeLink('mother-el');

    expect(relationshipService.removeRelationship).toHaveBeenCalledWith('r1');
  });

  it('should show a change button instead of add when a single link exists', () => {
    relationships.push(makeRel('r1', 'hero', 'mother-el'));
    relationshipService.relationships.set([...relationships]);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="rel-add"]')
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="rel-change"]')
    ).not.toBeNull();
  });

  it('should always show the add button for multiple fields', () => {
    fixture.componentRef.setInput('field', { ...field, multiple: true });
    relationships.push(makeRel('r1', 'hero', 'mother-el'));
    relationshipService.relationships.set([...relationships]);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="rel-add"]')
    ).not.toBeNull();
  });

  it('should navigate to the element when the card is clicked', () => {
    relationships.push(makeRel('r1', 'hero', 'mother-el'));
    relationshipService.relationships.set([...relationships]);
    fixture.detectChanges();

    const openDocument = vi.fn();
    (projectState as { openDocument?: ReturnType<typeof vi.fn> }).openDocument =
      openDocument;

    const card = fixture.nativeElement.querySelector(
      '[data-testid="rel-open-mother-el"]'
    ) as HTMLButtonElement;
    expect(card.tagName).toBe('BUTTON');
    card.click();

    expect(openDocument).toHaveBeenCalledWith(mother);
  });

  it('should show the tooltip on hover', () => {
    relationships.push(makeRel('r1', 'hero', 'mother-el'));
    relationshipService.relationships.set([...relationships]);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector(
      '[data-testid="rel-open-mother-el"]'
    ) as HTMLElement;
    card.dispatchEvent(new MouseEvent('mouseenter'));

    expect(elementRefService.showTooltip).toHaveBeenCalledWith(
      expect.objectContaining({ elementId: 'mother-el' })
    );

    card.dispatchEvent(new MouseEvent('mouseleave'));
    expect(elementRefService.hideTooltip).toHaveBeenCalled();
  });

  it('should emit linksChange after applying links', async () => {
    const emitted: string[][] = [];
    component.linksChange.subscribe(ids => emitted.push(ids));

    dialogGateway.openElementPickerDialog.mockResolvedValue({
      elements: [mother],
    });
    await component.openPicker();

    expect(emitted).toEqual([['mother-el']]);
  });
});
