import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type MockedObject } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  CanvasFrameDialogComponent,
  type CanvasFrameDialogData,
} from './canvas-frame-dialog.component';

describe('CanvasFrameDialogComponent', () => {
  let component: CanvasFrameDialogComponent;
  let fixture: ComponentFixture<CanvasFrameDialogComponent>;
  let mockDialogRef: MockedObject<MatDialogRef<CanvasFrameDialogComponent>>;

  const baseData: CanvasFrameDialogData = {
    title: 'New Frame',
    name: 'Frame 1',
    width: 800,
    height: 600,
  };

  async function setup(data: CanvasFrameDialogData): Promise<void> {
    mockDialogRef = {
      close: vi.fn(),
    } as Partial<MatDialogRef<CanvasFrameDialogComponent>> as MockedObject<
      MatDialogRef<CanvasFrameDialogComponent>
    >;

    await TestBed.configureTestingModule({
      imports: [
        translocoTestProvider(),
        CanvasFrameDialogComponent,
        MatDialogModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CanvasFrameDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  describe('without position data', () => {
    beforeEach(async () => {
      await setup(baseData);
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize the model from the dialog data', () => {
      expect(component.model()).toEqual({
        name: 'Frame 1',
        width: '800',
        height: '600',
        x: '0',
        y: '0',
      });
    });

    it('should hide the position fields', () => {
      expect(component['showPosition']).toBe(false);
    });

    it('should close without a value on cancel', () => {
      component.onCancel();
      expect(mockDialogRef.close).toHaveBeenCalledWith();
    });

    it('should close with rounded numeric sizes on confirm', () => {
      component.model.set({
        name: '  Cover  ',
        width: '1024.4',
        height: '768.6',
        x: '0',
        y: '0',
      });
      component.onConfirm();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        name: 'Cover',
        width: 1024,
        height: 769,
      });
    });

    it('should not include x/y in the result', () => {
      component.onConfirm();
      const result = mockDialogRef.close.mock.calls[0][0];
      expect(result).toBeDefined();
      expect('x' in result!).toBe(false);
      expect('y' in result!).toBe(false);
    });

    it('should clamp sizes below the minimum to the data fallback', () => {
      component.model.set({
        name: 'Tiny',
        width: '4',
        height: '15.9',
        x: '0',
        y: '0',
      });
      component.onConfirm();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        name: 'Tiny',
        width: 800,
        height: 600,
      });
    });

    it('should fall back to data.width for a non-numeric width', () => {
      component.model.set({
        name: 'Frame',
        width: 'abc',
        height: '300',
        x: '0',
        y: '0',
      });
      component.onConfirm();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        name: 'Frame',
        width: 800,
        height: 300,
      });
    });

    it('should not close on confirm when the name is empty', () => {
      component.model.set({
        name: '',
        width: '800',
        height: '600',
        x: '0',
        y: '0',
      });
      component.onConfirm();
      expect(mockDialogRef.close).not.toHaveBeenCalled();
    });
  });

  describe('with position data', () => {
    beforeEach(async () => {
      await setup({ ...baseData, x: 10, y: 20, confirmLabel: 'Save' });
    });

    it('should show the position fields', () => {
      expect(component['showPosition']).toBe(true);
    });

    it('should initialize x/y in the model', () => {
      expect(component.model().x).toBe('10');
      expect(component.model().y).toBe('20');
    });

    it('should include rounded x/y in the result on confirm', () => {
      component.model.set({
        name: 'Frame 1',
        width: '800',
        height: '600',
        x: '10.6',
        y: '-20.4',
      });
      component.onConfirm();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        name: 'Frame 1',
        width: 800,
        height: 600,
        x: 11,
        y: -20,
      });
    });

    it('should fall back to data x/y for non-numeric coordinates', () => {
      component.model.set({
        name: 'Frame 1',
        width: '800',
        height: '600',
        x: 'nope',
        y: '',
      });
      component.onConfirm();
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        name: 'Frame 1',
        width: 800,
        height: 600,
        x: 10,
        y: 20,
      });
    });
  });
});
