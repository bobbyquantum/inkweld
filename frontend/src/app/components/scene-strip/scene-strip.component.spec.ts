import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { type Element, ElementType } from '@inkweld/index';
import { type ElementRelationship } from '@models/element-ref.model';
import { GREGORIAN_SYSTEM } from '@models/time-system';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import {
  SCENE_LOCATION_RELATIONSHIP_TYPE,
  SCENE_POV_RELATIONSHIP_TYPE,
} from '@services/relationship/scene-relationship-types';
import { TimeSystemLibraryService } from '@services/timeline/time-system-library.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { SceneStripComponent } from './scene-strip.component';

describe('SceneStripComponent', () => {
  let fixture: ComponentFixture<SceneStripComponent>;
  let component: SceneStripComponent;

  const scene: Element = {
    id: 'scene-1',
    name: 'The Gate',
    type: ElementType.Item,
    parentId: null,
    order: 0,
    level: 0,
    expandable: false,
    version: 1,
    metadata: { role: 'scene', status: 'draft', wordTarget: '1000' },
  };
  const mira: Element = {
    id: 'mira',
    name: 'Mira',
    type: ElementType.Worldbuilding,
    schemaId: 'character-v1',
    parentId: null,
    order: 1,
    level: 0,
    expandable: false,
    version: 1,
    metadata: {},
  };
  const harbour: Element = {
    id: 'harbour',
    name: 'Harbour',
    type: ElementType.Worldbuilding,
    schemaId: 'location-v1',
    parentId: null,
    order: 2,
    level: 0,
    expandable: false,
    version: 1,
    metadata: {},
  };

  let elements: ReturnType<typeof signal<Element[]>>;
  let relationships: ReturnType<typeof signal<ElementRelationship[]>>;
  let canWrite: ReturnType<typeof signal<boolean>>;
  let wordCount: ReturnType<typeof signal<number>>;
  let projectState: {
    elements: typeof elements;
    canWrite: typeof canWrite;
    updateElementMetadata: ReturnType<typeof vi.fn>;
    openDocument: ReturnType<typeof vi.fn>;
  };
  let relationshipService: {
    relationships: typeof relationships;
    addRelationship: ReturnType<typeof vi.fn>;
    removeRelationship: ReturnType<typeof vi.fn>;
    getTypeById: ReturnType<typeof vi.fn>;
    addRawType: ReturnType<typeof vi.fn>;
  };
  let dialogGateway: {
    openElementPickerDialog: ReturnType<typeof vi.fn>;
    openSceneDetailsDialog: ReturnType<typeof vi.fn>;
  };
  let timeSystems: ReturnType<typeof signal<(typeof GREGORIAN_SYSTEM)[]>>;

  const rel = (
    id: string,
    typeId: string,
    targetElementId: string
  ): ElementRelationship => ({
    id,
    sourceElementId: 'scene-1',
    targetElementId,
    relationshipTypeId: typeId,
    createdAt: '',
    updatedAt: '',
  });

  beforeEach(async () => {
    elements = signal<Element[]>([scene, mira, harbour]);
    relationships = signal<ElementRelationship[]>([]);
    canWrite = signal(true);
    wordCount = signal(250);
    timeSystems = signal([GREGORIAN_SYSTEM]);

    projectState = {
      elements,
      canWrite,
      updateElementMetadata: vi.fn(),
      openDocument: vi.fn(),
    };
    relationshipService = {
      relationships,
      addRelationship: vi.fn(),
      removeRelationship: vi.fn(),
      getTypeById: vi.fn().mockReturnValue(undefined),
      addRawType: vi.fn(),
    };
    dialogGateway = {
      openElementPickerDialog: vi.fn(),
      openSceneDetailsDialog: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SceneStripComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: projectState },
        { provide: RelationshipService, useValue: relationshipService },
        { provide: DialogGatewayService, useValue: dialogGateway },
        {
          provide: DocumentService,
          useValue: { getWordCountSignal: vi.fn(() => wordCount) },
        },
        {
          provide: TimeSystemLibraryService,
          useValue: {
            systems: timeSystems,
            resolveSystem: (id: string) =>
              id === GREGORIAN_SYSTEM.id ? GREGORIAN_SYSTEM : null,
          },
        },
        {
          provide: WorldbuildingService,
          useValue: { getSchemaIcon: vi.fn().mockReturnValue('category') },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SceneStripComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('elementId', 'scene-1');
    fixture.componentRef.setInput('documentId', 'user:proj:scene-1');
    await fixture.whenStable();
  });

  it('renders for a scene', () => {
    expect(component.visible()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[data-testid="scene-strip"]')
    ).not.toBeNull();
  });

  it('does not render for notes or legacy documents', async () => {
    elements.set([{ ...scene, metadata: { role: 'note' } }]);
    await fixture.whenStable();
    expect(component.visible()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[data-testid="scene-strip"]')
    ).toBeNull();

    elements.set([{ ...scene, metadata: {} }]);
    await fixture.whenStable();
    expect(component.visible()).toBe(false);
  });

  it('shows word count against target with progress', () => {
    expect(component.wordCount()).toBe(250);
    expect(component.progress()).toBe(25);
    const words: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="scene-strip-words"]'
    );
    expect(words.textContent).toContain('250');
    expect(words.textContent).toContain('1,000');
  });

  it('caps progress at 100 and hides it without a target', async () => {
    wordCount.set(5000);
    expect(component.progress()).toBe(100);
    elements.set([{ ...scene, metadata: { role: 'scene' } }]);
    await fixture.whenStable();
    expect(component.progress()).toBeNull();
  });

  it('writes status changes as metadata', () => {
    component.setStatus('final');
    expect(projectState.updateElementMetadata).toHaveBeenCalledWith('scene-1', {
      status: 'final',
    });
    component.setStatus(null);
    expect(projectState.updateElementMetadata).toHaveBeenLastCalledWith(
      'scene-1',
      { status: '' }
    );
  });

  it('resolves POV and location from relationships', async () => {
    relationships.set([
      rel('r1', SCENE_POV_RELATIONSHIP_TYPE, 'mira'),
      rel('r2', SCENE_LOCATION_RELATIONSHIP_TYPE, 'harbour'),
      rel('r3', SCENE_POV_RELATIONSHIP_TYPE, 'missing'),
    ]);
    await fixture.whenStable();
    expect(component.povElements().map(e => e.id)).toEqual(['mira']);
    expect(component.locationElements().map(e => e.id)).toEqual(['harbour']);
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="scene-strip-pov-mira"]'
      )
    ).not.toBeNull();
  });

  it('picks a POV character, replacing any existing one and seeding types', async () => {
    relationships.set([rel('old', SCENE_POV_RELATIONSHIP_TYPE, 'harbour')]);
    dialogGateway.openElementPickerDialog.mockResolvedValue({
      elements: [mira],
    });

    await component.pick('pov');

    expect(dialogGateway.openElementPickerDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        filterType: ElementType.Worldbuilding,
        maxSelections: 1,
      })
    );
    expect(relationshipService.addRawType).toHaveBeenCalledTimes(2);
    expect(relationshipService.removeRelationship).toHaveBeenCalledWith('old');
    expect(relationshipService.addRelationship).toHaveBeenCalledWith(
      'scene-1',
      'mira',
      SCENE_POV_RELATIONSHIP_TYPE
    );
  });

  it('does nothing when the picker is cancelled', async () => {
    dialogGateway.openElementPickerDialog.mockResolvedValue(undefined);
    await component.pick('location');
    expect(relationshipService.addRelationship).not.toHaveBeenCalled();
  });

  it('clears only the requested link kind', async () => {
    relationships.set([
      rel('r1', SCENE_POV_RELATIONSHIP_TYPE, 'mira'),
      rel('r2', SCENE_LOCATION_RELATIONSHIP_TYPE, 'harbour'),
    ]);
    await fixture.whenStable();
    component.clear('location');
    expect(relationshipService.removeRelationship).toHaveBeenCalledTimes(1);
    expect(relationshipService.removeRelationship).toHaveBeenCalledWith('r2');
  });

  it('formats the story date with its time system', async () => {
    elements.set([
      {
        ...scene,
        metadata: {
          role: 'scene',
          storyDate: JSON.stringify({
            systemId: GREGORIAN_SYSTEM.id,
            units: ['1999', '1', '3'],
          }),
        },
      },
    ]);
    await fixture.whenStable();
    expect(component.storyDateLabel()).toContain('1999');
  });

  it('falls back to raw units when the time system is unknown', async () => {
    elements.set([
      {
        ...scene,
        metadata: {
          role: 'scene',
          storyDate: JSON.stringify({ systemId: 'nope', units: ['4', '2'] }),
        },
      },
    ]);
    await fixture.whenStable();
    expect(component.storyDateLabel()).toBe('4-2');
  });

  it('applies the details dialog patch', async () => {
    dialogGateway.openSceneDetailsDialog.mockResolvedValue({
      patch: { synopsis: 'Mira arrives.', wordTarget: '1500' },
    });
    await component.openDetails();
    expect(dialogGateway.openSceneDetailsDialog).toHaveBeenCalledWith({
      elementName: 'The Gate',
      metadata: scene.metadata,
      timeSystems: [GREGORIAN_SYSTEM],
    });
    expect(projectState.updateElementMetadata).toHaveBeenCalledWith('scene-1', {
      synopsis: 'Mira arrives.',
      wordTarget: '1500',
    });
  });

  it('is inert for read-only collaborators', async () => {
    canWrite.set(false);
    component.setStatus('final');
    await component.pick('pov');
    component.clear('pov');
    await component.openDetails();
    expect(projectState.updateElementMetadata).not.toHaveBeenCalled();
    expect(dialogGateway.openElementPickerDialog).not.toHaveBeenCalled();
    expect(dialogGateway.openSceneDetailsDialog).not.toHaveBeenCalled();
  });

  it('opens linked elements', () => {
    component.open(mira);
    expect(projectState.openDocument).toHaveBeenCalledWith(mira);
  });
});
