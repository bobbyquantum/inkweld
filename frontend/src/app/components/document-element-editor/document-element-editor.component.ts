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
import { DocumentService } from '@services/document.service';
import { ProjectStateService } from '@services/project-state.service';
import { SettingsService } from '@services/settings.service';
import { Editor, NgxEditorModule, Toolbar } from 'ngx-editor';

// Determine if we're in a test environment to avoid styleUrl issues in tests
const isTestEnvironment = () => {
  return (
    typeof process !== 'undefined' &&
    process.env &&
    process.env['JEST_WORKER_ID'] !== undefined
  );
};

@Component({
  selector: 'app-document-element-editor',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    NgxEditorModule,
    MatSelectModule,
    MatOptionModule,
    DragDropModule,
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
    // Skip if we're in a test environment
    if (isTestEnvironment()) {
      console.log('[DocumentEditor] Skipping lint styles in test environment');
      return;
    }

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
        text-decoration: red wavy underline;
        cursor: pointer;
        position: relative;
      }
      
      .lint-error:hover {
        background-color: rgba(255, 0, 0, 0.05);
      }
      
      .ProseMirror .lint-error {
        text-decoration: red wavy underline !important;
      }
    `;

    // Add to document head
    document.head.appendChild(style);
    console.log('[DocumentEditor] Added lint plugin styles to document');
  }
}
