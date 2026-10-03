import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
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
} from '@services/project/scene-overview.service';

import { TreeNodeIconComponent } from '../project-tree/components/tree-node-icon/tree-node-icon.component';

/**
 * Index-card view of a folder: one card per direct child, in manuscript
 * order. Scene cards carry the synopsis (editable in place), draft status,
 * POV, location, story date and words against target; dragging a card by
 * its header reorders the folder. Sub-folders appear as chapter cards with
 * their scene count and combined length.
 */
@Component({
  selector: 'app-scene-corkboard',
  templateUrl: './scene-corkboard.component.html',
  styleUrl: './scene-corkboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    CdkDropList,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    TooltipAriaLabelDirective,
    TranslocoModule,
    TreeNodeIconComponent,
  ],
})
export class SceneCorkboardComponent {
  protected readonly overview = inject(SceneOverviewService);

  /** Bare element id of the folder whose children are shown. */
  readonly folderId = input.required<string>();

  protected readonly statuses = SCENE_STATUSES;
  protected readonly canWrite = this.overview.canWrite;

  readonly cards = computed<SceneOverviewRow[]>(() =>
    this.overview.rows(this.folderId())
  );

  constructor() {
    // Fresh counts when the view opens, then pick up documents added later.
    effect(() => {
      const folderId = this.folderId();
      untracked(() => this.overview.refreshWordCounts(folderId));
    });
    effect(() => this.overview.ensureWordCounts(this.folderId()));
  }

  onDrop(event: CdkDragDrop<unknown>): void {
    this.overview.moveChild(
      this.folderId(),
      event.previousIndex,
      event.currentIndex
    );
  }

  onSynopsisChange(card: SceneOverviewRow, event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.overview.setSynopsis(card.element.id, value);
  }

  /** Synopses belong to manuscript structure: scenes and chapter folders. */
  hasSynopsis(card: SceneOverviewRow): boolean {
    return card.kind === 'scene' || card.kind === 'folder';
  }
}
