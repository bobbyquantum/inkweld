import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type Element, ElementType } from '@inkweld/index';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import {
  isScene,
  readSceneMetadata,
  SCENE_STATUSES,
  sceneMetadataPatch,
  type SceneStatus,
} from '@models/scene-metadata';
import { formatTimePoint } from '@models/time-system';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import {
  getSceneRelationshipTypeDefinitions,
  SCENE_LOCATION_RELATIONSHIP_TYPE,
  SCENE_POV_RELATIONSHIP_TYPE,
} from '@services/relationship/scene-relationship-types';
import { TimeSystemLibraryService } from '@services/timeline/time-system-library.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';

/** Fixed height of the strip in px; the editor subtracts it from its height. */
export const SCENE_STRIP_HEIGHT = 36;

type SceneLinkKind = 'pov' | 'location';

const LINK_TYPE_IDS: Record<SceneLinkKind, string> = {
  pov: SCENE_POV_RELATIONSHIP_TYPE,
  location: SCENE_LOCATION_RELATIONSHIP_TYPE,
};

/**
 * Compact single-row summary of a scene's structural metadata, shown above
 * the prose editor: draft status, POV character, location, story date and
 * word count against target. Every chip is an affordance — status changes
 * in place, POV and location open the element picker, everything else
 * opens the scene details dialog.
 *
 * Renders nothing for notes and legacy documents; the host reserves the
 * strip's height only when {@link visible} is true.
 */
@Component({
  selector: 'app-scene-strip',
  templateUrl: './scene-strip.component.html',
  styleUrl: './scene-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    TranslocoModule,
  ],
})
export class SceneStripComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly documentService = inject(DocumentService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly timeSystemLibrary = inject(TimeSystemLibraryService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly transloco = inject(TranslocoService);

  /** Bare element id of the open document. */
  readonly elementId = input.required<string>();
  /** Full `username:slug:elementId` document id, for the live word count. */
  readonly documentId = input.required<string>();

  protected readonly statuses = SCENE_STATUSES;

  readonly element = computed<Element | undefined>(() => {
    const id = this.elementId();
    return this.projectState.elements().find(e => e.id === id);
  });

  /** True only for documents explicitly marked as scenes. */
  readonly visible = computed(() => {
    const el = this.element();
    return !!el && el.type === ElementType.Item && isScene(el.metadata);
  });

  readonly canWrite = this.projectState.canWrite;

  readonly scene = computed(() => readSceneMetadata(this.element()?.metadata));

  readonly wordCount = computed(() =>
    this.documentService.getWordCountSignal(this.documentId())()
  );

  /** 0–100 progress towards the word target, or null without a target. */
  readonly progress = computed<number | null>(() => {
    const target = this.scene().wordTarget;
    if (!target) return null;
    return Math.min(100, Math.round((this.wordCount() / target) * 100));
  });

  readonly storyDateLabel = computed<string | null>(() => {
    const point = this.scene().storyDate;
    if (!point) return null;
    const system = this.timeSystemLibrary.resolveSystem(point.systemId);
    if (!system) return point.units.join('-');
    try {
      return formatTimePoint(point, system);
    } catch {
      return point.units.join('-');
    }
  });

  readonly povElements = computed(() => this.linkedElements('pov'));
  readonly locationElements = computed(() => this.linkedElements('location'));

  private linkedElements(kind: SceneLinkKind): Element[] {
    const sourceId = this.elementId();
    const typeId = LINK_TYPE_IDS[kind];
    const elements = this.projectState.elements();
    return this.relationshipService
      .relationships()
      .filter(
        r => r.sourceElementId === sourceId && r.relationshipTypeId === typeId
      )
      .map(r => elements.find(e => e.id === r.targetElementId))
      .filter((e): e is Element => !!e);
  }

  getIcon(element: Element): string {
    return (
      element.metadata?.['icon'] ||
      this.worldbuildingService.getSchemaIcon(element.schemaId)
    );
  }

  open(element: Element): void {
    this.projectState.openDocument(element);
  }

  setStatus(status: SceneStatus | null): void {
    if (!this.canWrite()) return;
    this.projectState.updateElementMetadata(
      this.elementId(),
      sceneMetadataPatch({ status })
    );
  }

  async pick(kind: SceneLinkKind): Promise<void> {
    if (!this.canWrite()) return;
    const result = await this.dialogGateway.openElementPickerDialog({
      title: this.transloco.translate(
        kind === 'pov'
          ? 'project.sceneStrip.pickPovTitle'
          : 'project.sceneStrip.pickLocationTitle'
      ),
      filterType: ElementType.Worldbuilding,
      maxSelections: 1,
      allowCreate: true,
    });
    const chosen = result?.elements[0];
    if (!chosen) return;

    this.ensureTypes();
    const typeId = LINK_TYPE_IDS[kind];
    const sourceId = this.elementId();
    for (const rel of this.relationshipService
      .relationships()
      .filter(
        r => r.sourceElementId === sourceId && r.relationshipTypeId === typeId
      )) {
      this.relationshipService.removeRelationship(rel.id);
    }
    this.relationshipService.addRelationship(sourceId, chosen.id, typeId);
  }

  clear(kind: SceneLinkKind): void {
    if (!this.canWrite()) return;
    const typeId = LINK_TYPE_IDS[kind];
    const sourceId = this.elementId();
    for (const rel of this.relationshipService
      .relationships()
      .filter(
        r => r.sourceElementId === sourceId && r.relationshipTypeId === typeId
      )) {
      this.relationshipService.removeRelationship(rel.id);
    }
  }

  async openDetails(): Promise<void> {
    const el = this.element();
    if (!el || !this.canWrite()) return;
    const result = await this.dialogGateway.openSceneDetailsDialog({
      elementName: el.name,
      metadata: el.metadata ?? {},
      timeSystems: this.timeSystemLibrary.systems(),
    });
    if (!result) return;
    this.projectState.updateElementMetadata(el.id, result.patch);
  }

  /**
   * Projects imported from an instance predating scenes may lack the POV /
   * location types even though the document is already a scene.
   */
  private ensureTypes(): void {
    for (const def of getSceneRelationshipTypeDefinitions()) {
      if (!this.relationshipService.getTypeById(def.id)) {
        this.relationshipService.addRawType(def);
      }
    }
  }
}
