import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { GetApiV1ProjectsUsernameSlugElements200ResponseInnerType } from '@inkweld/index';

@Component({
  selector: 'app-tree-node-icon',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './tree-node-icon.component.html',
  styleUrls: ['./tree-node-icon.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeNodeIconComponent {
  @Input() type!: string;
  @Input() isExpanded = false;
  @Input() isExpandable = false;
  @Input() metadata?: Record<string, unknown>;

  /**
   * Get the Material icon name for a given element type
   */
  getIcon(): string {
    if (this.isExpandable) {
      return this.isExpanded ? 'folder_open' : 'folder';
    }

    const typeMap: Record<string, string> = {
      ['CHARACTER']: 'person',
      ['LOCATION']: 'place',
      ['WB_ITEM']: 'category',
      ['MAP']: 'map',
      ['RELATIONSHIP']: 'diversity_1',
      ['PHILOSOPHY']: 'auto_stories',
      ['CULTURE']: 'groups',
      ['SPECIES']: 'pets',
      ['SYSTEMS']: 'settings',
      [GetApiV1ProjectsUsernameSlugElements200ResponseInnerType.Item]:
        'description',
      IMAGE: 'image', // Legacy type not in enum
    };

    // Check if it's a built-in type
    if (typeMap[this.type]) {
      return typeMap[this.type];
    }

    // For custom types, check metadata cache
    if (this.metadata && this.metadata['icon']) {
      return this.metadata['icon'] as string;
    }

    return 'description';
  }
}
