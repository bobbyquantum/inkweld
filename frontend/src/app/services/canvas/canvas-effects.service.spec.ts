import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { CanvasEffectsDialogComponent } from '@dialogs/canvas-effects-dialog/canvas-effects-dialog.component';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasService } from './canvas.service';
import { CanvasEffectsService } from './canvas-effects.service';

describe('CanvasEffectsService', () => {
  const shape = { id: 'shape', type: 'shape', shapeType: 'rect' };
  const pin = { id: 'pin', type: 'pin' };

  let service: CanvasEffectsService;
  let open: ReturnType<typeof vi.fn>;
  let updateObject: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    open = vi.fn();
    updateObject = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        CanvasEffectsService,
        { provide: MatDialog, useValue: { open } },
        {
          provide: CanvasService,
          useValue: {
            activeConfig: signal({ objects: [shape, pin] }),
            updateObject,
          },
        },
      ],
    });
    service = TestBed.inject(CanvasEffectsService);
  });

  it('saves what the dialog returns, including what it clears', () => {
    const result = { shadow: undefined, blendMode: 'multiply' };
    open.mockReturnValue({ afterClosed: () => of(result) });

    service.openEffectsDialog('shape');

    expect(open).toHaveBeenCalledWith(
      CanvasEffectsDialogComponent,
      expect.objectContaining({ data: { object: shape } })
    );
    expect(updateObject).toHaveBeenCalledWith('shape', result);
  });

  it('saves nothing when the dialog is cancelled', () => {
    open.mockReturnValue({ afterClosed: () => of(undefined) });

    service.openEffectsDialog('shape');

    expect(updateObject).not.toHaveBeenCalled();
  });

  it('does not open for a pin or for an object that is gone', () => {
    service.openEffectsDialog('pin');
    service.openEffectsDialog('missing');

    expect(open).not.toHaveBeenCalled();
  });
});
