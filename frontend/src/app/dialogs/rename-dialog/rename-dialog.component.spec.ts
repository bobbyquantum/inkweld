import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import {
  RenameDialogComponent,
  RenameDialogData,
} from './rename-dialog.component';

describe('RenameDialogComponent', () => {
  let component: RenameDialogComponent;
  let fixture: ComponentFixture<RenameDialogComponent>;
  let mockDialogRef: vi.Mocked<MatDialogRef<RenameDialogComponent>>;

  const mockData: RenameDialogData = {
    currentName: 'Test Item',
    title: 'Rename Test Item',
  };

  beforeEach(async () => {
    mockDialogRef = {
      close: vi.fn(),
    } as Partial<MatDialogRef<RenameDialogComponent>> as vi.Mocked<
      MatDialogRef<RenameDialogComponent>
    >;

    await TestBed.configureTestingModule({
      imports: [RenameDialogComponent, NoopAnimationsModule, MatDialogModule],
      providers: [
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
});
