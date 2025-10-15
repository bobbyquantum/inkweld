import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MockedObject, vi } from 'vitest';

import { ProjectElementDto } from '../../../api-client/model/project-element-dto';
import { NewElementDialogComponent } from './new-element-dialog.component';

describe('NewElementDialogComponent', () => {
  let component: NewElementDialogComponent;
  let fixture: ComponentFixture<NewElementDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<NewElementDialogComponent>>;

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<NewElementDialogComponent>>;

    await TestBed.configureTestingModule({
      imports: [
        NewElementDialogComponent,
        ReactiveFormsModule,
        MatDialogModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatButtonModule,
        NoopAnimationsModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NewElementDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with default values', () => {
    expect(component.form.get('name')?.value).toBe('');
    expect(component.form.get('type')?.value).toBe(
      ProjectElementDto.TypeEnum.Item
    );
  });

  it('should validate required fields', () => {
    expect(component.form.valid).toBeFalsy();

    component.form.patchValue({
      name: 'Test Element',
      type: ProjectElementDto.TypeEnum.Item,
    });

    expect(component.form.valid).toBeTruthy();
  });

  it('should close dialog on cancel', () => {
    component.onCancel();
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('should close dialog with form value on create when valid', () => {
    const formValue = {
      name: 'Test Element',
      type: ProjectElementDto.TypeEnum.Item,
    };

    component.form.patchValue(formValue);
    component.onCreate();

    expect(dialogRef.close).toHaveBeenCalledWith(formValue);
  });

  it('should not close dialog on create when invalid', () => {
    component.onCreate();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
