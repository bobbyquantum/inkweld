import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { ElementType } from '../../../../api-client';
import { DynamicWorldbuildingEditorComponent } from '../dynamic-worldbuilding-editor/dynamic-worldbuilding-editor.component';

/**
 * Main worldbuilding editor component that loads the appropriate
 * editor based on the element type
 */
@Component({
  selector: 'app-worldbuilding-editor',
  standalone: true,
  imports: [CommonModule, MatIconModule, DynamicWorldbuildingEditorComponent],
  templateUrl: './worldbuilding-editor.component.html',
  styleUrls: ['./worldbuilding-editor.component.scss'],
})
export class WorldbuildingEditorComponent {
  // Input properties
  elementId = input.required<string>();
  elementType =
    input.required<ElementType>();
  username = input<string>();
  slug = input<string>();
}
