import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MockedObject, vi } from 'vitest';

import {
  CreateSnapshotDialogComponent,
  CreateSnapshotDialogData,
} from './create-snapshot-dialog.component';

describe('CreateSnapshotDialogComponent', () => {
  let component: CreateSnapshotDialogComponent;
  let fixture: ComponentFixture<CreateSnapshotDialogComponent>;
  let dialogRefMock: MockedObject<MatDialogRef<CreateSnapshotDialogComponent>>;
  let dialogData: CreateSnapshotDialogData;

  beforeEach(async () => {
    dialogRefMock = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<CreateSnapshotDialogComponent>>;

    dialogData = {
      wordCount: 500,
    };

    await TestBed.configureTestingModule({
      imports: [CreateSnapshotDialogComponent, ReactiveFormsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateSnapshotDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('form initialization', () => {
    it('should initialize form with empty values', () => {
      expect(component.form.get('name')?.value).toBe('');
      expect(component.form.get('description')?.value).toBe('');
    });

    it('should validate name max length', () => {
      const nameControl = component.form.get('name');
      nameControl?.setValue('a'.repeat(101));
      expect(nameControl?.hasError('maxlength')).toBe(true);
    });

    it('should validate description max length', () => {
      const descControl = component.form.get('description');
      descControl?.setValue('a'.repeat(501));
      expect(descControl?.hasError('maxlength')).toBe(true);
    });
  });

  describe('onSubmit', () => {
    it('should close dialog with result when form is valid', () => {
      component.form.patchValue({
        name: 'My Snapshot',
        description: 'A test description',
      });

      component.onSubmit();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        name: 'My Snapshot',
        description: 'A test description',
      });
    });

    it('should trim whitespace from name', () => {
      component.form.patchValue({
        name: '  My Snapshot  ',
        description: '',
      });

      component.onSubmit();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        name: 'My Snapshot',
        description: undefined,
      });
    });

    it('should trim whitespace from description', () => {
      component.form.patchValue({
        name: 'Test',
        description: '  My description  ',
      });

      component.onSubmit();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        name: 'Test',
        description: 'My description',
      });
    });

    it('should set description to undefined when empty', () => {
      component.form.patchValue({
        name: 'Test',
        description: '',
      });

      component.onSubmit();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        name: 'Test',
        description: undefined,
      });
    });

    it('should generate ISO date-time name when name is left blank', () => {
      component.form.patchValue({
        name: '',
        description: 'Test',
      });

      component.onSubmit();

      expect(dialogRefMock.close).toHaveBeenCalled();
      const result = dialogRefMock.close.mock.calls[0][0] as { name: string };
      // Verify the name is an ISO date-time string (starts with date format)
      expect(result.name).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('onCancel', () => {
    it('should close dialog without result', () => {
      component.onCancel();

      expect(dialogRefMock.close).toHaveBeenCalledWith();
    });
  });

  describe('dialog data', () => {
    it('should have access to word count from data', () => {
      expect(component.data.wordCount).toBe(500);
    });

    it('should handle undefined word count', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [CreateSnapshotDialogComponent, ReactiveFormsModule],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MatDialogRef, useValue: dialogRefMock },
          { provide: MAT_DIALOG_DATA, useValue: {} },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(CreateSnapshotDialogComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.data.wordCount).toBeUndefined();
    });
  });
});
