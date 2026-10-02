import { type Provider, signal, type WritableSignal } from '@angular/core';
import { type Element, ElementType } from '@inkweld/index';
import { type ElementRelationship } from '@models/element-ref.model';
import { GREGORIAN_SYSTEM } from '@models/time-system';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ElementTreeService } from '@services/project/element-tree.service';
import { ProjectStateService } from '@services/project/project-state.service';
import {
  PublishPlanStatsService,
  type WordCountEntry,
} from '@services/publish/publish-plan-stats.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import {
  SCENE_LOCATION_RELATIONSHIP_TYPE,
  SCENE_POV_RELATIONSHIP_TYPE,
} from '@services/relationship/scene-relationship-types';
import { TimeSystemLibraryService } from '@services/timeline/time-system-library.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';
import { type Mock, vi } from 'vitest';

/** Build an element with sensible defaults for the fields tests ignore. */
export function overviewElement(
  id: string,
  type: ElementType,
  level: number,
  parentId: string | null,
  metadata: Record<string, string> = {},
  extra: Partial<Element> = {}
): Element {
  return {
    id,
    name: id,
    type,
    parentId,
    order: 0,
    level,
    expandable: type === ElementType.Folder,
    version: 1,
    metadata,
    ...extra,
  };
}

/**
 * A small manuscript:
 *
 * ```
 * book            (folder)
 * ├─ opening      (scene, draft, target 1000, POV mira, set in harbour)
 * ├─ chapter      (folder)
 * │  ├─ storm     (scene, final, target 500)
 * │  └─ research  (note)
 * ├─ loose        (role-less document)
 * └─ map          (canvas)
 * mira, harbour   (worldbuilding, outside the folder)
 * ```
 */
export function overviewManuscript(): Element[] {
  const { Folder, Item, Canvas, Worldbuilding } = ElementType;
  return [
    overviewElement('book', Folder, 0, null),
    overviewElement('opening', Item, 1, 'book', {
      role: 'scene',
      status: 'draft',
      synopsis: 'Mira arrives.',
      wordTarget: '1000',
      storyDate: JSON.stringify({
        systemId: GREGORIAN_SYSTEM.id,
        units: ['2024', '3', '9'],
      }),
    }),
    overviewElement('chapter', Folder, 1, 'book', { synopsis: 'At sea.' }),
    overviewElement('storm', Item, 2, 'chapter', {
      role: 'scene',
      status: 'final',
      wordTarget: '500',
    }),
    overviewElement('research', Item, 2, 'chapter', { role: 'note' }),
    overviewElement('loose', Item, 1, 'book'),
    overviewElement('map', Canvas, 1, 'book'),
    overviewElement('mira', Worldbuilding, 0, null, {}, { schemaId: 'c-v1' }),
    overviewElement(
      'harbour',
      Worldbuilding,
      0,
      null,
      {},
      { schemaId: 'l-v1' }
    ),
  ].map((element, order) => ({ ...element, order }));
}

export interface SceneOverviewHarness {
  providers: Provider[];
  elements: WritableSignal<Element[]>;
  relationships: WritableSignal<ElementRelationship[]>;
  canWrite: WritableSignal<boolean>;
  wordCounts: WritableSignal<ReadonlyMap<string, WordCountEntry>>;
  projectState: {
    updateElementMetadata: Mock;
    openDocument: Mock;
    moveElement: Mock;
    setDocumentRole: Mock;
    showNewElementDialog: Mock;
  };
  stats: { ensureCounted: Mock; recount: Mock };
  dialogGateway: { openSceneDetailsDialog: Mock };
}

/**
 * Providers that back a real `SceneOverviewService` with signal-driven
 * fakes. `moveElement` runs the real tree logic so tests can assert the
 * resulting order.
 */
export function sceneOverviewHarness(): SceneOverviewHarness {
  const elements = signal<Element[]>(overviewManuscript());
  const canWrite = signal(true);
  const wordCounts = signal<ReadonlyMap<string, WordCountEntry>>(
    new Map<string, WordCountEntry>([
      ['opening', { status: 'ready', words: 250 }],
      ['storm', { status: 'ready', words: 600 }],
      ['research', { status: 'ready', words: 40 }],
      ['loose', { status: 'ready', words: 10 }],
    ])
  );
  const rel = (
    id: string,
    relationshipTypeId: string,
    targetElementId: string
  ): ElementRelationship => ({
    id,
    sourceElementId: 'opening',
    targetElementId,
    relationshipTypeId,
    createdAt: '',
    updatedAt: '',
  });
  const relationships = signal<ElementRelationship[]>([
    rel('r1', SCENE_POV_RELATIONSHIP_TYPE, 'mira'),
    rel('r2', SCENE_LOCATION_RELATIONSHIP_TYPE, 'harbour'),
    rel('r3', 'friend-of', 'harbour'),
    rel('r4', SCENE_POV_RELATIONSHIP_TYPE, 'deleted-element'),
  ]);

  const tree = new ElementTreeService();
  const projectState = {
    elements,
    canWrite,
    isLoading: signal(false),
    error: signal<string | undefined>(undefined),
    updateElementMetadata: vi.fn(),
    openDocument: vi.fn(),
    setDocumentRole: vi.fn(),
    showNewElementDialog: vi.fn(),
    moveElement: vi.fn((id: string, targetIndex: number, level: number) => {
      elements.set(tree.moveElement(elements(), id, targetIndex, level));
    }),
  };
  const stats = {
    wordCounts,
    ensureCounted: vi.fn(),
    recount: vi.fn(),
  };
  const dialogGateway = { openSceneDetailsDialog: vi.fn() };

  return {
    elements,
    relationships,
    canWrite,
    wordCounts,
    projectState,
    stats,
    dialogGateway,
    providers: [
      { provide: ProjectStateService, useValue: projectState },
      { provide: RelationshipService, useValue: { relationships } },
      { provide: PublishPlanStatsService, useValue: stats },
      { provide: DialogGatewayService, useValue: dialogGateway },
      {
        provide: TimeSystemLibraryService,
        useValue: {
          systems: signal([GREGORIAN_SYSTEM]),
          resolveSystem: (id: string) =>
            id === GREGORIAN_SYSTEM.id ? GREGORIAN_SYSTEM : null,
        },
      },
      {
        provide: WorldbuildingService,
        useValue: {
          getSchemaIcon: vi.fn().mockReturnValue('person'),
          getSchemaById: vi.fn().mockReturnValue(undefined),
        },
      },
    ],
  };
}
