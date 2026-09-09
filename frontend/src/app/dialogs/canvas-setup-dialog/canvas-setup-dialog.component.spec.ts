import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { DARK_PAGE, LIGHT_PAGE } from '@models/canvas.model';
import { ThemeService } from '@themes/theme.service';
import { describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  CanvasSetupDialogComponent,
  type CanvasSetupDialogData,
} from './canvas-setup-dialog.component';

describe('CanvasSetupDialogComponent', () => {
  let component: CanvasSetupDialogComponent;
  let fixture: ComponentFixture<CanvasSetupDialogComponent>;
  const dialogRef = { close: vi.fn() };
  const themeService = { isDarkMode: vi.fn(() => false) };

  async function setup(data: CanvasSetupDialogData): Promise<void> {
    dialogRef.close.mockClear();
    await TestBed.configureTestingModule({
      imports: [
        translocoTestProvider(),
        CanvasSetupDialogComponent,
        MatDialogModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: ThemeService, useValue: themeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CanvasSetupDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('starts from a light page in light mode and a dark page in dark mode', async () => {
    themeService.isDarkMode.mockReturnValue(false);
    await setup({ mode: 'create' });
    expect(component['background']()).toBe(LIGHT_PAGE.background);
    expect(component['inkColor']()).toBe(LIGHT_PAGE.inkColor);

    TestBed.resetTestingModule();
    themeService.isDarkMode.mockReturnValue(true);
    await setup({ mode: 'create' });
    expect(component['background']()).toBe(DARK_PAGE.background);
    expect(component['inkColor']()).toBe(DARK_PAGE.inkColor);
  });

  it('starts from the given page colours when editing', async () => {
    await setup({
      mode: 'edit',
      page: { background: '#123456', inkColor: '#abcdef' },
    });
    expect(component['background']()).toBe('#123456');
    expect(component['isCreate']).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[data-testid="canvas-size-group"]')
    ).toBeNull();
  });

  it('returns the colours and no frame for an infinite canvas', async () => {
    await setup({ mode: 'create' });
    component['onBackgroundChange']('#000000');
    component['onInkChange']('#ffffff');
    component['onConfirm']();

    expect(dialogRef.close).toHaveBeenCalledWith({
      page: { background: '#000000', inkColor: '#ffffff' },
    });
  });

  it('returns a preset frame size when a canvas size is chosen', async () => {
    await setup({ mode: 'create', size: 'hd' });
    component['onConfirm']();

    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({ frame: { width: 1920, height: 1080 } })
    );
  });

  it('parses a custom size and refuses one that is too small', async () => {
    await setup({ mode: 'create', size: 'custom' });
    component['customWidth'].set('640');
    component['customHeight'].set('480');
    expect(component['customInvalid']()).toBe(false);
    component['onConfirm']();
    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({ frame: { width: 640, height: 480 } })
    );

    dialogRef.close.mockClear();
    component['customHeight'].set('2');
    expect(component['customInvalid']()).toBe(true);
    component['onConfirm']();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('swaps both colours with the quick picks and flags low contrast', async () => {
    await setup({ mode: 'create' });
    component['usePreset'](true);
    expect(component['background']()).toBe(DARK_PAGE.background);
    expect(component['inkColor']()).toBe(DARK_PAGE.inkColor);
    expect(component['lowContrast']()).toBe(false);

    component['onInkChange']('#000000');
    expect(component['lowContrast']()).toBe(true);
  });

  it('closes without a result on cancel', async () => {
    await setup({ mode: 'create' });
    component['onCancel']();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });
});
