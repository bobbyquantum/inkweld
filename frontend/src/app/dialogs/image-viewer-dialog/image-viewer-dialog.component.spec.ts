import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { vi } from 'vitest';

import {
  ImageViewerDialogComponent,
  ImageViewerDialogData,
} from './image-viewer-dialog.component';

describe('ImageViewerDialogComponent', () => {
  let component: ImageViewerDialogComponent;
  let fixture: ComponentFixture<ImageViewerDialogComponent>;

  const mockDialogRef = {
    close: vi.fn(),
  };

  const mockDialogData: ImageViewerDialogData = {
    imageUrl: 'http://example.com/test.jpg',
    fileName: 'test.jpg',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageViewerDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageViewerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display the image and filename', () => {
    const titleElement =
      fixture.nativeElement.querySelector('[mat-dialog-title]');
    const imageElement = fixture.nativeElement.querySelector(
      '.viewer-container img'
    );

    expect(titleElement.textContent).toContain('test.jpg');
    expect(imageElement.src).toContain('http://example.com/test.jpg');
    expect(imageElement.alt).toBe('test.jpg');
  });

  it('should close the dialog when closeDialog is called', () => {
    component.closeDialog();
    expect(mockDialogRef.close).toHaveBeenCalled();
  });

  it('should initialize zoom and pan at default values', () => {
    expect(component.zoomLevel()).toBe(1);
    expect(component.panX()).toBe(0);
    expect(component.panY()).toBe(0);
  });

  it('should zoom in on wheel towards cursor point', () => {
    const container = component.viewerContainer()?.nativeElement as HTMLElement;
    const image = component.imageElement()?.nativeElement as HTMLImageElement;

    // Mock layout sizes
    container.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          width: 200,
          height: 100,
          right: 200,
          bottom: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
    );
    Object.defineProperty(image, 'naturalWidth', { value: 400 });
    Object.defineProperty(image, 'naturalHeight', { value: 200 });

    const preventDefault = vi.fn();
    component.onWheel({
      deltaY: -100,
      clientX: 100,
      clientY: 50,
      preventDefault,
    } as unknown as WheelEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(component.zoomLevel()).toBeGreaterThan(1);
    expect(component.panX()).toBeCloseTo(0);
    expect(component.panY()).toBeCloseTo(0);
  });

  it('should toggle zoom on double click', () => {
    const container = component.viewerContainer()?.nativeElement as HTMLElement;
    container.getBoundingClientRect = vi.fn(
      () =>
        ({
          left: 0,
          top: 0,
          width: 300,
          height: 200,
          right: 300,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
    );

    // Zoom in from fit
    component.onDoubleClick({
      clientX: 150,
      clientY: 100,
      preventDefault: vi.fn(),
    } as unknown as MouseEvent);
    expect(component.zoomLevel()).toBeCloseTo(2);

    // Reset when already zoomed
    component.panX.set(25);
    component.panY.set(-10);
    component.onDoubleClick({
      clientX: 150,
      clientY: 100,
      preventDefault: vi.fn(),
    } as unknown as MouseEvent);
    expect(component.zoomLevel()).toBe(1);
    expect(component.panX()).toBe(0);
    expect(component.panY()).toBe(0);
  });

  it('should pan when dragging at zoomed level', () => {
    const container = component.viewerContainer()?.nativeElement as HTMLElement;
    container.setPointerCapture = vi.fn();
    container.releasePointerCapture = vi.fn();

    component.zoomLevel.set(2);
    component.onPointerDown({
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      target: container,
      preventDefault: vi.fn(),
    } as unknown as PointerEvent);

    component.onPointerMove({
      pointerId: 1,
      clientX: 30,
      clientY: 35,
    } as unknown as PointerEvent);

    expect(component.panX()).toBe(20);
    expect(component.panY()).toBe(25);

    component.onPointerUp({
      pointerId: 1,
      target: container,
    } as unknown as PointerEvent);
    expect(container.releasePointerCapture).toHaveBeenCalledWith(1);
  });
});
