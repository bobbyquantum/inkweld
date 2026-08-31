import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ElementType } from '@inkweld/index';

import { WorldbuildingService } from '../../../../services/worldbuilding/worldbuilding.service';

@Component({
  selector: 'app-tree-node-icon',
  imports: [MatIconModule],
  templateUrl: './tree-node-icon.component.html',
  styleUrls: ['./tree-node-icon.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeNodeIconComponent {
  private readonly worldbuildingService = inject(WorldbuildingService);

  @Input() type!: string;
  @Input() schemaId?: string | null;
  @Input() isExpanded = false;
  @Input() isExpandable = false;
  @Input() metadata?: Record<string, unknown>;

  /**
   * Get the Material icon name for a given element type
   */
  getIcon(): string {
    // Folders use open/closed folder icons
    if (this.isExpandable) {
      return this.isExpanded ? 'folder_open' : 'folder';
    }

    // For Worldbuilding elements, look up the icon from the schema — the
    // live schema icon beats any snapshot stored on the element.
    if (this.type === (ElementType.Worldbuilding as string) && this.schemaId) {
      const schema = this.worldbuildingService.getSchemaById(this.schemaId);
      if (schema?.icon) {
        return schema.icon;
      }
      // Fallback for worldbuilding without schema
      return 'category';
    }

    // An explicit per-element icon beats the type default (e.g. a canvas
    // created via the Map preset carries icon 'map').
    if (this.metadata?.['icon']) {
      return this.metadata['icon'] as string;
    }

    // Items (documents) use description icon
    if (this.type === (ElementType.Item as string)) {
      return 'description';
    }

    // Relationship charts use hub icon
    if (this.type === (ElementType.RelationshipChart as string)) {
      return 'hub';
    }

    // Canvas elements use dashboard icon
    if (this.type === (ElementType.Canvas as string)) {
      return 'dashboard';
    }

    // Timeline elements use timeline icon
    if (this.type === (ElementType.Timeline as string)) {
      return 'timeline';
    }

    // Default fallback
    return 'description';
  }
}
