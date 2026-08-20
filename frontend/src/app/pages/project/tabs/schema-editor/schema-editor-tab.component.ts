import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute } from '@angular/router';
import { TemplateEditorPageComponent } from '@components/templates-tab/template-editor-page/template-editor-page.component';
import { TranslocoModule } from '@jsverse/transloco';
import { type ElementTypeSchema } from '@models/schema-types';
import { ProjectStateService } from '@services/project/project-state.service';
import { WorldbuildingService } from '@services/worldbuilding/worldbuilding.service';

/**
 * Top-level tab that hosts the unified template (schema) editor as a first-class
 * open document, rather than nested inside the Settings section. This is what
 * gives the schema editor the full width/height of the content area and a sane
 * mobile experience (no accordion-in-accordion).
 *
 * Reads `:schemaId` from the route, loads the schema from the library, and
 * saves live edits back through WorldbuildingService (create or update by id).
 * Closing the tab (via the tab bar) is the exit; edits are autosaved.
 */
@Component({
  selector: 'app-schema-editor-tab',
  templateUrl: './schema-editor-tab.component.html',
  styleUrls: ['./schema-editor-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TemplateEditorPageComponent,
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
})
export class SchemaEditorTabComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly projectState = inject(ProjectStateService);
  private readonly worldbuildingService = inject(WorldbuildingService);

  readonly schemaId = signal<string>('');

  /**
   * The schema being edited. Preferred source is the project's schema library
   * (autosave persists there, so it is always the freshest for existing
   * templates once loaded). Falls back to the schema carried by the tab so a
   * brand-new, not-yet-saved template still renders.
   */
  readonly schema = computed<ElementTypeSchema | null>(() => {
    const id = this.schemaId();
    if (!id) return null;
    // Reading worldbuildingService.schemas() makes this recompute once the
    // schema library arrives (e.g. after a refresh restores the tab).
    this.worldbuildingService.schemas();
    const fromLibrary = this.worldbuildingService.getSchema(id);
    if (fromLibrary) return fromLibrary;
    const tabId = `schema-${id}`;
    const tab = this.projectState.openTabs().find(t => t.id === tabId);
    return tab?.schema ?? null;
  });

  constructor() {
    this.route.paramMap.subscribe(params => {
      this.schemaId.set(params.get('schemaId') ?? '');
    });
  }

  /** Live-save schema edits as they happen (autosave). */
  onSchemaChange(schema: ElementTypeSchema): void {
    this.worldbuildingService.saveSchemaToLibrary(schema);
  }
}
