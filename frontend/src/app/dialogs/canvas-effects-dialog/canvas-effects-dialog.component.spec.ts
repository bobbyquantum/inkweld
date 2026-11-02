import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import type { CanvasObject } from '@inkweld/canvas';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  CanvasEffectsDialogComponent,
  type CanvasEffectsDialogData,
} from './canvas-effects-dialog.component';

const base = {
  id: 'o1',
  layerId: 'l1',
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  visible: true,
  locked: false,
};

const rect = {
  ...base,
  type: 'shape',
  shapeType: 'rect',
  width: 100,
  height: 50,
  stroke: '#000000',
  strokeWidth: 1,
} satisfies CanvasObject;

const ellipse = { ...rect, shapeType: 'ellipse' } satisfies CanvasObject;

const image = {
  ...base,
  type: 'image',
  src: 'media://a.png',
  width: 100,
  height: 50,
} satisfies CanvasObject;

const text = {
  ...base,
  type: 'text',
  text: 'Hello',
  fontSize: 18,
  fontFamily: 'Lato',
  fontStyle: 'normal',
  fill: '#333333',
  width: 0,
  align: 'left',
} satisfies CanvasObject;

function setup(object: CanvasEffectsDialogData['object']): {
  fixture: ComponentFixture<CanvasEffectsDialogComponent>;
  component: CanvasEffectsDialogComponent;
  close: ReturnType<typeof vi.fn>;
  shown: (testId: string) => boolean;
} {
  const close = vi.fn();
  TestBed.configureTestingModule({
    imports: [
      translocoTestProvider(),
      CanvasEffectsDialogComponent,
      MatDialogModule,
    ],
    providers: [
      provideZonelessChangeDetection(),
      { provide: MatDialogRef, useValue: { close } },
      { provide: MAT_DIALOG_DATA, useValue: { object } },
    ],
  });
  const fixture = TestBed.createComponent(CanvasEffectsDialogComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    close,
    shown: testId =>
      !!(fixture.nativeElement as HTMLElement).querySelector(
        `[data-testid="${testId}"]`
      ),
  };
}

