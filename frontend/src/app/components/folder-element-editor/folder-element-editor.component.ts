import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragPreview,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TooltipAriaLabelDirective } from '@directives/tooltip-aria-label.directive';
import { TranslocoModule } from '@jsverse/transloco';
import { SceneOverviewService } from '@services/project/scene-overview.service';

import { type ProjectElement } from '../../models/project-element';
import { ProjectStateService } from '../../services/project/project-state.service';
import { TreeNodeIconComponent } from '../project-tree/components/tree-node-icon/tree-node-icon.component';
import { SceneCorkboardComponent } from '../scene-corkboard/scene-corkboard.component';
import { SceneOutlineComponent } from '../scene-outline/scene-outline.component';

export type FolderViewMode = 'corkboard' | 'outline' | 'grid' | 'list';

const VIEW_MODES: readonly FolderViewMode[] = [
  'corkboard',
  'outline',
  'grid',
  'list',
];

/** Element metadata key the chosen view is remembered under. */
const VIEW_MODE_KEY = 'viewMode';

function isViewMode(value: unknown): value is FolderViewMode {
  return (VIEW_MODES as readonly unknown[]).includes(value);
}

/**
 * The contents of a folder, shown one of four ways: the manuscript views
 * (corkboard of index cards, outline table) and the plain grid and list.
 * A folder that holds scenes opens on the corkboard; the last view chosen
 * is remembered on the folder.
 */
@Component({
  selector: 'app-folder-element-editor',
  imports: [
    TooltipAriaLabelDirective,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    CdkDrag,
    CdkDragPreview,
    CdkDropList,
    TreeNodeIconComponent,
    TranslocoModule,
    SceneCorkboardComponent,
    SceneOutlineComponent,
  ],
  templateUrl: './folder-element-editor.component.html',
  styleUrl: './folder-element-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderElementEditorComponent {
  private readonly projectStateService = inject(ProjectStateService);
  private readonly overview = inject(SceneOverviewService);

  /** Folder id, bare or as a full `username:slug:elementId`. */
  readonly elementId = input<string>();

  readonly isLoading = this.projectStateService.isLoading;
  readonly error = this.projectStateService.error;
  readonly canWrite = this.projectStateService.canWrite;

  /** Element ids are stored bare; the tab hands over the full document id. */
  readonly folderId = computed(() => {
    const id = this.elementId() ?? '';
    return id.includes(':') ? (id.split(':').at(-1) ?? '') : id;
  });

  readonly folderElement = computed(() => {
    const id = this.folderId();
    return this.projectStateService.elements().find(e => e.id === id);
  });

  /** Direct children of the folder, in tree order. */
  readonly childElements = computed<ProjectElement[]>(() => {
    const elements = this.projectStateService.elements();
    const index = elements.findIndex(e => e.id === this.folderId());
    if (index === -1) return [];

    const level = elements[index].level;
    const children: ProjectElement[] = [];
    for (let i = index + 1; i < elements.length; i++) {
      if (elements[i].level <= level) break;
      if (elements[i].level === level + 1) children.push(elements[i]);
    }
    return children;
  });

  readonly hasElements = computed(() => this.childElements().length > 0);

  /** A view picked by someone who cannot write is kept for the session only. */
  private readonly localViewMode = signal<FolderViewMode | null>(null);

  readonly viewMode = computed<FolderViewMode>(() => {
    const local = this.localViewMode();
    if (local) return local;
    const saved = this.folderElement()?.metadata?.[VIEW_MODE_KEY];
    if (isViewMode(saved)) return saved;
    return this.overview.hasScenes(this.folderId()) ? 'corkboard' : 'grid';
  });

  setViewMode(mode: FolderViewMode): void {
    const folder = this.folderElement();
    if (folder && this.canWrite()) {
      this.localViewMode.set(null);
      this.projectStateService.updateElementMetadata(folder.id, {
        [VIEW_MODE_KEY]: mode,
      });
    } else {
      this.localViewMode.set(mode);
    }
  }

  openElement(element: ProjectElement): void {
    this.projectStateService.openDocument(element);
  }

  onDrop(event: CdkDragDrop<ProjectElement[]>): void {
    this.overview.moveChild(
      this.folderId(),
      event.previousIndex,
      event.currentIndex
    );
  }

  createNewElement(): void {
    this.projectStateService.showNewElementDialog(this.folderElement());
  }

  refreshWordCounts(): void {
    this.overview.refreshWordCounts(this.folderId());
  }
}
