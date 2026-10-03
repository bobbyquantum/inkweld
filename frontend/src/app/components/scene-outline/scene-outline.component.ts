import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TooltipAriaLabelDirective } from '@directives/tooltip-aria-label.directive';
import { TranslocoModule } from '@jsverse/transloco';
import { SCENE_STATUSES } from '@models/scene-metadata';
import {
  type SceneOverviewRow,
  SceneOverviewService,
  type SceneOverviewTotals,
} from '@services/project/scene-overview.service';

import { TreeNodeIconComponent } from '../project-tree/components/tree-node-icon/tree-node-icon.component';

/**
 * Tabular view of a folder's manuscript: every folder and prose document
 * below it, indented by depth, with synopsis, draft status, POV, location,
 * story date and word counts in columns and totals underneath. Synopsis and
 * status are edited in place.
 */
@Component({
  selector: 'app-scene-outline',
  templateUrl: './scene-outline.component.html',
  styleUrl: './scene-outline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    NgTemplateOutlet,
    TooltipAriaLabelDirective,
    TranslocoModule,
    TreeNodeIconComponent,
  ],
})
export class SceneOutlineComponent {
  protected readonly overview = inject(SceneOverviewService);

  /** Bare element id of the folder to outline. */
  readonly folderId = input.required<string>();

  protected readonly statuses = SCENE_STATUSES;
  protected readonly canWrite = this.overview.canWrite;

  readonly rows = computed<SceneOverviewRow[]>(() =>
    this.overview.rows(this.folderId(), { deep: true, proseOnly: true })
  );

  readonly totals = computed<SceneOverviewTotals>(() =>
    this.overview.totals(this.folderId())
  );

  constructor() {
    // Fresh counts when the view opens, then pick up documents added later.
    effect(() => {
      const folderId = this.folderId();
      untracked(() => this.overview.refreshWordCounts(folderId));
    });
    effect(() => this.overview.ensureWordCounts(this.folderId()));
  }

  onSynopsisChange(row: SceneOverviewRow, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.overview.setSynopsis(row.element.id, value);
  }

  /** Synopses belong to manuscript structure: scenes and chapter folders. */
  hasSynopsis(row: SceneOverviewRow): boolean {
    return row.kind === 'scene' || row.kind === 'folder';
  }
}
