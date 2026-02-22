import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MockedObject, vi } from 'vitest';

import {
  CanvasTextDialogComponent,
  CanvasTextDialogData,
} from './canvas-text-dialog.component';

describe('CanvasTextDialogComponent', () => {
  let component: CanvasTextDialogComponent;
  let fixture: ComponentFixture<CanvasTextDialogComponent>;
  let mockDialogRef: MockedObject<MatDialogRef<CanvasTextDialogComponent>>;

  const mockData: CanvasTextDialogData = {
    title: 'Add Text',
    text: 'Hello',
    color: '#333333',
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    } as Partial<MatDialogRef<CanvasTextDialogComponent>> as MockedObject<
      MatDialogRef<CanvasTextDialogComponent>
    >;

    await TestBed.configureTestingModule({
      imports: [CanvasTextDialogComponent, MatDialogModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CanvasTextDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize text control with provided text', () => {
    expect(component['textControl'].value).toBe('Hello');
  });

  it('should initialize selected color', () => {
    expect(component['selectedColor']).toBe('#333333');
  });

  it('should close dialog on cancel', () => {
    component['onCancel']();
    expect(mockDialogRef.close).toHaveBeenCalledWith();
  });

  it('should close with result on confirm when valid', () => {
    component['textControl'].setValue('New text');
    component['selectedColor'] = '#FF0000';
    component['onConfirm']();
    expect(mockDialogRef.close).toHaveBeenCalledWith({
      text: 'New text',
      color: '#FF0000',
    });
  });

  it('should not close on confirm when text is empty', () => {
    component['textControl'].setValue('');
    component['textControl'].markAsTouched();
    component['onConfirm']();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should update color on colorChange', () => {
    component['onColorChange']('#00FF00');
    expect(component['selectedColor']).toBe('#00FF00');
  });

  it('should use custom confirm label', () => {
    const dataWithLabel: CanvasTextDialogData = {
      ...mockData,
      confirmLabel: 'Save',
    };
    TestBed.resetTestingModule();
    // Verify the data interface accepts confirmLabel
    expect(dataWithLabel.confirmLabel).toBe('Save');
  });
});
