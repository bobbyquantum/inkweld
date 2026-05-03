import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { type MockedObject, vi } from 'vitest';

import {
  RenameDialogComponent,
  type RenameDialogData,
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
    expect(component.name()).toBe(mockData.currentName);
  });

  it('should treat empty name as invalid for confirm', () => {
    component.name.set('');
    component.onConfirm();
    expect(mockDialogRef.close).not.toHaveBeenCalled();

    component.name.set('New Name');
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith('New Name');
  });

  it('should close dialog with new name on confirm', () => {
    const newName = 'New Test Name';
    component.name.set(newName);
    component.onConfirm();
    expect(mockDialogRef.close).toHaveBeenCalledWith(newName);
  });

  it('should not close dialog with invalid name on confirm', () => {
    component.name.set('');
    component.onConfirm();
    expect(mockDialogRef.close).not.toHaveBeenCalled();
  });

  it('should close dialog without value on cancel', () => {
    component.onCancel();
    expect(mockDialogRef.close).toHaveBeenCalledWith();
  });

  it('should disable confirm button when name is empty', async () => {
    component.name.set('');
    component.touched.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const confirmBtn = compiled.querySelector<HTMLButtonElement>(
      '[data-testid="rename-confirm-button"]'
    );
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn?.disabled).toBe(true);
  });
});
