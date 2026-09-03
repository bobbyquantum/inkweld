import {
  CUSTOM_ELEMENTS_SCHEMA,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { BackgroundService } from '@services/core/background.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { BackgroundPickerComponent } from './background-picker.component';

describe('BackgroundPickerComponent', () => {
  let component: BackgroundPickerComponent;
  let fixture: ComponentFixture<BackgroundPickerComponent>;
  let mockBackgroundService: {
    userBackgroundEnabled: ReturnType<typeof signal<boolean>>;
    userBackgroundUploadEnabled: ReturnType<typeof signal<boolean>>;
    hasUpload: ReturnType<typeof signal<boolean>>;
    preference: ReturnType<typeof signal<{ kind: string; presetId?: string }>>;
    refresh: ReturnType<typeof vi.fn>;
    setPreference: ReturnType<typeof vi.fn>;
    uploadUserBackground: ReturnType<typeof vi.fn>;
    deleteUserBackground: ReturnType<typeof vi.fn>;
    userBackgroundUrl: ReturnType<typeof vi.fn>;
  };
  let snackBarOpen: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockBackgroundService = {
      userBackgroundEnabled: signal(true),
      userBackgroundUploadEnabled: signal(false),
      hasUpload: signal(false),
      preference: signal<{ kind: string; presetId?: string }>({
        kind: 'default',
      }),
      refresh: vi.fn().mockResolvedValue(undefined),
      setPreference: vi.fn().mockResolvedValue(undefined),
      uploadUserBackground: vi.fn().mockResolvedValue(undefined),
      deleteUserBackground: vi.fn().mockResolvedValue(undefined),
      userBackgroundUrl: vi
        .fn()
        .mockReturnValue('/api/v1/appearance/user-background'),
    };
    snackBarOpen = vi.fn();

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), BackgroundPickerComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BackgroundService, useValue: mockBackgroundService },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    })
      // MatSnackBarModule provides MatSnackBar at component level, which would
      // out-rank a TestBed provider — drop the module and inject the mock there.
      .overrideComponent(BackgroundPickerComponent, {
        remove: { imports: [MatSnackBarModule] },
        add: {
          providers: [
            { provide: MatSnackBar, useValue: { open: snackBarOpen } },
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(BackgroundPickerComponent);
    component = fixture.componentInstance;
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('renders nothing when personalisation is disabled', () => {
    mockBackgroundService.userBackgroundEnabled.set(false);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="background-picker"]')
    ).toBeNull();
  });

  it('renders a tile per preset plus the site default', () => {
    fixture.detectChanges();

    const tiles = fixture.nativeElement.querySelectorAll('.tile');
    expect(tiles.length).toBe(component.presets.length + 1);
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="background-tile-default"]'
      )
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="background-tile-midnight"]'
      )
    ).not.toBeNull();
  });

  it('reflects the stored preference as the selected tile', () => {
    mockBackgroundService.preference.set({
      kind: 'preset',
      presetId: 'forest',
    });
    fixture.detectChanges();

    expect(component.selection()).toBe('forest');
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="background-tile-forest"]')
        .classList.contains('selected')
    ).toBe(true);
  });

  it('saves a preset choice', async () => {
    fixture.detectChanges();
    await component.selectPreset('dusk');

    expect(mockBackgroundService.setPreference).toHaveBeenCalledWith({
      kind: 'preset',
      presetId: 'dusk',
    });
  });

  it('saves the site default choice', async () => {
    fixture.detectChanges();
    await component.selectDefault();

    expect(mockBackgroundService.setPreference).toHaveBeenCalledWith({
      kind: 'default',
    });
  });

  it('hides the upload controls when uploads are disabled', () => {
    mockBackgroundService.userBackgroundUploadEnabled.set(false);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="background-upload-button"]'
      )
    ).toBeNull();
  });

  it('shows the upload controls when uploads are enabled', () => {
    mockBackgroundService.userBackgroundUploadEnabled.set(true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="background-upload-button"]'
      )
    ).not.toBeNull();
    // No image stored yet, so there is nothing to remove or select.
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="background-remove-button"]'
      )
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="background-tile-upload"]'
      )
    ).toBeNull();
  });

  it('offers the uploaded image as a tile once one exists', () => {
    mockBackgroundService.userBackgroundUploadEnabled.set(true);
    mockBackgroundService.hasUpload.set(true);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="background-tile-upload"]'
      )
    ).not.toBeNull();
    expect(component.uploadPreview()).toBe(
      'url("/api/v1/appearance/user-background")'
    );
  });

  it('will not select an upload that does not exist', async () => {
    fixture.detectChanges();
    await component.selectUpload();

    expect(mockBackgroundService.setPreference).not.toHaveBeenCalled();
  });

  it('uploads a chosen image', async () => {
    fixture.detectChanges();
    const file = new File([new Uint8Array([1, 2, 3])], 'bg.png', {
      type: 'image/png',
    });

    await component.onFileSelected({
      target: { files: [file], value: 'bg.png' },
    } as unknown as Event);

    expect(mockBackgroundService.uploadUserBackground).toHaveBeenCalledWith(
      file,
      'bg.png'
    );
  });

  it('refuses an SVG', async () => {
    fixture.detectChanges();
    const file = new File(['<svg/>'], 'bg.svg', { type: 'image/svg+xml' });

    await component.onFileSelected({
      target: { files: [file], value: 'bg.svg' },
    } as unknown as Event);

    expect(mockBackgroundService.uploadUserBackground).not.toHaveBeenCalled();
    expect(snackBarOpen).toHaveBeenCalled();
  });

  it('refuses an oversized file', async () => {
    fixture.detectChanges();
    const file = new File([new Uint8Array(4)], 'huge.png', {
      type: 'image/png',
    });
    // Size is read-only on File, so report an oversized value directly.
    Object.defineProperty(file, 'size', { value: 13 * 1024 * 1024 });

    await component.onFileSelected({
      target: { files: [file], value: 'huge.png' },
    } as unknown as Event);

    expect(mockBackgroundService.uploadUserBackground).not.toHaveBeenCalled();
    expect(snackBarOpen).toHaveBeenCalled();
  });

  it('removes the uploaded image', async () => {
    mockBackgroundService.hasUpload.set(true);
    fixture.detectChanges();
    await component.removeUpload();

    expect(mockBackgroundService.deleteUserBackground).toHaveBeenCalled();
  });

  it('re-reads the server state when saving fails', async () => {
    mockBackgroundService.setPreference.mockRejectedValue(new Error('nope'));
    fixture.detectChanges();

    await component.selectPreset('slate');

    expect(snackBarOpen).toHaveBeenCalled();
    // Once on init, once after the failed save.
    expect(mockBackgroundService.refresh).toHaveBeenCalledTimes(2);
  });
});
