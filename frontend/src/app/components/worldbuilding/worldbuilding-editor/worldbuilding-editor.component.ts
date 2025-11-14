import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import {
  GetApiV1ProjectsUsernameSlugElements200ResponseInner,
  GetApiV1ProjectsUsernameSlugElements200ResponseInnerType,
} from '../../../../api-client';
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
    input.required<GetApiV1ProjectsUsernameSlugElements200ResponseInnerType>();
  username = input<string>();
  slug = input<string>();
}
