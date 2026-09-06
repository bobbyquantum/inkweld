import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { GREGORIAN_SYSTEM } from '@models/time-system';
import { describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  SceneDetailsDialogComponent,
  type SceneDetailsDialogData,
} from './scene-details-dialog.component';

describe('SceneDetailsDialogComponent', () => {
  let fixture: ComponentFixture<SceneDetailsDialogComponent>;
  let component: SceneDetailsDialogComponent;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  async function setup(
    data: Partial<SceneDetailsDialogData> = {}
  ): Promise<void> {
    dialogRef = { close: vi.fn() };
    const dialogData: SceneDetailsDialogData = {
      elementName: 'The Gate',
      metadata: {},
      timeSystems: [GREGORIAN_SYSTEM],
      ...data,
    };
    await TestBed.configureTestingModule({
      imports: [SceneDetailsDialogComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SceneDetailsDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  it('starts empty for a scene without metadata', async () => {
    await setup();
    expect(component.status()).toBe('');
    expect(component.synopsis()).toBe('');
    expect(component.wordTarget()).toBe('');
    expect(component.systemId()).toBe('');
    expect(component.system()).toBeNull();
    expect(component.canSave()).toBe(true);
  });

  it('seeds fields from existing metadata', async () => {
    await setup({
      metadata: {
        status: 'revised',
        synopsis: 'Mira arrives.',
        wordTarget: '1200',
        storyDate: JSON.stringify({
          systemId: GREGORIAN_SYSTEM.id,
          units: ['1999', '1', '3'],
        }),
      },
    });
    expect(component.status()).toBe('revised');
    expect(component.synopsis()).toBe('Mira arrives.');
    expect(component.wordTarget()).toBe('1200');
    expect(component.systemId()).toBe(GREGORIAN_SYSTEM.id);
    expect(component.units()).toEqual(['1999', '1', '3']);
  });

  it('pads missing units when the stored date is short', async () => {
    await setup({
      metadata: {
        storyDate: JSON.stringify({
          systemId: GREGORIAN_SYSTEM.id,
          units: ['1999'],
        }),
      },
    });
    expect(component.units()).toHaveLength(GREGORIAN_SYSTEM.unitLabels.length);
    expect(component.units()[0]).toBe('1999');
  });

  it('ignores a stored date whose system is not installed', async () => {
    await setup({
      metadata: {
        storyDate: JSON.stringify({ systemId: 'missing', units: ['1'] }),
      },
    });
    expect(component.systemId()).toBe('');
    expect(component.units()).toEqual([]);
  });

  it('closes with a full patch on save', async () => {
    await setup();
    component.status.set('draft');
    component.synopsis.set('  Mira arrives.  ');
    component.wordTarget.set('1500');
    component.onSystemChange(GREGORIAN_SYSTEM.id);
    component.onUnitChange(0, '1999');
    component.onUnitChange(1, '1');
    component.onUnitChange(2, '3');

    component.onSave();

    expect(dialogRef.close).toHaveBeenCalledWith({
      patch: {
        status: 'draft',
        synopsis: '  Mira arrives.  ',
        wordTarget: '1500',
        storyDate: JSON.stringify({
          systemId: GREGORIAN_SYSTEM.id,
          units: ['1999', '1', '3'],
        }),
      },
    });
  });

  it('clears fields that were emptied', async () => {
    await setup({
      metadata: { status: 'final', wordTarget: '900', synopsis: 'x' },
    });
    component.status.set('');
    component.wordTarget.set('');
    component.synopsis.set('');
    component.onSave();
    expect(dialogRef.close).toHaveBeenCalledWith({
      patch: { status: '', synopsis: '', wordTarget: '', storyDate: '' },
    });
  });

  it('treats a chosen calendar with blank units as no date', async () => {
    await setup();
    component.onSystemChange(GREGORIAN_SYSTEM.id);
    expect(component.units()).toEqual(['', '', '']);
    expect(component.canSave()).toBe(true);
    component.onSave();
    const patch = dialogRef.close.mock.calls[0][0].patch;
    expect(patch.storyDate).toBe('');
  });

  it('blocks saving on partial or non-integer units', async () => {
    await setup();
    component.onSystemChange(GREGORIAN_SYSTEM.id);
    component.onUnitChange(0, '1999');
    expect(component.unitsValid()).toBe(false);
    expect(component.canSave()).toBe(false);
    component.onSave();
    expect(dialogRef.close).not.toHaveBeenCalled();

    component.onUnitChange(1, '1.5');
    component.onUnitChange(2, '3');
    expect(component.unitsValid()).toBe(false);
  });

  it('blocks saving on an invalid word target', async () => {
    await setup();
    component.wordTarget.set('0');
    expect(component.wordTargetValid()).toBe(false);
    component.wordTarget.set('12.5');
    expect(component.wordTargetValid()).toBe(false);
    component.wordTarget.set('abc');
    expect(component.wordTargetValid()).toBe(false);
    expect(component.canSave()).toBe(false);
    component.wordTarget.set('400');
    expect(component.canSave()).toBe(true);
  });

  it('explains when no time systems are installed', async () => {
    await setup({ timeSystems: [] });
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="scene-details-no-time-systems"]'
      )
    ).not.toBeNull();
  });

  it('closes without a result on cancel', async () => {
    await setup();
    component.onCancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