describe('CanvasEffectsDialogComponent', () => {
  describe('which controls show', () => {
    it('gives a rectangle corners but no fit or outline', () => {
      const { shown } = setup(rect);
      expect(shown('canvas-effects-corner-radius')).toBe(true);
      expect(shown('canvas-effects-fit')).toBe(false);
      expect(shown('canvas-effects-outline-width')).toBe(false);
    });

    it('gives an ellipse neither corners nor fit', () => {
      const { shown } = setup(ellipse);
      expect(shown('canvas-effects-corner-radius')).toBe(false);
      expect(shown('canvas-effects-fit')).toBe(false);
    });

    it('gives an image a fit and corners', () => {
      const { shown } = setup(image);
      expect(shown('canvas-effects-fit')).toBe(true);
      expect(shown('canvas-effects-corner-radius')).toBe(true);
      expect(shown('canvas-effects-outline-width')).toBe(false);
    });

    it('gives text an outline but no corners', () => {
      const { shown } = setup(text);
      expect(shown('canvas-effects-outline-width')).toBe(true);
      expect(shown('canvas-effects-corner-radius')).toBe(false);
    });

    it('shows the shadow settings only while the shadow is on', async () => {
      const { fixture, component, shown } = setup(rect);
      expect(shown('canvas-effects-shadow-blur')).toBe(false);

      (fixture.nativeElement as HTMLElement)
        .querySelector<HTMLButtonElement>(
          '[data-testid="canvas-effects-shadow"] button'
        )
        ?.click();
      await fixture.whenStable();

      expect(component.model().shadowOn).toBe(true);
      expect(shown('canvas-effects-shadow-blur')).toBe(true);
    });
  });

  describe('what it starts from', () => {
    it('reads the existing effects', () => {
      const { component } = setup({
        ...image,
        shadow: {
          color: '#112233',
          blur: 5,
          offsetX: 1,
          offsetY: 2,
          opacity: 0.25,
        },
        blendMode: 'multiply',
        fit: 'cover',
        cornerRadius: 9,
      });

      expect(component.model()).toEqual({
        shadowOn: true,
        shadowBlur: 5,
        shadowOffsetX: 1,
        shadowOffsetY: 2,
        shadowOpacityPercent: 25,
        blendMode: 'multiply',
        fit: 'cover',
        cornerRadius: 9,
        outlineWidth: 0,
      });
    });

    it('treats a shadow with no opacity as fully opaque', () => {
      const { component } = setup({
        ...rect,
        shadow: { color: '#000000', blur: 1, offsetX: 0, offsetY: 0 },
      });
      expect(component.model().shadowOpacityPercent).toBe(100);
    });
  });

  describe('what it returns', () => {
    it('clears everything when nothing is set', () => {
      const { component, close } = setup(image);

      component.onApply();

      expect(close).toHaveBeenCalledWith({
        shadow: undefined,
        blendMode: undefined,
        fit: undefined,
        cornerRadius: undefined,
      });
    });

    it('clears the effects of an object that had them, once turned off', () => {
      const { component, close } = setup({
        ...text,
        shadow: { color: '#000000', blur: 1, offsetX: 0, offsetY: 0 },
        blendMode: 'screen',
        stroke: '#ff0000',
        strokeWidth: 3,
      });
      component.model.update(value => ({
        ...value,
        shadowOn: false,
        blendMode: 'normal',
        outlineWidth: 0,
      }));

      component.onApply();

      expect(close).toHaveBeenCalledWith({
        shadow: undefined,
        blendMode: undefined,
        stroke: undefined,
        strokeWidth: undefined,
      });
    });

    it('returns a new shadow, with its opacity as a fraction', () => {
      const { component, close } = setup(rect);
      component.model.update(value => ({ ...value, shadowOn: true }));

      component.onApply();

      expect(close).toHaveBeenCalledWith({
        shadow: {
          color: '#000000',
          blur: 12,
          offsetX: 0,
          offsetY: 4,
          opacity: 0.4,
        },
        blendMode: undefined,
        cornerRadius: undefined,
      });
    });

    it('leaves out a shadow opacity of 100%', () => {
      const { component, close } = setup({
        ...rect,
        shadow: { color: '#123456', blur: 1, offsetX: 2, offsetY: 3 },
      });

      component.onApply();

      expect(close).toHaveBeenCalledWith(
        expect.objectContaining({
          shadow: {
            color: '#123456',
            blur: 1,
            offsetX: 2,
            offsetY: 3,
            opacity: undefined,
          },
        })
      );
    });

    it('returns an image fit, corners and blend mode', () => {
      const { component, close } = setup(image);
      component.model.update(value => ({
        ...value,
        fit: 'contain',
        cornerRadius: 12,
        blendMode: 'overlay',
      }));

      component.onApply();

      expect(close).toHaveBeenCalledWith({
        shadow: undefined,
        blendMode: 'overlay',
        fit: 'contain',
        cornerRadius: 12,
      });
    });

    it('returns a text outline in the chosen color', async () => {
      const { fixture, component, close } = setup(text);
      component.model.update(value => ({ ...value, outlineWidth: 2 }));
      await fixture.whenStable();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          'app-color-swatches'
        )
      ).not.toBeNull();
      component['outlineColor'].set('#00ff00');

      component.onApply();

      expect(close).toHaveBeenCalledWith({
        shadow: undefined,
        blendMode: undefined,
        stroke: '#00ff00',
        strokeWidth: 2,
      });
    });

    it('keeps the outline color that was stored', () => {
      const { component, close } = setup({
        ...text,
        stroke: '#abcdef',
        strokeWidth: 4,
      });

      component.onApply();

      expect(close).toHaveBeenCalledWith(
        expect.objectContaining({ stroke: '#abcdef', strokeWidth: 4 })
      );
    });
  });

  describe('validation', () => {
    it('refuses to apply a bad number', () => {
      const { component, close } = setup(rect);
      component.model.update(value => ({ ...value, cornerRadius: -1 }));

      expect(component.form().invalid()).toBe(true);
      component.onApply();

      expect(close).not.toHaveBeenCalled();
    });

    it('refuses a shadow opacity past 100%', () => {
      const { component, close } = setup(rect);
      component.model.update(value => ({
        ...value,
        shadowOn: true,
        shadowOpacityPercent: 101,
      }));

      component.onApply();

      expect(close).not.toHaveBeenCalled();
    });

    it('lets a bad number in a shadow that is off go', () => {
      const { component, close } = setup(rect);
      component.model.update(value => ({
        ...value,
        shadowOn: false,
        shadowBlur: -5,
      }));

      expect(component.form().invalid()).toBe(false);
      component.onApply();

      expect(close).toHaveBeenCalled();
    });
  });

  it('closes with nothing on cancel', () => {
    const { component, close } = setup(rect);

    component.onCancel();

    expect(close).toHaveBeenCalledWith();
  });
});
