import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MockedObject, vi } from 'vitest';

import { DocumentSnapshot } from '../../../api-client';
import {
  RestoreSnapshotDialogComponent,
  RestoreSnapshotDialogData,
} from './restore-snapshot-dialog.component';

describe('RestoreSnapshotDialogComponent', () => {
  let component: RestoreSnapshotDialogComponent;
  let fixture: ComponentFixture<RestoreSnapshotDialogComponent>;
  let dialogRefMock: MockedObject<MatDialogRef<RestoreSnapshotDialogComponent>>;
  let dialogData: RestoreSnapshotDialogData;

  const mockSnapshot: DocumentSnapshot = {
    id: 'snap-1',
    documentId: 'doc-1',
    name: 'Test Snapshot',
    description: 'A test snapshot',
    wordCount: 1000,
    createdAt: '2024-01-15T10:30:00Z',
  };

  beforeEach(async () => {
    dialogRefMock = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<RestoreSnapshotDialogComponent>>;

    dialogData = {
      snapshot: mockSnapshot,
      currentWordCount: 1500,
    };

    await TestBed.configureTestingModule({
      imports: [RestoreSnapshotDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RestoreSnapshotDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('dialog data', () => {
    it('should have access to snapshot from data', () => {
      expect(component.data.snapshot).toEqual(mockSnapshot);
    });

    it('should have access to current word count from data', () => {
      expect(component.data.currentWordCount).toBe(1500);
    });
  });

  describe('onConfirm', () => {
    it('should close dialog with true', () => {
      component.onConfirm();

      expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });
  });

  describe('onCancel', () => {
    it('should close dialog with false', () => {
      component.onCancel();

      expect(dialogRefMock.close).toHaveBeenCalledWith(false);
    });
  });

  describe('formatDate', () => {
    it('should format date string correctly', () => {
      const result = component.formatDate('2024-01-15T10:30:00Z');
      
      // The exact format depends on locale, but it should be a non-empty string
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format Date object correctly', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = component.formatDate(date);
      
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should handle invalid date gracefully', () => {
      const result = component.formatDate('invalid-date');
      
      // Invalid date should return "Invalid Date" string
      expect(result).toBe('Invalid Date');
    });
  });

  describe('with undefined currentWordCount', () => {
    it('should handle undefined current word count', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [RestoreSnapshotDialogComponent],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MatDialogRef, useValue: dialogRefMock },
          {
            provide: MAT_DIALOG_DATA,
            useValue: { snapshot: mockSnapshot } as RestoreSnapshotDialogData,
          },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(RestoreSnapshotDialogComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.data.currentWordCount).toBeUndefined();
    });
  });
});
