import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { type MockedObject, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { MoveElementDialogComponent } from './move-element-dialog.component';

describe('MoveElementDialogComponent', () => {
  let component: MoveElementDialogComponent;
  let fixture: ComponentFixture<MoveElementDialogComponent>;
  let dialogRef: MockedObject<MatDialogRef<MoveElementDialogComponent>>;

  beforeEach(async () => {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<MoveElementDialogComponent>>;

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), MoveElementDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            elementName: 'Chapter One',
            fromPath: 'My Project',
            toPath: 'My Project › Part One',
            positionLabel: 'It will be placed inside "Part One".',
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MoveElementDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders the source path, destination path and position note', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('[data-testid="move-dialog-from"]')?.textContent
    ).toContain('My Project');
    expect(
      el.querySelector('[data-testid="move-dialog-to"]')?.textContent
    ).toContain('Part One');
    expect(
      el.querySelector('[data-testid="move-dialog-position"]')?.textContent
    ).toContain('inside "Part One"');
  });

  it('closes without a result on cancel', () => {
    component.onCancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('closes with dontAskAgain=false by default', () => {
    component.onConfirm();
    expect(dialogRef.close).toHaveBeenCalledWith({ dontAskAgain: false });
  });

  it('closes with dontAskAgain=true when the checkbox is ticked', () => {
    component['dontAskAgain'] = true;
    component.onConfirm();
    expect(dialogRef.close).toHaveBeenCalledWith({ dontAskAgain: true });
  });
});
