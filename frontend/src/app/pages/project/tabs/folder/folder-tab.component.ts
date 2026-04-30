import {
  ChangeDetectorRef,
  Component,
  inject,
  type OnDestroy,
  type OnInit,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LoggerService } from '@services/core/logger.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { type Subscription } from 'rxjs';

import { DocumentBreadcrumbsComponent } from '../../../../components/document-breadcrumbs/document-breadcrumbs.component';
import { FolderElementEditorComponent } from '../../../../components/folder-element-editor/folder-element-editor.component';

@Component({
  selector: 'app-folder-tab',
  templateUrl: './folder-tab.component.html',
  styleUrls: ['./folder-tab.component.scss'],
  imports: [FolderElementEditorComponent, DocumentBreadcrumbsComponent],
})
export class FolderTabComponent implements OnInit, OnDestroy {
  private elementId: string = '';
  private paramSubscription: Subscription | null = null;

  // Exposed to template
  protected fullElementId: string = '';
  protected bareElementId: string = '';

  protected readonly projectState = inject(ProjectStateService);
  protected readonly documentService = inject(DocumentService);
  protected readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly logger = inject(LoggerService);

  ngOnInit(): void {
    // Subscribe to route param changes instead of using snapshot
    this.paramSubscription = this.route.paramMap.subscribe(params => {
      const newElementId = params.get('tabId') || '';

      // Update element ID
      this.elementId = newElementId;

      // Use Promise.resolve to schedule update after current change detection
      void Promise.resolve().then(() => {
        this.fullElementId = this.calculateFullElementId();
        // Bare id is the last `:` segment of the full id, falling back to the
        // raw element id when no project context is available.
        this.bareElementId = this.fullElementId.includes(':')
          ? (this.fullElementId.split(':').at(-1) ?? '')
          : this.fullElementId;
        this.cdr.markForCheck();
      });
    });
  }

  ngOnDestroy(): void {
    // Clean up subscription
    if (this.paramSubscription) {
      this.paramSubscription.unsubscribe();
      this.paramSubscription = null;
    }

    // Log destruction
    if (this.elementId) {
      this.logger.debug(
        'FolderTab',
        `Destroying component for folder ID: ${this.elementId}`
      );
    }
  }

  /**
   * For backward compatibility, returns just the element ID
   */
  getElementId(): string {
    return this.elementId;
  }

  /**
   * Calculates the full element ID in the format username:project:elementId
   * Not called during change detection cycles
   */
  private calculateFullElementId(): string {
    if (!this.elementId) {
      console.warn('[FolderTab] No element ID available');
      return '';
    }

    // Check if the ID already contains project info (has colons)
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
      return this.elementId; // Fallback to partial ID
    }

    const fullId = `${project.username}:${project.slug}:${this.elementId}`;
    this.logger.debug('FolderTab', `Built full element ID: ${fullId}`);
    return fullId;
  }
}
