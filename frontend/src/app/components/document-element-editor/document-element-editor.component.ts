import { DragDropModule } from '@angular/cdk/drag-drop';
import {
  AfterViewChecked,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  signal,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor, NgxEditorModule, Toolbar } from '@bobbyquantum/ngx-editor';
import { DialogGatewayService } from '@services/core/dialog-gateway.service';
import { InsertImageService } from '@services/core/insert-image.service';
import { SettingsService } from '@services/core/settings.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { DocumentService } from '@services/project/document.service';
import { ProjectStateService } from '@services/project/project-state.service';
import { RelationshipService } from '@services/relationship';

import {
  SnapshotsDialogComponent,
  SnapshotsDialogData,
} from '../../dialogs/snapshots-dialog/snapshots-dialog.component';
import {
  TagEditorDialogComponent,
  TagEditorDialogData,
} from '../../dialogs/tag-editor-dialog/tag-editor-dialog.component';
import { FindInDocumentService } from '../../services/core/find-in-document.service';
import { EditorFloatingMenuComponent } from '../editor-floating-menu';
import { EditorToolbarComponent } from '../editor-toolbar';
import {
  deleteElementRef,
  ElementRefAction,
  ElementRefContextData,
  ElementRefContextMenuComponent,
  ElementRefPopupComponent,
  ElementRefService,
  ElementRefTooltipComponent,
  ElementRefTooltipData,
  ElementSearchResult,
  extendedSchema,
  insertElementRef,
  updateElementRefText,
} from '../element-ref';
import { FindInDocumentComponent } from '../find-in-document';
import { createMediaUrl } from '../image-paste';
import { BreadcrumbsComponent } from '../breadcrumbs';
import { LintFloatingMenuComponent } from '../lint/lint-floating-menu.component';
import { pluginKey as lintPluginKey } from '../lint/lint-plugin';
import { MetaPanelComponent } from '../meta-panel/meta-panel.component';

