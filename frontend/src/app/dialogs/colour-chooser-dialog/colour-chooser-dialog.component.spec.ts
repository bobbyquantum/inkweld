import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { ColourChooserDialogComponent } from './colour-chooser-dialog.component';

describe('ColourChooserDialogComponent', () => {
  let component: ColourChooserDialogComponent;
  let fixture: ComponentFixture<ColourChooserDialogComponent>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        ColourChooserDialogComponent,
        MatDialogModule,
        translocoTestProvider(),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: { colour: '#4fd8eb' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ColourChooserDialogComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with the provided colour', () => {
    expect(component.colour()).toBe('#4fd8eb');
  });

  it('should update the working colour on change', () => {
    component.onColourChange('#ff0000');
    expect(component.colour()).toBe('#ff0000');
  });

  it('should ignore an empty colour change', () => {
    component.onColourChange('');
    expect(component.colour()).toBe('#4fd8eb');
  });

  it('should close with the colour on apply', () => {
    component.onColourChange('#00ff00');
    component.onApply();
    expect(dialogRef.close).toHaveBeenCalledWith('#00ff00');
  });

  it('should close without a value on cancel', () => {
    component.onCancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
