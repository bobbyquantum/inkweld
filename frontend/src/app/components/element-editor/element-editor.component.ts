import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  inject,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Editor, NgxEditorModule } from 'ngx-editor';
import { fromEvent, Subject, Subscription } from 'rxjs';
import { filter, map, takeUntil } from 'rxjs/operators';

import { DocumentService } from '../../services/document.service';

interface MouseDragEvent {
  type: 'start' | 'move' | 'end';
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
}

interface EditorDimensions {
  pageWidth: number; // in cm
  leftMargin: number; // in cm
  rightMargin: number; // in cm
}

type DragPoint = 'pageLeft' | 'pageRight' | 'marginLeft' | 'marginRight';

@Component({
  selector: 'app-element-editor',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    NgxEditorModule,
    MatSelectModule,
    MatOptionModule,
  ],
  templateUrl: './element-editor.component.html',
  styleUrl: './element-editor.component.scss',
})
export class ElementEditorComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  @Input() documentId = 'default';
  editor!: Editor;
  zoomLevel = 100;
  viewMode: 'page' | 'fitWidth' = 'fitWidth';
  showViewModeDropdown = false;
  dimensions: EditorDimensions = {
    pageWidth: 21,
    leftMargin: 2,
    rightMargin: 2,
  };
  rulerMeasurements = Array.from({ length: 35 }, (_, i) => i - 5);

  private destroy$ = new Subject<void>();
  private documentService = inject(DocumentService);
  private documentElement = document.documentElement;

  // Drag handling
  private dragStart$ = new Subject<MouseDragEvent>();
  private dragMove$ = new Subject<MouseDragEvent>();
  private dragEnd$ = new Subject<MouseDragEvent>();
  private startX = 0;
  private startY = 0;
  private moveSubscription?: Subscription;
  private upSubscription?: Subscription;
  private blurSubscription?: Subscription;

  constructor() {
    this.setupDocumentListeners();
  }

  ngOnInit(): void {
    this.editor = new Editor();
    this.updateDimensions();
  }

  ngAfterViewInit(): void {
    this.setupCollaboration();
    this.setupDragHandlers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.editor.destroy();
    this.documentService.disconnect(this.documentId);
    this.cleanupSubscriptions();
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

  startDragging(event: MouseEvent, dragPoint: DragPoint): void {
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.dragStart$.next({
      type: 'start',
      clientX: event.clientX,
      clientY: event.clientY,
      deltaX: 0,
      deltaY: 0,
    });

    this.dragMove$
      .pipe(takeUntil(this.dragEnd$))
      .subscribe(dragEvent => this.handleDrag(dragEvent, dragPoint));
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

  private setVariable(name: string, value: string): void {
    this.documentElement.style.setProperty(name, value);
  }

  private removeVariable(name: string): void {
    this.documentElement.style.removeProperty(name);
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

  private setupDocumentListeners(): void {
    this.moveSubscription = fromEvent<MouseEvent>(document, 'mousemove')
      .pipe(
        filter(() => this.dragStart$.observed || this.dragMove$.observed),
        map(event => ({
          type: 'move' as const,
          clientX: event.clientX,
          clientY: event.clientY,
          deltaX: event.clientX - this.startX,
          deltaY: event.clientY - this.startY,
        }))
      )
      .subscribe(event => this.dragMove$.next(event));

    this.upSubscription = fromEvent<MouseEvent>(document, 'mouseup')
      .pipe(
        filter(() => this.dragStart$.observed || this.dragEnd$.observed),
        map(event => ({
          type: 'end' as const,
          clientX: event.clientX,
          clientY: event.clientY,
          deltaX: event.clientX - this.startX,
          deltaY: event.clientY - this.startY,
        }))
      )
      .subscribe(event => {
        this.dragEnd$.next(event);
        this.cleanupSubscriptions();
      });

    this.blurSubscription = fromEvent(window, 'blur').subscribe(() => {
      this.dragEnd$.next({
        type: 'end',
        clientX: this.startX,
        clientY: this.startY,
        deltaX: 0,
        deltaY: 0,
      });
      this.cleanupSubscriptions();
    });
  }

  private cleanupSubscriptions(): void {
    if (
      !this.dragStart$.observed &&
      !this.dragMove$.observed &&
      !this.dragEnd$.observed
    ) {
      this.moveSubscription?.unsubscribe();
      this.upSubscription?.unsubscribe();
      this.blurSubscription?.unsubscribe();
    }
  }

  private setupCollaboration(): void {
    setTimeout(() => {
      this.documentService
        .setupCollaboration(this.editor, this.documentId)
        .catch(error => {
          console.error('Failed to setup collaboration:', error);
        });
    }, 0);
  }

  private setupDragHandlers(): void {
    this.dragEnd$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateDimensions());
  }

  private handleDrag(dragEvent: MouseDragEvent, dragPoint: DragPoint): void {
    const pixelsPerCm = 37.795275591 * (this.zoomLevel / 100);
    const delta = dragEvent.deltaX / pixelsPerCm;

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
      this.dimensions.pageWidth = Math.round(newWidth * 2) / 2;
      this.adjustMarginsForNewWidth();
    }
  }

  private adjustLeftMargin(delta: number): void {
    this.dimensions.leftMargin = Math.max(
      0.5,
      Math.min(
        this.dimensions.pageWidth - this.dimensions.rightMargin - 5,
        Math.round((this.dimensions.leftMargin + delta) * 2) / 2
      )
    );
  }

  private adjustRightMargin(delta: number): void {
    this.dimensions.rightMargin = Math.max(
      0.5,
      Math.min(
        this.dimensions.pageWidth - this.dimensions.leftMargin - 5,
        Math.round((this.dimensions.rightMargin + delta) * 2) / 2
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
