import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { type MockedObject, vi } from 'vitest';

import {
  CreateSnapshotDialogComponent,
  type CreateSnapshotDialogData,
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
      imports: [CreateSnapshotDialogComponent],
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
      expect(component.model().name).toBe('');
      expect(component.model().description).toBe('');
    });

    it('should validate name max length', () => {
      component.form.name().value.set('a'.repeat(101));
      expect(component.form.name().invalid()).toBe(true);
      expect(
        component.form
          .name()
          .errors()
          .some(e => e.kind === 'maxLength')
      ).toBe(true);
    });

    it('should validate description max length', () => {
      component.form.description().value.set('a'.repeat(501));
      expect(component.form.description().invalid()).toBe(true);
      expect(
        component.form
          .description()
          .errors()
          .some(e => e.kind === 'maxLength')
      ).toBe(true);
    });
  });

  describe('onSubmit', () => {
    it('should close dialog with result when form is valid', () => {
      component.form.name().value.set('My Snapshot');
      component.form.description().value.set('A test description');

      component.onSubmit();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        name: 'My Snapshot',
        description: 'A test description',
      });
    });

    it('should trim whitespace from name', () => {
      component.form.name().value.set('  My Snapshot  ');
      component.form.description().value.set('');

      component.onSubmit();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        name: 'My Snapshot',
        description: undefined,
      });
    });

    it('should trim whitespace from description', () => {
      component.form.name().value.set('Test');
      component.form.description().value.set('  My description  ');

      component.onSubmit();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        name: 'Test',
        description: 'My description',
      });
    });

    it('should set description to undefined when empty', () => {
      component.form.name().value.set('Test');
      component.form.description().value.set('');

      component.onSubmit();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        name: 'Test',
        description: undefined,
      });
    });

    it('should generate ISO date-time name when name is left blank', () => {
      component.form.name().value.set('');
      component.form.description().value.set('Test');

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
        imports: [CreateSnapshotDialogComponent],
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
