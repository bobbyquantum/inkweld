import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { type Element } from '@inkweld/index';
import { TranslocoModule } from '@jsverse/transloco';
import { ElementNavigationService } from '@services/project/element-navigation.service';
import { ProjectStateService } from '@services/project/project-state.service';

import { ProjectCoverComponent } from '../../../../components/project-cover/project-cover.component';
import { RecentFilesService } from '../../../../services/project/recent-files.service';

@Component({
  selector: 'app-home-tab',
  templateUrl: './home-tab.component.html',
  styleUrl: './home-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIconModule, TranslocoModule, ProjectCoverComponent],
})
export class HomeTabComponent {
  protected readonly projectState = inject(ProjectStateService);
  protected readonly recentFilesService = inject(RecentFilesService);
  private readonly elementNavigation = inject(ElementNavigationService);

  /** Ordered list of pinned elements, resolved against the current element list. */
  protected readonly pinnedElements = computed(() => {
    const ids = this.projectState.pinnedElementIds();
    const elements = this.projectState.elements();
    return ids
      .map(id => elements.find(e => e.id === id))
      .filter((e): e is NonNullable<typeof e> => e !== undefined);
  });

  onRecentDocumentClick(documentId: string): void {
    this.openElementById(documentId);
  }

  onPinnedElementClick(element: Element): void {
    this.elementNavigation.openElement(element);
  }

  private openElementById(documentId: string): void {
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === documentId);
    if (element) {
      this.elementNavigation.openElement(element);
    }
  }
}
