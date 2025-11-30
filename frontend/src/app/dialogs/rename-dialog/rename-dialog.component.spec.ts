import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MockedObject, vi } from 'vitest';

import {
  RenameDialogComponent,
  RenameDialogData,
} from './rename-dialog.component';

describe('RenameDialogComponent', () => {
  let component: RenameDialogComponent;
  let fixture: ComponentFixture<RenameDialogComponent>;
  let mockDialogRef: MockedObject<MatDialogRef<RenameDialogComponent>>;

  const mockData: RenameDialogData = {
    currentName: 'Test Item',
    title: 'Rename Test Item',
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    } as Partial<MatDialogRef<RenameDialogComponent>> as MockedObject<
      MatDialogRef<RenameDialogComponent>
    >;

    await TestBed.configureTestingModule({
      imports: [RenameDialogComponent, MatDialogModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockData },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RenameDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with current name', () => {
    expect(component.nameControl.value).toBe(mockData.currentName);
  });

  it('should validate required name', () => {
    component.nameControl.setValue('');
    expect(component.nameControl.valid).toBeFalsy();
    expect(component.nameControl.errors?.['required']).toBeTruthy();

    component.nameControl.setValue('New Name');
    expect(component.nameControl.valid).toBeTruthy();
    expect(component.nameControl.errors).toBeNull();
  });

  it('should close dialog with new name on confirm', () => {
    const newName = 'New Test Name';
    component.nameControl.setValue(newName);
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith(newName);
  });

  it('should not close dialog with invalid name on confirm', () => {
    component.nameControl.setValue('');
    component.onConfirm();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should close dialog without value on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith();
  });

  it('should show error when field is touched and empty', async () => {
    component.nameControl.setValue('');
    component.nameControl.markAsTouched();
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const error = compiled.querySelector('mat-error');
    expect(error).toBeTruthy();
    expect(error?.textContent).toContain('Name is required');
  });
});