@Component({
  selector: 'app-document-element-editor',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    NgxEditorModule,
    MatSelectModule,
    MatOptionModule,
    DragDropModule,
    BreadcrumbsComponent,
    LintFloatingMenuComponent,
    MetaPanelComponent,
    ElementRefPopupComponent,
    ElementRefContextMenuComponent,
    ElementRefTooltipComponent,
    EditorToolbarComponent,
    EditorFloatingMenuComponent,
    FindInDocumentComponent,
  ],
  templateUrl: './document-element-editor.component.html',
  styleUrls: [
    './document-element-editor.component.scss',
    '../../components/lint/lint.css',
  ],
})
export class DocumentElementEditorComponent
  implements OnInit, OnChanges, OnDestroy, AfterViewChecked
{
  private documentService = inject(DocumentService);
  protected projectState = inject(ProjectStateService);
  private settingsService = inject(SettingsService);
  private relationshipService = inject(RelationshipService);
  private dialog = inject(MatDialog);
  private dialogGateway = inject(DialogGatewayService);
  private localStorage = inject(LocalStorageService);
  private insertImageService = inject(InsertImageService);
  protected elementRefService = inject(ElementRefService);
  protected findService = inject(FindInDocumentService);
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private _documentId = 'invalid';
  private documentIdSignal = signal<string>(this._documentId);
  @Input() set documentId(id: string) {
    this._documentId = id;
    this.documentIdSignal.set(id);
  }
  get documentId(): string {
    return this._documentId;
  }
  @Input() zenMode = false;
  @Input() tabsDisabled = false;

  /** Context menu data for element references */
  contextMenuData = signal<ElementRefContextData | null>(null);

  /** Tooltip data for element references */
  tooltipData = signal<ElementRefTooltipData | null>(null);

  editor!: Editor;
  toolbar: Toolbar = [
    ['bold', 'italic'],
    ['underline', 'strike'],
    [{ heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] }],
    ['align_left', 'align_center', 'align_right', 'align_justify'],
    ['horizontal_rule', 'format_clear'],
    ['undo', 'redo'],
  ];
  floatToolbar: Toolbar = [['bold', 'italic']];
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
  private idFormatted = false;
  private collaborationSetup = false;
  private destroyed = false; // Track if component is destroyed to prevent stale async operations
  protected editorKey = 0; // Increments when switching tabs to force ngx-editor recreation
  private cdr = inject(ChangeDetectorRef);

  readonly syncState = computed(() => {
    return this.documentService.getSyncStatusSignal(this.documentIdSignal())();
  });

  readonly wordCount = computed(() => {
    return this.documentService.getWordCountSignal(this.documentIdSignal())();
  });

  /** Element name for the current document */
  readonly elementName = computed(() => {
    const docId = this.documentIdSignal();
    const elements = this.projectState.elements();
    const element = elements.find(e => e.id === docId);
    return element?.name ?? 'Untitled';
  });

  constructor() {
    effect(() => {
      const isLoading = this.projectState.isLoading();
      if (!isLoading && !this.idFormatted) {
        this.ensureProperDocumentId();
        // ngAfterViewChecked will handle setupCollaboration once editor.view is ready
      }
    });

    // Watch for canWrite changes and update editor editable state
    // This handles the case where access info is loaded after initial render
    effect(() => {
      // Read canWrite to establish reactive dependency - changes trigger this effect
      const _canWrite = this.projectState.canWrite();
      // Only update if editor is initialized and collaboration is set up
      if (this.editor?.view && this.collaborationSetup) {
        this.updateEditableState();
      }
    });

    // Watch for element ref click events from the service
    effect(() => {
      const clickEvent = this.elementRefService.clickEvent();
      if (clickEvent) {
        // Get the element for display
        const element = this.elementRefService.getElementById(
          clickEvent.elementId
        );
        const originalName =
          element?.name ?? clickEvent.originalName ?? clickEvent.displayText;

        // Set context menu data
        this.contextMenuData.set({
          elementId: clickEvent.elementId,
          elementType: clickEvent.elementType,
          displayText: clickEvent.displayText,
          originalName,
          position: {
            x: clickEvent.mouseEvent.clientX,
            y: clickEvent.mouseEvent.clientY,
          },
          nodePos: clickEvent.nodePos,
        });

        // Clear the event from the service
        this.elementRefService.clearClickEvent();
      }
    });

    // Watch for tooltip data from the service
    effect(() => {
      const data = this.elementRefService.tooltipData();
      if (data) {
        this.tooltipData.set(data);
      } else {
        this.tooltipData.set(null);
      }
    });

    // Watch for insert image trigger from keyboard shortcut
    effect(() => {
      const triggerCount = this.insertImageService.triggerCount();
      // Only trigger if count > 0 (skip initial value)
      if (triggerCount > 0 && this.editor?.view && this.collaborationSetup) {
        void this.openInsertImageDialog();
      }
    });
  }

  ngOnInit(): void {
    console.log('[DocumentEditor] ngOnInit - documentId:', this.documentId);
    this.ensureProperDocumentId();

    // Only create editor if we have a valid documentId
    // Otherwise, ngOnChanges will create it when documentId is set by routing
    if (this.documentId && this.documentId !== 'invalid') {
      console.log(
        '[DocumentEditor] ngOnInit - creating editor for',
        this.documentId
      );
      this.editor = new Editor({
        history: true,
        schema: extendedSchema,
        features: { resizeImage: true },
      });
      this.editorKey++; // Force template refresh
      console.log(
        '[DocumentEditor] ngOnInit - editor created, doc size:',
        this.editor.view?.state.doc.content.size
      );
    } else {
      console.log(
        '[DocumentEditor] ngOnInit - waiting for valid documentId from routing'
      );
    }

    // Add custom styles for lint plugin
    this.addLintStyles();
  }

  ngAfterViewChecked(): void {
    // This runs after every view check, but we use collaborationSetup flag to only setup once
    // This catches both initial load and when ngx-editor is recreated via editorKey change
    if (
      this.documentId &&
      this.documentId !== 'invalid' &&
      !this.collaborationSetup &&
      this.editor.view // Ensure the view is actually initialized
    ) {
      // Validate documentId format before proceeding
      const parts = this.documentId.split(':');
      if (parts.length !== 3 || parts.some(part => !part.trim())) {
        console.error(
          `[DocumentEditor] Invalid documentId format: "${this.documentId}"`
        );
        return;
      }

      console.log(
        '[DocumentEditor] ngAfterViewChecked - calling setupCollaboration:',
        this.documentId
      );

      // CRITICAL: Set flag IMMEDIATELY to prevent multiple calls
      this.collaborationSetup = true;

      // Use requestAnimationFrame to ensure the view is fully rendered before setup
      requestAnimationFrame(() => {
        // Check if component was destroyed or editor changed while waiting
        if (this.destroyed || !this.editor?.view?.dom) {
          console.log(
            '[DocumentEditor] Skipping setupCollaboration - component destroyed or editor invalid'
          );
          this.collaborationSetup = false;
          return;
        }

        this.documentService
          .setupCollaboration(this.editor, this.documentId)
          .then(() => {
            // Check again after async operation
            if (this.destroyed || !this.editor?.view?.dom) {
              return;
            }
            console.log(
              `[DocumentEditor] setupCollaboration complete, editor doc size: ${this.editor.view.state.doc.nodeSize}`
            );

            // Register editor with find service for Ctrl+F support
            this.findService.setEditor(this.editor);

            // Set read-only mode for viewers who can't write
            this.updateEditableState();

            // Force change detection to update the view
            this.cdr.detectChanges();

            // Workaround for ngx-editor zoneless compatibility (NG0100 on image selection)
            // When clicking on images, ngx-editor's ImageViewComponent updates 'selected' state
            // during change detection, causing NG0100. We schedule a detectChanges after clicks.
            this.setupImageClickHandler();
          })
          .catch((error: unknown) => {
            console.error(
              `[DocumentEditor] Failed to setup collaboration for ${this.documentId}:`,
              error
            );
            // Reset flag on error to allow retry
            this.collaborationSetup = false;
          });
      });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['documentId'] && !changes['documentId'].firstChange) {
      const prevDocId = changes['documentId'].previousValue as string;
      const newDocId = changes['documentId'].currentValue as string;

      console.log('[DocumentEditor] ngOnChanges - switching tabs', {
        prevDocId,
        newDocId,
      });

      // CRITICAL: Destroy editor FIRST before disconnecting
      // This prevents Yjs awareness cleanup from trying to update a live editor
      if (prevDocId && prevDocId !== 'invalid') {
        console.log('[DocumentEditor] ngOnChanges - destroying old editor');
        this.editor.destroy();
        this.documentService.disconnect(prevDocId);
      }

      // Only setup new connection if we have a valid new documentId
      if (newDocId && newDocId !== 'invalid' && !newDocId.endsWith(':')) {
        this.idFormatted = false;
        this.collaborationSetup = false; // Reset collaboration flag

        // Recreate editor instance for the new document
        console.log(
          '[DocumentEditor] ngOnChanges - creating new editor for tab'
        );
        this.editor = new Editor({
          history: true,
          schema: extendedSchema,
          features: { resizeImage: true },
        });
        this.editorKey++; // Force template refresh
        console.log(
          '[DocumentEditor] ngOnChanges - new editor created, doc size:',
          this.editor.view?.state.doc.content.size
        );

        this.ensureProperDocumentId();

        // DO NOT call setupCollaboration here!
        // The editorKey increment will cause the template to recreate ngx-editor,
        // which will trigger ngAfterViewInit again, and it will call setupCollaboration
        // when the view is actually ready.
      }
    }
  }

  ngOnDestroy(): void {
    // Mark as destroyed to prevent stale async operations
    this.destroyed = true;

    // Clear find service editor reference
    this.findService.setEditor(null);

    // Destroy editor FIRST before disconnecting
    // This prevents awareness cleanup from trying to update a destroyed editor
    this.editor.destroy();

    // Now disconnect from Yjs - this will trigger awareness cleanup
    // but the editor is already destroyed so it won't crash
    if (!this.zenMode && this.documentId !== 'invalid' && this.documentId) {
      this.documentService.disconnect(this.documentId);
    }

    // Remove our custom style element if it exists
    if (
      typeof document !== 'undefined' &&
      document.getElementById('inkweld-lint-styles')
    ) {
      try {
        const styleElement = document.getElementById('inkweld-lint-styles');
        if (styleElement && styleElement.parentNode) {
          styleElement.parentNode.removeChild(styleElement);
        }
      } catch {
        // Ignore errors when removing lint styles
      }
    }
  }

  /**
   * Ensures the document ID has the proper format (username:project:docId)
   */
  private ensureProperDocumentId(): boolean {
    if (this.idFormatted) return true;
    if (
      this.documentId.includes(':') &&
      this.documentId.split(':').length === 3
    ) {
      this.idFormatted = true;
      return true;
    }
    const project = this.projectState.project();
    if (project) {
      const formattedId = `${project.username}:${project.slug}:${this.documentId}`;
      this.documentId = formattedId;
      this.idFormatted = true;
      return true;
    } else {
      return false;
    }
  }

  /**
   * Add global styles for the lint plugin decorations
   * This ensures the CSS is properly applied to the editor instance
   */
  private addLintStyles(): void {
    // Check if we're running in a browser environment
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      !document.head
    ) {
      return;
    }

    // Check if style already exists to avoid duplicates
    const styleId = 'inkweld-lint-styles';
    if (document.getElementById(styleId)) {
      return;
    }

    // Create a style element and add lint CSS
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .lint-error {
        background-color: rgba(255, 220, 0, 0.2) !important;
        border-bottom: 1px dashed #ffd700 !important;
        text-decoration: none !important;
        cursor: pointer;
        position: relative;
      }

      .lint-error:hover {
        background-color: rgba(255, 220, 0, 0.3) !important;
      }

      .ProseMirror .lint-error {
        background-color: rgba(255, 220, 0, 0.2) !important;
        border-bottom: 1px dashed #ffd700 !important;
        text-decoration: none !important;
      }

      /* Custom tooltip styles */
      .lint-tooltip {
        position: absolute;
        z-index: 1000;
        background-color: rgba(33, 33, 33, 0.95);
        color: white;
        border-radius: 4px;
        padding: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        max-width: 300px;
        white-space: pre-line;
        font-size: 14px;
        line-height: 1.4;
        display: none;
      }

      .lint-error:hover .lint-tooltip {
        display: block;
      }

      .lint-tooltip-title {
        font-weight: bold;
        margin-bottom: 4px;
      }

      .lint-tooltip-reason {
        font-style: italic;
        color: #e0e0e0;
        margin-bottom: 8px;
      }

      /* Styles for accept/reject buttons */
      .lint-action-buttons {
        display: flex;
        margin-top: 8px;
        justify-content: flex-end;
      }

      .lint-action-button {
        cursor: pointer !important;
        margin-left: 8px !important;
        padding: 4px 8px !important;
        border: none !important;
        border-radius: 3px !important;
        font-size: 12px !important;
        display: flex !important;
        align-items: center !important;
      }

      .lint-accept-button {
        background-color: #4caf50 !important;
        color: white !important;
      }

      .lint-reject-button {
        background-color: #f44336 !important;
        color: white !important;
      }

      .lint-action-button-icon {
        margin-right: 4px !important;
      }
    `;

    // Add to document head
    document.head.appendChild(style);

    // Add event handlers for accept/reject buttons (can be used for analytics later)
    document.addEventListener('lint-accept', ((event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      // Suggestion accepted - could add analytics here
      void customEvent;
    }) as EventListener);

    document.addEventListener('lint-reject', ((event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      // Suggestion rejected - could add analytics here
      void customEvent;
    }) as EventListener);
  }

  // Check if the cursor is currently inside a lint suggestion
  isCursorInLintSuggestion(): boolean {
    if (!this.editor || !this.editor.view) {
      return false;
    }

    const state = this.editor.view.state;
    const { selection } = state;
    const cursorPos = selection.from;

    // Get the lint plugin state
    const pluginState = lintPluginKey.getState(state);
    if (!pluginState?.suggestions || pluginState.suggestions.length === 0) {
      return false;
    }

    // Check if cursor is inside any suggestion
    for (const suggestion of pluginState.suggestions) {
      if (suggestion.startPos <= cursorPos && cursorPos <= suggestion.endPos) {
        return true;
      }
    }

    return false;
  }

  /**
   * Handle selection of an element from the popup
   * @param result The search result representing the selected element
   */
  onElementSelected(result: ElementSearchResult): void {
    if (!this.editor?.view) return;

    const attrs = this.elementRefService.createNodeAttrs({
      id: result.element.id,
      name: result.element.name,
      type: result.element.type,
    });

    insertElementRef(this.editor.view, attrs);
    this.elementRefService.closePopup();

    // Create a relationship in the centralized store
    // The source is the current document, the target is the referenced element
    this.relationshipService.addRelationship(
      this.documentId,
      result.element.id,
      'referenced-in',
      {
        displayText: result.element.name,
        documentContext: {
          documentId: this.documentId,
        },
      }
    );
  }

  /**
   * Handle actions from the element reference context menu
   * @param action The action object with type and data
   */
  onContextMenuAction(action: ElementRefAction): void {
    switch (action.type) {
      case 'close':
        this.contextMenuData.set(null);
        break;

      case 'navigate': {
        // Navigate to the element by opening it as a tab
        const element = this.elementRefService.getElementById(action.elementId);
        if (element) {
          this.projectState.openDocument(element);
        }
        this.contextMenuData.set(null);
        break;
      }

      case 'edit-text': {
        // Update the element reference display text
        if (this.editor?.view) {
          updateElementRefText(
            this.editor.view,
            action.nodePos,
            action.newText
          );
        }
        this.contextMenuData.set(null);
        break;
      }

      case 'delete': {
        // Delete the element reference from the document
        if (this.editor?.view) {
          deleteElementRef(this.editor.view, action.nodePos);
        }
        // Remove the relationship from the centralized store
        // Only remove if there are no other refs to this element in this document
        this.relationshipService.removeRelationshipsFromDocument(
          this.documentId,
          action.elementId
        );
        this.contextMenuData.set(null);
        break;
      }
    }
  }

  /**
   * Updates the editor's editable state based on user permissions.
   * Viewers cannot edit, so set editable to false for them.
   * When access info loads and user can write, set editable to true.
   */
  private updateEditableState(): void {
    const canWrite = this.projectState.canWrite();
    console.log('[DocumentEditor] updateEditableState - canWrite:', canWrite);

    if (this.editor?.view) {
      // Dispatch UPDATE_EDITABLE meta to set editor editable state
      const { dispatch, state } = this.editor.view;
      const tr = state.tr.setMeta('UPDATE_EDITABLE', canWrite);
      dispatch(tr);
      console.log(
        `[DocumentEditor] Editor set to ${canWrite ? 'editable' : 'read-only'} mode`
      );
    }
  }

  /**
   * Workaround for ngx-editor zoneless compatibility issue.
   *
   * ngx-editor's ImageViewComponent updates its 'selected' state during Angular's
   * change detection cycle when you click on an image. In zoneless mode, this causes
   * NG0100: ExpressionChangedAfterItHasBeenCheckedError.
   *
   * This workaround adds a click listener to the editor that detects clicks on images
   * and schedules a change detection cycle after a microtask, allowing ngx-editor's
   * internal state to settle before Angular checks for changes.
   */
  private setupImageClickHandler(): void {
    const editorDom = this.editor?.view?.dom;
    if (!editorDom) return;

    editorDom.addEventListener('click', event => {
      const target = event.target as HTMLElement;
      // Check if clicked on an image or image wrapper
      if (
        target.tagName === 'IMG' ||
        target.closest('.ngx-editor-image-view-wrapper')
      ) {
        // Schedule change detection after ngx-editor's internal state updates
        queueMicrotask(() => {
          this.cdr.detectChanges();
        });
      }
    });
  }

  /**
   * Open the tag editor dialog for this document
   */
  openTagsDialog(): void {
    const data: TagEditorDialogData = {
      elementId: this.documentId,
      elementName: this.elementName(),
    };

    this.dialog.open(TagEditorDialogComponent, {
      data,
      width: '450px',
      autoFocus: false,
    });
  }

  /**
   * Open the snapshots dialog for this document
   */
  openSnapshotsDialog(): void {
    const data: SnapshotsDialogData = {
      documentId: this.documentId,
      currentWordCount: this.wordCount(),
    };

    this.dialog.open(SnapshotsDialogComponent, {
      data,
      width: '550px',
      autoFocus: false,
    });
  }

  /**
   * Open the insert image dialog and insert the selected image into the document
   */
  async openInsertImageDialog(): Promise<void> {
    if (!this.editor?.view) return;

    const project = this.projectState.project();
    if (!project) return;

    // Store selection BEFORE opening dialog (dialog will steal focus)
    const storedPos = this.editor.view.state.selection.from;

    const result = await this.dialogGateway.openInsertImageDialog({
      username: project.username,
      slug: project.slug,
    });

    if (result?.mediaId && result?.imageBlob) {
      // Save the image to local storage
      const projectKey = `${project.username}/${project.slug}`;
      await this.localStorage.saveMedia(
        projectKey,
        result.mediaId,
        result.imageBlob
      );

      // Insert image at stored position
      const imageNode = this.editor.view.state.schema.nodes['image'].create({
        src: createMediaUrl(result.mediaId),
      });
      const tr = this.editor.view.state.tr.insert(storedPos, imageNode);
      this.editor.view.dispatch(tr);
      this.editor.view.focus();
    }
  }
}
