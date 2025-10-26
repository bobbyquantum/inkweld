import { DragDropModule } from '@angular/cdk/drag-drop';
import {
  AfterViewInit,
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
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { SettingsService } from '@services/settings.service';
import { Editor, NgxEditorModule, Toolbar } from 'ngx-editor';

import { LintFloatingMenuComponent } from '../lint/lint-floating-menu.component';
import { pluginKey as lintPluginKey } from '../lint/lint-plugin';
import { SnapshotPanelComponent } from '../snapshot-panel/snapshot-panel.component';

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
    LintFloatingMenuComponent,
    SnapshotPanelComponent,
  ],
  templateUrl: './document-element-editor.component.html',
  styleUrls: [
    './document-element-editor.component.scss',
    '../../components/lint/lint.css',
  ],
})
export class DocumentElementEditorComponent
  implements OnInit, OnDestroy, AfterViewInit, OnChanges
{
  private documentService = inject(DocumentService);
  private projectState = inject(ProjectStateService);
  private settingsService = inject(SettingsService);
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

  /** Whether to show the snapshot panel */
  showSnapshotPanel = signal(false);

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
  readonly syncState = computed(() => {
    const state = this.documentService.getSyncStatusSignal(
      this.documentIdSignal()
    )();
    console.log(
      `[DocumentEditor] computed syncState: ${state} for ${this.documentIdSignal()}`
    );
    return state;
  });
  // Reactive word count from DocumentService
  readonly wordCount = computed(() => {
    const count = this.documentService.getWordCountSignal(
      this.documentIdSignal()
    )();
    console.log(
      `[DocumentEditor] computed wordCount: ${count} for ${this.documentIdSignal()}`
    );
    return count;
  });

  constructor() {
    effect(() => {
      const isLoading = this.projectState.isLoading();
      if (!isLoading && !this.idFormatted) {
        this.ensureProperDocumentId();
        if (this.idFormatted && this.editor && this.editor.view) {
          this.setupCollaboration();
        }
      }
    });
  }

  ngOnInit(): void {
    this.ensureProperDocumentId();
    this.editor = new Editor({ history: true });

    // Add custom styles for lint plugin
    this.addLintStyles();
  }

  ngAfterViewInit(): void {
    this.setupCollaboration();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['documentId'] && !changes['documentId'].firstChange) {
      const prevDocId = changes['documentId'].previousValue as string;
      if (prevDocId && prevDocId !== 'invalid') {
        this.documentService.disconnect(prevDocId);
      }
      this.idFormatted = false;
      this.ensureProperDocumentId();
      this.setupCollaboration();
    }
  }

  ngOnDestroy(): void {
    this.editor.destroy();
    if (!this.zenMode && this.documentId !== 'invalid') {
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
      } catch (error) {
        console.log('[DocumentEditor] Error removing lint styles:', error);
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

  private setupCollaboration(): void {
    if (this.documentId === 'invalid') return;
    const isFormatted = this.ensureProperDocumentId();
    if (!isFormatted) return;
    setTimeout(() => {
      this.documentService
        .setupCollaboration(this.editor, this.documentId)
        .catch(error => {
          console.error(
            `[DocumentEditor] Failed to setup collaboration for ${this.documentId}:`,
            error
          );
        });
    }, 0);
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
      console.log(
        '[DocumentEditor] Skipping lint styles in non-browser environment'
      );
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
    console.log('[DocumentEditor] Added lint plugin styles to document');

    // Add event handlers for accept/reject buttons
    document.addEventListener('lint-accept', ((event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      console.log(
        '[DocumentEditor] Lint suggestion accepted:',
        customEvent.detail
      );
    }) as EventListener);

    document.addEventListener('lint-reject', ((event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      console.log(
        '[DocumentEditor] Lint suggestion rejected:',
        customEvent.detail
      );
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
      if (suggestion.from <= cursorPos && cursorPos <= suggestion.to) {
        return true;
      }
    }

    return false;
  }
}
