import {
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ImageViewerDialogData {
  imageUrl: string;
  fileName: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

@Component({
  selector: 'app-image-viewer-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './image-viewer-dialog.component.html',
  styleUrl: './image-viewer-dialog.component.scss',
})
export class ImageViewerDialogComponent {
  dialogRef = inject(MatDialogRef<ImageViewerDialogComponent>);
  data = inject<ImageViewerDialogData>(MAT_DIALOG_DATA);

  viewerContainer = viewChild<ElementRef<HTMLElement>>('viewerContainer');
  imageElement = viewChild<ElementRef<HTMLImageElement>>('imageElement');

  // Zoom and pan state
  zoomLevel = signal(MIN_ZOOM);
  panX = signal(0);
  panY = signal(0);

  // Pointer tracking for pan/pinch
  private activePointers = new Map<
    number,
    { x: number; y: number; startX: number; startY: number }
  >();
  private lastPan = { x: 0, y: 0 };
  private initialPinchDistance = 0;
  private initialPinchCenter = { x: 0, y: 0 };
  private initialZoom = 1;
  private initialPanForPinch = { x: 0, y: 0 };

  closeDialog(): void {
    this.dialogRef.close();
  }

  /**
   * Wheel zoom - zooms towards cursor position
   */
  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const container = this.viewerContainer()?.nativeElement;
    if (!container) return;

    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const oldZoom = this.zoomLevel();
    const newZoom = this.clampZoom(oldZoom * zoomFactor);

    if (newZoom === oldZoom) return;

    // Get cursor position relative to container center
    const rect = container.getBoundingClientRect();
    const cursorX = event.clientX - rect.left - rect.width / 2;
    const cursorY = event.clientY - rect.top - rect.height / 2;

    // Adjust pan to zoom towards cursor
    this.applyZoomTowardsPoint(oldZoom, newZoom, cursorX, cursorY);
  }

  /**
   * Pointer down - start pan or pinch gesture
   */
  onPointerDown(event: PointerEvent): void {
    event.preventDefault();
    const target = event.target as HTMLElement;
    target.setPointerCapture(event.pointerId);

    this.activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    });

    if (this.activePointers.size === 1) {
      // Single pointer - record pan start
      this.lastPan = { x: this.panX(), y: this.panY() };
    } else if (this.activePointers.size === 2) {
      // Two pointers - start pinch zoom
      this.initPinchZoom();
    }
  }

  /**
   * Pointer move - handle pan or pinch
   */
  onPointerMove(event: PointerEvent): void {
    const pointer = this.activePointers.get(event.pointerId);
    if (!pointer) return;

    // Update pointer position
    this.activePointers.set(event.pointerId, {
      ...pointer,
      x: event.clientX,
      y: event.clientY,
    });

    if (this.activePointers.size === 1) {
      this.handlePan(pointer, event);
    } else if (this.activePointers.size === 2) {
      this.handlePinchZoom();
    }
  }

  /**
   * Pointer up - end gesture
   */
  onPointerUp(event: PointerEvent): void {
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.activePointers.delete(event.pointerId);

    if (this.activePointers.size === 0) {
      this.initialPinchDistance = 0;
      // Constrain pan after gesture ends
      this.constrainPan();
    } else if (this.activePointers.size === 1) {
      // Transitioning from pinch to single pointer pan
      const remaining = Array.from(this.activePointers.values())[0];
      this.activePointers.set(Array.from(this.activePointers.keys())[0], {
        ...remaining,
        startX: remaining.x,
        startY: remaining.y,
      });
      this.lastPan = { x: this.panX(), y: this.panY() };
    }
  }

  onDragStart(event: DragEvent): void {
    event.preventDefault();
  }

  /**
   * Double-tap/click to toggle zoom
   */
  onDoubleClick(event: MouseEvent): void {
    event.preventDefault();
    const container = this.viewerContainer()?.nativeElement;
    if (!container) return;

    const currentZoom = this.zoomLevel();
    const rect = container.getBoundingClientRect();
    const cursorX = event.clientX - rect.left - rect.width / 2;
    const cursorY = event.clientY - rect.top - rect.height / 2;

    if (currentZoom > MIN_ZOOM) {
      // Reset to fit
      this.zoomLevel.set(MIN_ZOOM);
      this.panX.set(0);
      this.panY.set(0);
    } else {
      // Zoom in to 2x towards cursor
      const targetZoom = 2;
      this.applyZoomTowardsPoint(currentZoom, targetZoom, cursorX, cursorY);
    }
  }

  getTransform(): string {
    return `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoomLevel()})`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private clampZoom(zoom: number): number {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
  }

  /**
   * Zoom towards a specific point (cursor or pinch center)
   */
  private applyZoomTowardsPoint(
    oldZoom: number,
    newZoom: number,
    pointX: number,
    pointY: number
  ): void {
    // Calculate how much the point shifts due to zoom change
    // Point under cursor should stay at same visual position
    const scale = newZoom / oldZoom;
    const currentPanX = this.panX();
    const currentPanY = this.panY();

    // New pan = oldPan - point * (scale - 1)
    // This keeps the point under the cursor stationary
    const newPanX = currentPanX * scale - pointX * (scale - 1);
    const newPanY = currentPanY * scale - pointY * (scale - 1);

    this.zoomLevel.set(newZoom);
    this.panX.set(newPanX);
    this.panY.set(newPanY);

    // Reset pan if zooming back to min
    if (newZoom === MIN_ZOOM) {
      this.panX.set(0);
      this.panY.set(0);
    } else {
      this.constrainPan();
    }
  }

  private initPinchZoom(): void {
    const pointers = Array.from(this.activePointers.values());
    const [p1, p2] = pointers;

    this.initialPinchDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    this.initialZoom = this.zoomLevel();
    this.initialPanForPinch = { x: this.panX(), y: this.panY() };

    // Pinch center relative to container center
    const container = this.viewerContainer()?.nativeElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      this.initialPinchCenter = {
        x: (p1.x + p2.x) / 2 - rect.left - rect.width / 2,
        y: (p1.y + p2.y) / 2 - rect.top - rect.height / 2,
      };
    }
  }

  private handlePan(
    startPointer: { startX: number; startY: number },
    event: PointerEvent
  ): void {
    // Only pan when zoomed in
    if (this.zoomLevel() <= MIN_ZOOM) return;

    const dx = event.clientX - startPointer.startX;
    const dy = event.clientY - startPointer.startY;

    this.panX.set(this.lastPan.x + dx);
    this.panY.set(this.lastPan.y + dy);
  }

  private handlePinchZoom(): void {
    if (this.initialPinchDistance === 0) return;

    const pointers = Array.from(this.activePointers.values());
    const [p1, p2] = pointers;

    const currentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const scaleFactor = currentDistance / this.initialPinchDistance;
    const newZoom = this.clampZoom(this.initialZoom * scaleFactor);

    // Calculate current pinch center
    const container = this.viewerContainer()?.nativeElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const currentCenterX = (p1.x + p2.x) / 2 - rect.left - rect.width / 2;
    const currentCenterY = (p1.y + p2.y) / 2 - rect.top - rect.height / 2;

    // Zoom towards initial pinch center, adjusted for finger movement
    const scale = newZoom / this.initialZoom;
    const panDeltaX = currentCenterX - this.initialPinchCenter.x;
    const panDeltaY = currentCenterY - this.initialPinchCenter.y;

    const newPanX =
      this.initialPanForPinch.x * scale -
      this.initialPinchCenter.x * (scale - 1) +
      panDeltaX;
    const newPanY =
      this.initialPanForPinch.y * scale -
      this.initialPinchCenter.y * (scale - 1) +
      panDeltaY;

    this.zoomLevel.set(newZoom);
    this.panX.set(newPanX);
    this.panY.set(newPanY);
  }

  /**
   * Constrain pan so image edges stay within container when possible
   */
  private constrainPan(): void {
    const container = this.viewerContainer()?.nativeElement;
    const img = this.imageElement()?.nativeElement;
    if (!container || !img) return;

    const zoom = this.zoomLevel();
    if (zoom <= MIN_ZOOM) {
      this.panX.set(0);
      this.panY.set(0);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const imgNaturalWidth = img.naturalWidth || img.offsetWidth;
    const imgNaturalHeight = img.naturalHeight || img.offsetHeight;

    // Calculate displayed image size at zoom=1 (fitted within container)
    const containerW = containerRect.width;
    const containerH = containerRect.height;
    const imgAspect = imgNaturalWidth / imgNaturalHeight;
    const containerAspect = containerW / containerH;

    let baseWidth: number, baseHeight: number;
    if (imgAspect > containerAspect) {
      baseWidth = containerW;
      baseHeight = containerW / imgAspect;
    } else {
      baseHeight = containerH;
      baseWidth = containerH * imgAspect;
    }

    const scaledWidth = baseWidth * zoom;
    const scaledHeight = baseHeight * zoom;

    // Calculate max pan (how far the image extends beyond container)
    const maxPanX = Math.max(0, (scaledWidth - containerW) / 2);
    const maxPanY = Math.max(0, (scaledHeight - containerH) / 2);

    // Clamp pan values
    this.panX.set(Math.max(-maxPanX, Math.min(maxPanX, this.panX())));
    this.panY.set(Math.max(-maxPanY, Math.min(maxPanY, this.panY())));
  }
}
