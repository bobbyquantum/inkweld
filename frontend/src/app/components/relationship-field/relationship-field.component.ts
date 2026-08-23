import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { type ElementRefTooltipData } from '@components/element-ref';
import { ElementRefService } from '@components/element-ref/element-ref.service';
import { type Element, ElementType } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { type FieldSchema } from '@models/schema-types';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship/relationship.service';
import { AppearanceService } from '@services/worldbuilding/appearance.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';

/**
 * Renders a relationship field: a small card per linked worldbuilding element
 * (image, icon, name) with hover preview, navigation, add/change via the
 * element picker and removal.
 *
 * Values live in the central relationships store (not the element data map):
 * each card is a relationship of the field's auto-managed type, with the
 * element owning the field as source.
 */
@Component({
  selector: 'app-relationship-field',
  imports: [MatButtonModule, MatIconModule, TranslocoModule],
  templateUrl: './relationship-field.component.html',
  styleUrl: './relationship-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RelationshipFieldComponent {
  private readonly projectState = inject(ProjectStateService);
  private readonly relationshipService = inject(RelationshipService);
  private readonly worldbuildingService = inject(WorldbuildingService);
  private readonly dialogGateway = inject(DialogGatewayService);
  private readonly elementRefService = inject(ElementRefService);
  private readonly appearanceService = inject(AppearanceService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // The hover tooltip lives in a shared service that every editor host
    // mirrors. If this component unmounts while a card is hovered (section
    // switch, tab close, navigation), no mouseleave fires — clear it so the
    // popover cannot leak onto the next page.
    this.destroyRef.onDestroy(() => this.elementRefService.hideTooltip());
  }

  readonly field = input.required<FieldSchema>();
  readonly sourceElementId = input.required<string>();
  readonly username = input.required<string>();
  readonly slug = input.required<string>();
  readonly readOnly = input(false);

  /** Emits the new list of linked element ids after a user action. */
  readonly linksChange = output<string[]>();

  /** Relationship instances backing this field for the source element. */
  readonly linkedRelationships = computed(() => {
    const typeId = this.field().relationshipTypeId;
    if (!typeId) return [];
    const sourceId = this.sourceElementId();
    return this.relationshipService
      .relationships()
      .filter(
        r => r.sourceElementId === sourceId && r.relationshipTypeId === typeId
      );
  });

  /** Resolved linked elements (null entries mark deleted targets). */
  readonly linkedElements = computed(() =>
    this.linkedRelationships().map(rel => {
      const element = this.projectState
        .elements()
        .find(e => e.id === rel.targetElementId);
      return { relationship: rel, element: element ?? null };
    })
  );

  readonly linkedElementIds = computed(() =>
    this.linkedElements()
      .map(l => l.element?.id)
      .filter((id): id is string => !!id)
  );

  /** Resolved identity image URLs keyed by element id. */
  readonly imageUrls = signal<Record<string, string>>({});

  private readonly loadImages = effect(() => {
    const ids = this.linkedElementIds();
    const username = this.username();
    const slug = this.slug();
    for (const id of ids) {
      if (this.imageUrls()[id] !== undefined) continue;
      this.imageUrls.update(m => ({ ...m, [id]: '' }));
      void this.loadImageForElement(id, username, slug);
    }
  });

  private async loadImageForElement(
    elementId: string,
    username: string,
    slug: string
  ): Promise<void> {
    try {
      const identity = await this.worldbuildingService.getIdentityData(
        elementId,
        username,
        slug
      );
      const url = identity.image
        ? await this.appearanceService.resolveImageReference(
            identity.image,
            username,
            slug
          )
        : null;
      this.imageUrls.update(m => ({ ...m, [elementId]: url ?? '' }));
    } catch {
      this.imageUrls.update(m => ({ ...m, [elementId]: '' }));
    }
  }

  getIcon(element: Element | null): string {
    if (!element) return 'help_outline';
    return (
      element.metadata?.['icon'] ||
      this.worldbuildingService.getSchemaIcon(element.schemaId)
    );
  }

  navigate(element: Element): void {
    // Clicking through to the target must not carry the hover popover along:
    // no mouseleave fires before the page switches, and every editor host
    // mirrors the shared tooltip signal, so it would follow the navigation.
    this.hideTooltip();
    this.projectState.openDocument(element);
  }

  showTooltip(element: Element, event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const data: ElementRefTooltipData = {
      elementId: element.id,
      elementType: element.type,
      displayText: element.name,
      originalName: element.name,
      position: { x: rect.left, y: rect.bottom + 4 },
    };
    this.elementRefService.showTooltip(data);
  }

  hideTooltip(): void {
    this.elementRefService.hideTooltip();
  }

  async openPicker(): Promise<void> {
    const field = this.field();
    const multiple = field.multiple === true;
    const result = await this.dialogGateway.openElementPickerDialog({
      title: field.label,
      filterType: ElementType.Worldbuilding,
      filterSchemaId: field.targetSchemaId || undefined,
      maxSelections: multiple ? 50 : 1,
      excludeIds: multiple ? this.linkedElementIds() : [],
    });
    if (!result || result.elements.length === 0) return;

    const selectedIds = result.elements.map(e => e.id);
    if (multiple) {
      this.applyLinks([...this.linkedElementIds(), ...selectedIds]);
    } else {
      this.applyLinks(selectedIds.slice(0, 1));
    }
  }

  removeLink(elementId: string): void {
    this.applyLinks(this.linkedElementIds().filter(id => id !== elementId));
  }

  /** Diff the desired element ids against current relationships and commit. */
  private applyLinks(desiredIds: string[]): void {
    const field = this.field();
    const typeId = field.relationshipTypeId;
    if (!typeId) return;

    const current = this.linkedRelationships();
    const currentIds = new Set(
      current.map(r => r.targetElementId).filter(id => this.elementExists(id))
    );
    const desired = new Set(desiredIds.filter(id => this.elementExists(id)));

    for (const rel of current) {
      if (!desired.has(rel.targetElementId)) {
        this.relationshipService.removeRelationship(rel.id);
      }
    }
    for (const id of desiredIds) {
      if (!currentIds.has(id) && this.elementExists(id)) {
        this.relationshipService.addRelationship(
          this.sourceElementId(),
          id,
          typeId
        );
      }
    }

    this.linksChange.emit(desiredIds);
  }

  private elementExists(elementId: string): boolean {
    return this.projectState.elements().some(e => e.id === elementId);
  }
}
