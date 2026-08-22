import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  IconPickerDialogComponent,
  type IconPickerDialogData,
} from './icon-picker-dialog.component';

describe('IconPickerDialogComponent', () => {
  let component: IconPickerDialogComponent;
  let fixture: ComponentFixture<IconPickerDialogComponent>;
  const dialogRefMock = { close: vi.fn() };

  const data: IconPickerDialogData = {
    current: 'person',
    icons: ['person', 'place', 'map'],
    titleKey: 'templates.editor.iconLabel',
  };

  beforeEach(async () => {
    dialogRefMock.close.mockClear();
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), IconPickerDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(IconPickerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should seed the selection from the current icon', () => {
    expect(component['selected']()).toBe('person');
  });

  it('should update the selection when an icon is chosen', () => {
    component['choose']('map');
    expect(component['selected']()).toBe('map');
  });

  it('should close with the selected icon on confirm', () => {
    component['choose']('place');
    component.onConfirm();
    expect(dialogRefMock.close).toHaveBeenCalledWith('place');
  });

  it('should close without a result on cancel', () => {
    component.onCancel();
    expect(dialogRefMock.close).toHaveBeenCalledWith();
  });
});
