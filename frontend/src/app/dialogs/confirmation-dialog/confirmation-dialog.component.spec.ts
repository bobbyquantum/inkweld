import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MockedObject, vi } from 'vitest';

import { ConfirmationDialogComponent } from './confirmation-dialog.component';

describe('ConfirmationDialogComponent', () => {
  let component: ConfirmationDialogComponent;
  let fixture: ComponentFixture<ConfirmationDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<ConfirmationDialogComponent>>;

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<ConfirmationDialogComponent>>;

    await TestBed.configureTestingModule({
      imports: [ConfirmationDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            title: 'Confirmation',
            message: 'Are you sure you want to leave this page?',
            cancelText: 'Stay on Page',
            confirmText: 'Leave Page',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmationDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should close dialog with false when canceling', () => {
    component.onCancel();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('should close dialog with true when confirming', () => {
    component.onConfirm();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('should render confirmation message and buttons', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('mat-dialog-content')?.textContent).toContain(
      'Are you sure you want to leave this page?'
    );

    const buttons = compiled.querySelectorAll('button');
    expect(buttons[0].textContent).toContain('Stay on Page');
    expect(buttons[1].textContent).toContain('Leave Page');
  });
});
