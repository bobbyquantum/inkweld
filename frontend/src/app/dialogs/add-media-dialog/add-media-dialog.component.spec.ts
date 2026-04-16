import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { describe, expect, it, vi } from 'vitest';

import {
  AddMediaDialogComponent,
  type AddMediaDialogData,
} from './add-media-dialog.component';

describe('AddMediaDialogComponent', () => {
  let component: AddMediaDialogComponent;
  let dialogRef: MatDialogRef<AddMediaDialogComponent>;

  function setup(data: AddMediaDialogData = { canGenerate: true }) {
    dialogRef = {
      close: vi.fn(),
    } as unknown as MatDialogRef<AddMediaDialogComponent>;

    TestBed.configureTestingModule({
      imports: [AddMediaDialogComponent, MatDialogModule, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    });

    const fixture = TestBed.createComponent(AddMediaDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    setup();
    expect(component).toBeTruthy();
  });

  it('should inject dialog data', () => {
    setup({ canGenerate: true, generateTooltip: 'AI enabled' });
    expect(component.data.canGenerate).toBe(true);
    expect(component.data.generateTooltip).toBe('AI enabled');
  });

  it('should close with upload on select("upload")', () => {
    setup();
    component.select('upload');
    expect(dialogRef.close).toHaveBeenCalledWith('upload');
  });

  it('should close with generate on select("generate")', () => {
    setup();
    component.select('generate');
    expect(dialogRef.close).toHaveBeenCalledWith('generate');
  });

  it('should pass canGenerate=false from dialog data', () => {
    setup({ canGenerate: false, generateTooltip: 'Not available' });
    expect(component.data.canGenerate).toBe(false);
    expect(component.data.generateTooltip).toBe('Not available');
  });
});
