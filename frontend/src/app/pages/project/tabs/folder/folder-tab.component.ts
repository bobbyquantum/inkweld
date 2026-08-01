import {
  ChangeDetectionStrategy,
  Component,
  inject,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DocumentBreadcrumbsComponent } from '@components/document-breadcrumbs/document-breadcrumbs.component';
import { LoggerService } from '@services/core/logger.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { type Subscription } from 'rxjs';

import { FolderElementEditorComponent } from '../../../../components/folder-element-editor/folder-element-editor.component';

@Component({
  selector: 'app-folder-tab',
  templateUrl: './folder-tab.component.html',
  styleUrls: ['./folder-tab.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FolderElementEditorComponent, DocumentBreadcrumbsComponent],
})
export class FolderTabComponent implements OnInit, OnDestroy {
  private elementId: string = '';
  private paramSubscription: Subscription | null = null;

  protected readonly fullElementId = signal('');
  protected readonly bareElementId = signal('');

  protected readonly projectState = inject(ProjectStateService);
  protected readonly documentService = inject(DocumentService);
  protected readonly route = inject(ActivatedRoute);
  private readonly logger = inject(LoggerService);

  ngOnInit(): void {
    this.paramSubscription = this.route.paramMap.subscribe(params => {
      const newElementId = params.get('tabId') || '';
      this.elementId = newElementId;

      void Promise.resolve().then(() => {
        const fullId = this.calculateFullElementId();
        this.fullElementId.set(fullId);
        this.bareElementId.set(
          fullId.includes(':') ? (fullId.split(':').at(-1) ?? '') : fullId
        );
      });
    });
  }

  ngOnDestroy(): void {
    if (this.paramSubscription) {
      this.paramSubscription.unsubscribe();
      this.paramSubscription = null;
    }

    if (this.elementId) {
      this.logger.debug(
        'FolderTab',
        `Destroying component for folder ID: ${this.elementId}`
      );
    }
  }

  getElementId(): string {
    return this.elementId;
  }

  private calculateFullElementId(): string {
    if (!this.elementId) {
      console.warn('[FolderTab] No element ID available');
      return '';
    }

    if (
      this.elementId.includes(':') &&
      this.elementId.split(':').length === 3
    ) {
      this.logger.debug(
        'FolderTab',
        `ID already fully formatted: ${this.elementId}`
      );
      return this.elementId;
    }

    const project = this.projectState.project();
    if (!project) {
      console.warn(
        '[FolderTab] Project not available when building element ID'
      );
      return this.elementId;
    }

    const fullId = `${project.username}:${project.slug}:${this.elementId}`;
    this.logger.debug('FolderTab', `Built full element ID: ${fullId}`);
    return fullId;
  }
}
