import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  FieldConfigDialogComponent,
  type FieldConfigDialogData,
} from './field-config-dialog.component';

describe('FieldConfigDialogComponent', () => {
  let component: FieldConfigDialogComponent;
  let fixture: ComponentFixture<FieldConfigDialogComponent>;
  const dialogRefMock = { close: vi.fn() };

  const fieldTypes = [
    { value: 'text', label: 'Text' },
    { value: 'select', label: 'Select' },
    { value: 'textarea', label: 'Text Area' },
  ];

  const data: FieldConfigDialogData = {
    field: {
      key: 'gender',
      label: 'Gender',
      type: 'select',
      options: ['Male', 'Female'],
      layout: { span: 6 },
    },
    fieldTypes,
  };

  beforeEach(async () => {
    dialogRefMock.close.mockClear();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), FieldConfigDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FieldConfigDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should seed the form from the field data', () => {
    expect(component['label']()).toBe('Gender');
    expect(component['key']()).toBe('gender');
    expect(component['type']()).toBe('select');
    expect(component['options']()).toEqual(['Male', 'Female']);
    expect(component['span']()).toBe(6);
  });

  it('should close with a patch on save', () => {
    component['key'].set('gender');
    component['label'].set('Gender');
    component['options'].update(o => [...o, 'Other']);
    component['required'].set(true);

    component.onSave();

    expect(dialogRefMock.close).toHaveBeenCalledWith({
      key: 'gender',
      label: 'Gender',
      type: 'select',
      validation: { required: true },
      layout: { span: 6 },
      options: ['Male', 'Female', 'Other'],
    });
  });

  it('should set the span from a clicked grid cell', () => {
    component['onSpanCell'](7);
    expect(component['span']()).toBe(8);
  });

  it('should track the span during a handle drag', () => {
    const grid = document.createElement('div');
    grid.className = 'span-grid';
    grid.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, height: 0 }) as DOMRect;
    const handle = document.createElement('div');
    handle.className = 'span-handle';
    grid.appendChild(handle);

    component['spanDragging'] = true;
    component['updateSpanDrag']({
      currentTarget: handle,
      clientX: 100,
    } as unknown as PointerEvent);
    expect(component['span']()).toBe(6);
  });

  it('should ignore drag updates when not dragging', () => {
    component['span'].set(3);
    component['spanDragging'] = false;
    const grid = document.createElement('div');
    grid.className = 'span-grid';
    grid.getBoundingClientRect = () => ({ left: 0, width: 200 }) as DOMRect;
    component['updateSpanDrag']({
      currentTarget: grid,
      clientX: 150,
    } as unknown as PointerEvent);
    expect(component['span']()).toBe(3);
  });

  it('should include rows for textarea fields', () => {
    component['type'].set('textarea');
    component['rows'].set(6);
    component.onSave();
    expect(dialogRefMock.close).toHaveBeenCalledWith(
      expect.objectContaining({ rows: 6, type: 'textarea' })
    );
  });

  it('should not close when the key is empty', () => {
    component['key'].set('   ');
    component.onSave();
    expect(dialogRefMock.close).not.toHaveBeenCalled();
  });

  it('should close without a result on cancel', () => {
    component.onCancel();
    expect(dialogRefMock.close).toHaveBeenCalledWith();
  });
});
