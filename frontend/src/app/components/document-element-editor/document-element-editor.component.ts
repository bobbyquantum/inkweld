import { CdkDragEnd } from '@angular/cdk/drag-drop';
import { DragDropModule } from '@angular/cdk/drag-drop';
import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { Editor, NgxEditorModule, Toolbar } from 'ngx-editor';
import { Subject } from 'rxjs';

import { EditorControlsMenuComponent } from './editor-controls-menu.component';

interface EditorDimensions {
  pageWidth: number; // in cm
  leftMargin: number; // in cm
  rightMargin: number; // in cm
}

type DragPoint = 'pageLeft' | 'pageRight' | 'marginLeft' | 'marginRight';

@Component({
  selector: 'app-document-element-editor',
  imports: [
    MatButtonModule,
    MatIconModule,
    NgxEditorModule,
    MatSelectModule,
    MatOptionModule,
    EditorControlsMenuComponent,
    DragDropModule,
  ],
  templateUrl: './document-element-editor.component.html',
  styleUrl: './document-element-editor.component.scss',
})
export class DocumentElementEditorComponent
  implements OnInit, OnDestroy, AfterViewInit, OnChanges
{
  private documentService = inject(DocumentService);
  private projectState = inject(ProjectStateService);
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  @Input() documentId = 'invalid';
  @Input() zenMode = false;
  private previousDocumentId = 'invalid';
  editor!: Editor;
  toolbar: Toolbar = [
    ['bold', 'italic'],
    ['underline', 'strike'],
    // ['code', 'blockquote'],
    // ['ordered_list', 'bullet_list'],
    [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
    // ['link', 'image'],
    // ['text_color', 'background_color'],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
    ['horizontal_rule', 'format_clear'],
    // ['superscript', 'subscript'],
    ['undo', 'redo'],
  ];
  colorPresets = [
    '#000000',
    '#434343',
    '#666666',
    '#999999',
    '#b7b7b7',
    '#cccccc',
    '#d9d9d9',
    '#efefef',
    '#f3f3f3',
    '#ffffff',
    '#980000',
    '#ff0000',
    '#ff9900',
    '#ffff00',
    '#00ff00',
    '#00ffff',
    '#4a86e8',
    '#0000ff',
    '#9900ff',
    '#ff00ff',
  ];
  zoomLevel = 100;
  viewMode: 'page' | 'fitWidth' = 'fitWidth';
  showViewModeDropdown = false;
  dimensions: EditorDimensions = {
    pageWidth: 21,
    leftMargin: 2,
    rightMargin: 2,
  };
  tooltips = {
    pageWidth: '',
    leftMargin: '',
    rightMargin: '',
    contentWidth: '',
  };
  rulerMeasurements = Array.from({ length: 30 }, (_, i) => i);

  private destroy$ = new Subject<void>();
  // Flag to track if we've already formatted the ID
  private idFormatted = false;

  constructor() {
    // Watch for project loading completion
    effect(() => {
      const isLoading = this.projectState.isLoading();
      if (!isLoading && !this.idFormatted) {
        // Project finished loading, try to format the ID again
        console.log(
          '[DocumentEditor] Project loading completed, checking document ID format'
        );
        this.ensureProperDocumentId();

        // If ID was formatted and we have the editor, reconnect
        if (this.idFormatted && this.editor && this.editor.view) {
          console.log(
            '[DocumentEditor] Reconnecting with correctly formatted ID'
          );
          this.setupCollaboration();
        }
      }
    });
  }

  ngOnInit(): void {
    console.log(
      `[DocumentEditor] Initializing editor for document ID: ${this.documentId}`
    );

    // Try to format the document ID right away
    this.ensureProperDocumentId();
    this.previousDocumentId = this.documentId;

    this.editor = new Editor({
      history: true,
    });
    this.updateDimensions();
  }

  ngAfterViewInit(): void {
    console.log(
      `[DocumentEditor] Setting up collaboration for document ID: ${this.documentId}`
    );
    this.setupCollaboration();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only react to documentId changes after initial setup
    if (changes['documentId'] && !changes['documentId'].firstChange) {
      const newDocId = changes['documentId'].currentValue as string;
      const prevDocId = changes['documentId'].previousValue as string;

      console.log(
        `[DocumentEditor] Document ID changed from ${prevDocId} to ${newDocId}`
      );

      // Disconnect from the old document
      if (prevDocId && prevDocId !== 'invalid') {
        console.log(
          `[DocumentEditor] Disconnecting from previous document: ${prevDocId}`
        );
        this.documentService.disconnect(prevDocId);
      }

      // Format the new document ID and setup collaboration
      this.idFormatted = false; // Reset formatting flag
      this.ensureProperDocumentId();
      this.setupCollaboration();
      this.previousDocumentId = this.documentId;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.editor.destroy();
    if (!this.zenMode && this.documentId !== 'invalid') {
      console.log(
        `[DocumentEditor] Disconnecting on destroy: ${this.documentId}`
      );
      this.documentService.disconnect(this.documentId);
    }
  }

  increaseZoom(): void {
    if (this.zoomLevel < 200) {
      this.zoomLevel += 10;
      this.updateZoom();
    }
  }

  decreaseZoom(): void {
    if (this.zoomLevel > 50) {
      this.zoomLevel -= 10;
      this.updateZoom();
    }
  }

  onZoomLevelChange(newZoomLevel: number): void {
    this.zoomLevel = newZoomLevel;
    this.updateZoom();
  }

  updateTooltips(): void {
    const contentWidth =
      this.dimensions.pageWidth -
      this.dimensions.leftMargin -
      this.dimensions.rightMargin;
    this.tooltips = {
      pageWidth: `Page width: ${this.dimensions.pageWidth.toFixed(1)}cm`,
      leftMargin: `Left margin: ${this.dimensions.leftMargin.toFixed(1)}cm`,
      rightMargin: `Right margin: ${this.dimensions.rightMargin.toFixed(1)}cm`,
      contentWidth: `Content width: ${contentWidth.toFixed(1)}cm`,
    };
  }

  onHandleMouseMove(): void {
    this.updateTooltips();
  }

  getTooltipText(dragPoint: DragPoint): string {
    switch (dragPoint) {
      case 'pageLeft':
      case 'pageRight':
        return `${this.tooltips.pageWidth}\n${this.tooltips.contentWidth}`;
      case 'marginLeft':
        return this.tooltips.leftMargin;
      case 'marginRight':
        return this.tooltips.rightMargin;
      default:
        return '';
    }
  }

  onDragEnd(event: CdkDragEnd, dragPoint: DragPoint): void {
    const pixelsPerCm = 37.795275591;
    const delta = event.source.getFreeDragPosition().x / pixelsPerCm;

    this.handleDragDelta(delta, dragPoint);
    this.updateTooltips();
    this.updateDimensions();
    event.source.reset();
  }

  setViewMode(mode: 'page' | 'fitWidth'): void {
    this.viewMode = mode;
    if (mode === 'fitWidth') {
      this.zoomLevel = 100;
      this.updateZoom();
      this.setFitWidthMode();
    } else {
      this.updateDimensions();
    }
  }

  toggleViewModeDropdown(): void {
    this.showViewModeDropdown = !this.showViewModeDropdown;
  }

  /**
   * Ensures the document ID has the proper format (username:project:docId)
   * This helps especially on page refresh when context may be lost
   * @returns Whether the ID was successfully formatted or was already correctly formatted
   */
  private ensureProperDocumentId(): boolean {
    // If we've already formatted the ID, no need to do it again
    if (this.idFormatted) {
      return true;
    }

    // Log initial document ID
    console.log(
      `[DocumentEditor] Checking document ID format: ${this.documentId}`
    );

    // If ID already has project context (contains two colons), it's probably already formatted
    if (
      this.documentId.includes(':') &&
      this.documentId.split(':').length === 3
    ) {
      console.log(
        `[DocumentEditor] Document ID already correctly formatted: ${this.documentId}`
      );
      this.idFormatted = true;
      return true;
    }

    // Get the current project
    const project = this.projectState.project();

    if (project) {
      // If we have project data, format the ID now
      const formattedId = `${project.username}:${project.slug}:${this.documentId}`;
      console.log(
        `[DocumentEditor] Reformatting document ID from "${this.documentId}" to "${formattedId}"`
      );
      this.documentId = formattedId;
      this.idFormatted = true;
      return true;
    } else {
      // Project data not available yet
      console.warn(
        `[DocumentEditor] Cannot format document ID yet, project not available. Current ID: ${this.documentId}`
      );
      return false;
    }
  }

  private setVariable(name: string, value: string): void {
    document.documentElement.style.setProperty(name, value);
  }

  private removeVariable(name: string): void {
    document.documentElement.style.removeProperty(name);
  }

  private setPageDimensions(dimensions: {
    pageWidth: string;
    leftMargin: string;
    rightMargin: string;
  }): void {
    this.setVariable('--page-width', dimensions.pageWidth);
    this.setVariable('--margin-left', dimensions.leftMargin);
    this.setVariable('--margin-right', dimensions.rightMargin);
    this.removeVariable('--editor-max-width');
  }

  private setFitWidthMode(): void {
    this.removeVariable('--page-width');
    this.removeVariable('--margin-left');
    this.removeVariable('--margin-right');
    this.setVariable('--editor-max-width', '100%');
  }

  private setZoomLevel(zoom: number): void {
    this.setVariable('--editor-zoom', (zoom / 100).toString());
  }

  private setupCollaboration(): void {
    console.log(
      `[DocumentEditor] Starting setupCollaboration for document ID: ${this.documentId}`
    );

    // Skip invalid documents
    if (this.documentId === 'invalid') {
      console.log(`[DocumentEditor] Skipping setup for invalid document ID`);
      return;
    }

    // Try to ensure proper document ID format before setting up collaboration
    const isFormatted = this.ensureProperDocumentId();

    // If we couldn't format the ID yet (waiting for project data),
    // we'll retry when the project loads - see effect() in constructor
    if (!isFormatted) {
      console.log(
        `[DocumentEditor] Delaying collaboration setup until document ID is properly formatted`
      );
      return;
    }

    // We don't need to manually clear content as setting up collaboration will
    // replace the content with what's in the document

    setTimeout(() => {
      this.documentService
        .setupCollaboration(this.editor, this.documentId)
        .then(() => {
          console.log(
            `[DocumentEditor] Collaboration successfully set up for document ID: ${this.documentId}`
          );
        })
        .catch(error => {
          console.error(
            `[DocumentEditor] Failed to setup collaboration for ${this.documentId}:`,
            error
          );
        });
    }, 0);
  }

  private handleDragDelta(delta: number, dragPoint: DragPoint): void {
    switch (dragPoint) {
      case 'pageLeft':
        this.adjustPageWidth(-delta);
        break;
      case 'pageRight':
        this.adjustPageWidth(delta);
        break;
      case 'marginLeft':
        this.adjustLeftMargin(delta);
        break;
      case 'marginRight':
        this.adjustRightMargin(-delta);
        break;
    }
  }

  private adjustPageWidth(delta: number): void {
    const newWidth = this.dimensions.pageWidth + delta;
    if (newWidth >= 10 && newWidth <= 29.7) {
      this.dimensions.pageWidth = Math.round(newWidth * 10) / 10;
      this.adjustMarginsForNewWidth();
    }
  }

  private adjustLeftMargin(delta: number): void {
    this.dimensions.leftMargin = Math.max(
      0.5,
      Math.min(
        this.dimensions.pageWidth - this.dimensions.rightMargin - 5,
        Math.round((this.dimensions.leftMargin + delta) * 10) / 10
      )
    );
  }

  private adjustRightMargin(delta: number): void {
    this.dimensions.rightMargin = Math.max(
      0.5,
      Math.min(
        this.dimensions.pageWidth - this.dimensions.leftMargin - 5,
        Math.round((this.dimensions.rightMargin + delta) * 10) / 10
      )
    );
  }

  private adjustMarginsForNewWidth(): void {
    if (
      this.dimensions.leftMargin + this.dimensions.rightMargin >
      this.dimensions.pageWidth - 5
    ) {
      this.dimensions.leftMargin = Math.max(
        0.5,
        this.dimensions.pageWidth - this.dimensions.rightMargin - 5
      );
      this.dimensions.rightMargin = Math.max(
        0.5,
        this.dimensions.pageWidth - this.dimensions.leftMargin - 5
      );
    }
  }

  private updateZoom(): void {
    this.setZoomLevel(this.zoomLevel);
  }

  private updateDimensions(): void {
    if (this.viewMode === 'page') {
      this.setPageDimensions({
        pageWidth: `${this.dimensions.pageWidth}cm`,
        leftMargin: `${this.dimensions.leftMargin}cm`,
        rightMargin: `${this.dimensions.rightMargin}cm`,
      });
    }
  }
}
