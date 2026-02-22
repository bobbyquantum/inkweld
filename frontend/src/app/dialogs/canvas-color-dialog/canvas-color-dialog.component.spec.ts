import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MockedObject, vi } from 'vitest';

import {
  CanvasColorDialogComponent,
  CanvasColorDialogData,
} from './canvas-color-dialog.component';

describe('CanvasColorDialogComponent', () => {
  let component: CanvasColorDialogComponent;
  let fixture: ComponentFixture<CanvasColorDialogComponent>;
  let mockDialogRef: MockedObject<MatDialogRef<CanvasColorDialogComponent>>;

  const mockData: CanvasColorDialogData = {
    title: 'Edit Colors',
    showFill: true,
    showStroke: true,
    fill: '#FF0000',
    stroke: '#000000',
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    } as Partial<MatDialogRef<CanvasColorDialogComponent>> as MockedObject<
      MatDialogRef<CanvasColorDialogComponent>
    >;

    await TestBed.configureTestingModule({
      imports: [CanvasColorDialogComponent, MatDialogModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CanvasColorDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize fill and stroke from data', () => {
    expect(component['selectedFill']).toBe('#FF0000');
    expect(component['selectedStroke']).toBe('#000000');
  });

  it('should close dialog on cancel', () => {
    component['onCancel']();
    expect(mockDialogRef.close).toHaveBeenCalledWith();
  });

  it('should close with fill and stroke on confirm', () => {
    component['onConfirm']();
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      fill: '#FF0000',
      stroke: '#000000',
    });
  });

  it('should update fill color', () => {
    component['onFillChange']('#00FF00');
    expect(component['selectedFill']).toBe('#00FF00');
  });

  it('should update stroke color', () => {
    component['onStrokeChange']('#0000FF');
    expect(component['selectedStroke']).toBe('#0000FF');
  });

  it('should only include fill in result when showFill is true', async () => {
    const fillOnlyData: CanvasColorDialogData = {
      title: 'Edit Colors',
      showFill: true,
      showStroke: false,
      fill: '#FF0000',
    };

    await TestBed.resetTestingModule()
      .configureTestingModule({
        imports: [CanvasColorDialogComponent, MatDialogModule],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MatDialogRef, useValue: mockDialogRef },
          { provide: MAT_DIALOG_DATA, useValue: fillOnlyData },
        ],
      })
      .compileComponents();

    const newFixture = TestBed.createComponent(CanvasColorDialogComponent);
    const newComponent = newFixture.componentInstance;
    newFixture.detectChanges();

    vi.clearAllMocks();
    newComponent['onConfirm']();
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      fill: '#FF0000',
    });
  });
});
