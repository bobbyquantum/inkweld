import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Editor, NgxEditorModule } from 'ngx-editor';

import { YjsService } from '../../services/yjs.service';

interface EditorDimensions {
  pageWidth: number; // in cm
  leftMargin: number; // in cm
  rightMargin: number; // in cm
}

type DragPoint = 'pageLeft' | 'pageRight' | 'marginLeft' | 'marginRight';

@Component({
  selector: 'app-element-editor',
  imports: [CommonModule, MatButtonModule, MatIconModule, NgxEditorModule],
  templateUrl: './element-editor.component.html',
  styleUrl: './element-editor.component.scss',
})
export class ElementEditorComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  @Input() documentId = 'default';

  editor!: Editor;
  zoomLevel = 100;
  dimensions: EditorDimensions = {
    pageWidth: 21,
    leftMargin: 2,
    rightMargin: 2,
  };
  rulerMeasurements = Array.from({ length: 35 }, (_, i) => i - 5);

  private isDragging = false;
  private currentDragPoint: DragPoint | null = null;
  private startX = 0;
  private startDimensions: EditorDimensions | null = null;

  constructor(private yjsService: YjsService) {}

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isDragging || !this.currentDragPoint || !this.startDimensions)
      return;

    const pixelsPerCm = 37.795275591 * (this.zoomLevel / 100); // Scale with zoom
    const delta = (event.clientX - this.startX) / pixelsPerCm;
    let newWidth: number;

    switch (this.currentDragPoint) {
      case 'pageLeft':
        newWidth = this.startDimensions.pageWidth - delta;
        if (newWidth >= 10 && newWidth <= 29.7) {
          this.dimensions.pageWidth = Math.round(newWidth * 2) / 2;
          if (
            this.dimensions.leftMargin + this.dimensions.rightMargin >
            this.dimensions.pageWidth - 5
          ) {
            this.dimensions.leftMargin = Math.max(
              0.5,
              this.dimensions.pageWidth - this.dimensions.rightMargin - 5
            );
          }
        }
        break;
      case 'pageRight':
        newWidth = this.startDimensions.pageWidth + delta;
        if (newWidth >= 10 && newWidth <= 29.7) {
          this.dimensions.pageWidth = Math.round(newWidth * 2) / 2;
          if (
            this.dimensions.leftMargin + this.dimensions.rightMargin >
            this.dimensions.pageWidth - 5
          ) {
            this.dimensions.rightMargin = Math.max(
              0.5,
              this.dimensions.pageWidth - this.dimensions.leftMargin - 5
            );
          }
        }
        break;
      case 'marginLeft':
        this.dimensions.leftMargin = Math.max(
          0.5,
          Math.min(
            this.dimensions.pageWidth - this.dimensions.rightMargin - 5,
            Math.round((this.startDimensions.leftMargin + delta) * 2) / 2
          )
        );
        break;
      case 'marginRight':
        this.dimensions.rightMargin = Math.max(
          0.5,
          Math.min(
            this.dimensions.pageWidth - this.dimensions.leftMargin - 5,
            Math.round((this.startDimensions.rightMargin - delta) * 2) / 2
          )
        );
        break;
    }

    this.updateDimensions();
  }

  @HostListener('document:mouseup')
  onMouseUp() {
    this.isDragging = false;
    this.currentDragPoint = null;
    this.startDimensions = null;
  }

  ngOnInit(): void {
    this.editor = new Editor();
    this.updateDimensions();
  }

  ngAfterViewInit(): void {
    // Setup collaboration after the editor view is initialized
    setTimeout(() => {
      this.yjsService
        .setupCollaboration(this.editor, this.documentId)
        .catch(error => {
          console.error('Failed to setup collaboration:', error);
        });
    }, 0);
  }

  ngOnDestroy(): void {
    this.editor.destroy();
    // Only disconnect this specific document
    this.yjsService.disconnect(this.documentId);
  }

  increaseZoom() {
    if (this.zoomLevel < 200) {
      this.zoomLevel += 10;
      this.updateZoom();
    }
  }

  decreaseZoom() {
    if (this.zoomLevel > 50) {
      this.zoomLevel -= 10;
      this.updateZoom();
    }
  }

  startDragging(event: MouseEvent, dragPoint: DragPoint) {
    this.isDragging = true;
    this.currentDragPoint = dragPoint;
    this.startX = event.clientX;
    this.startDimensions = { ...this.dimensions };
    event.preventDefault();
  }

  private updateZoom() {
    document.documentElement.style.setProperty(
      '--editor-zoom',
      (this.zoomLevel / 100).toString()
    );
  }

  private updateDimensions() {
    document.documentElement.style.setProperty(
      '--page-width',
      `${this.dimensions.pageWidth}cm`
    );
    document.documentElement.style.setProperty(
      '--margin-left',
      `${this.dimensions.leftMargin}cm`
    );
    document.documentElement.style.setProperty(
      '--margin-right',
      `${this.dimensions.rightMargin}cm`
    );
  }
}
