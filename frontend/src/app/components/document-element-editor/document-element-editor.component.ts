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

@Component({
  selector: 'app-document-element-editor',
  imports: [
    MatButtonModule,
    MatIconModule,
    NgxEditorModule,
    MatSelectModule,
    MatOptionModule,
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
  private destroy$ = new Subject<void>();
  private idFormatted = false;

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
    this.previousDocumentId = this.documentId;
    this.editor = new Editor({ history: true });
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
      this.previousDocumentId = this.documentId;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.editor.destroy();
    if (!this.zenMode && this.documentId !== 'invalid') {
      this.documentService.disconnect(this.documentId);
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
}
