import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TagEditDialogComponent,
  TagEditDialogData,
} from './tag-edit-dialog.component';

describe('TagEditDialogComponent', () => {
  let component: TagEditDialogComponent;
  let fixture: ComponentFixture<TagEditDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const mockDialogData: TagEditDialogData = {
    isNew: true,
  };

  beforeEach(async () => {
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [TagEditDialogComponent, NoopAnimationsModule, FormsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TagEditDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize with default values for new tag', () => {
      expect(component.name()).toBe('');
      expect(component.icon()).toBe('label');
      expect(component.color()).toBe('#607D8B');
      expect(component.description()).toBe('');
    });

    it('should initialize with existing tag values for edit', async () => {
      const editData: TagEditDialogData = {
        isNew: false,
        tag: {
          id: 'test-tag',
          name: 'Test Tag',
          icon: 'star',
          color: '#FFD700',
          description: 'Test description',
        },
      };

      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [TagEditDialogComponent, NoopAnimationsModule, FormsModule],
        providers: [
          provideZonelessChangeDetection(),
          { provide: MatDialogRef, useValue: dialogRef },
          { provide: MAT_DIALOG_DATA, useValue: editData },
        ],
      }).compileComponents();

      const editFixture = TestBed.createComponent(TagEditDialogComponent);
      const editComponent = editFixture.componentInstance;

      expect(editComponent.name()).toBe('Test Tag');
      expect(editComponent.icon()).toBe('star');
      expect(editComponent.color()).toBe('#FFD700');
      expect(editComponent.description()).toBe('Test description');
    });
  });

  describe('getTextColor', () => {
    it('should return black for light background', () => {
      expect(component.getTextColor('#FFFFFF')).toBe('#000000');
      expect(component.getTextColor('#FFD700')).toBe('#000000');
    });

    it('should return white for dark background', () => {
      expect(component.getTextColor('#000000')).toBe('#ffffff');
      expect(component.getTextColor('#DC143C')).toBe('#ffffff');
    });
  });

  describe('onCancel', () => {
    it('should close dialog without result', () => {
      component.onCancel();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });
  });

  describe('onSave', () => {
    it('should not close dialog if name is empty', () => {
      component.name.set('');
      component.onSave();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should not close dialog if name is whitespace', () => {
      component.name.set('   ');
      component.onSave();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('should close dialog with result when valid', () => {
      component.name.set('New Tag');
      component.icon.set('flag');
      component.color.set('#FF0000');
      component.description.set('A description');

      component.onSave();

      expect(dialogRef.close).toHaveBeenCalledWith({
        name: 'New Tag',
        icon: 'flag',
        color: '#FF0000',
        description: 'A description',
      });
    });

    it('should trim the name', () => {
      component.name.set('  Trimmed Tag  ');
      component.onSave();

      expect(dialogRef.close).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Trimmed Tag',
        })
      );
    });

    it('should set description to undefined if empty', () => {
      component.name.set('Test');
      component.description.set('');
      component.onSave();

      expect(dialogRef.close).toHaveBeenCalledWith(
        expect.objectContaining({
          description: undefined,
        })
      );
    });
  });

  describe('iconOptions', () => {
    it('should have icon options available', () => {
      expect(component.iconOptions.length).toBeGreaterThan(0);
      expect(component.iconOptions).toContain('star');
      expect(component.iconOptions).toContain('label');
    });
  });

  describe('colorOptions', () => {
    it('should have 16 color options available', () => {
      expect(component.colorOptions.length).toBe(16);
      expect(component.colorOptions).toContain('#DC143C'); // Crimson
      expect(component.colorOptions).toContain('#607D8B'); // Blue gray
    });
  });
});
