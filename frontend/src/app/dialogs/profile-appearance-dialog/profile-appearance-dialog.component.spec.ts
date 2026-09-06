import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  ProfileBackgroundKind,
  ProfileBackgroundPresetId,
} from '@inkweld/model/profile-background';
import { UserProfileService } from '@services/user/user-profile.service';
import type { ImageCroppedEvent } from 'ngx-image-cropper';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  ProfileAppearanceDialogComponent,
  type ProfileAppearanceDialogData,
} from './profile-appearance-dialog.component';

describe('ProfileAppearanceDialogComponent', () => {
  let fixture: ComponentFixture<ProfileAppearanceDialogComponent>;
  let component: ProfileAppearanceDialogComponent;
  let profileService: ReturnType<typeof mockDeep<UserProfileService>>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };

  const setup = async (
    overrides: Partial<ProfileAppearanceDialogData['appearance']> = {}
  ) => {
    const data: ProfileAppearanceDialogData = {
      username: 'alice',
      appearance: {
        background: { kind: ProfileBackgroundKind.Plain },
        hasBanner: false,
        ...overrides,
      },
    };
    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), ProfileAppearanceDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: UserProfileService, useValue: profileService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProfileAppearanceDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  };

  const query = <T extends Element>(testId: string): T | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  beforeEach(() => {
    TestBed.resetTestingModule();
    profileService = mockDeep<UserProfileService>();
    profileService.bannerUrl.mockImplementation(
      (username: string, version = 0) =>
        `/api/v1/users/${username}/banner${version ? `?v=${version}` : ''}`
    );
    dialogRef = { close: vi.fn() };
    snackBar = { open: vi.fn() };
  });

  it('offers plain plus every preset except the redundant "none"', async () => {
    await setup();
    expect(component.presets.map(p => p.id)).not.toContain('none');
    expect(component.presets.map(p => p.id)).toContain('dusk');
    expect(component.selection()).toBe('plain');
    expect(query('profile-background-tile-plain')).not.toBeNull();
    expect(query('profile-background-tile-none')).toBeNull();
    expect(query('profile-banner-empty')).not.toBeNull();
    expect(query('profile-banner-remove')).toBeNull();
  });

  it('reflects an existing preset and banner', async () => {
    await setup({
      background: {
        kind: ProfileBackgroundKind.Preset,
        presetId: ProfileBackgroundPresetId.Forest,
      },
      hasBanner: true,
    });
    expect(component.selection()).toBe('forest');
    expect(
      query<HTMLImageElement>('profile-banner-preview')?.getAttribute('src')
    ).toBe('/api/v1/users/alice/banner');
    expect(query('profile-banner-remove')).not.toBeNull();
  });

  it('saves a preset as soon as it is picked and reports the change on close', async () => {
    profileService.setProfileBackground.mockReturnValue(
      of({
        kind: ProfileBackgroundKind.Preset,
        presetId: ProfileBackgroundPresetId.Dusk,
      })
    );
    await setup();

    await component.selectPreset('dusk');
    expect(profileService.setProfileBackground).toHaveBeenCalledWith({
      kind: 'preset',
      presetId: 'dusk',
    });
    expect(component.selection()).toBe('dusk');

    component.close();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('closes with false when nothing was changed', async () => {
    await setup();
    component.close();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('reverts the tile and notifies when saving fails', async () => {
    profileService.setProfileBackground.mockReturnValue(
      throwError(() => new Error('nope'))
    );
    await setup();

    await component.selectPreset('slate');
    expect(component.selection()).toBe('plain');
    expect(snackBar.open).toHaveBeenCalled();

    component.close();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('saves plain explicitly', async () => {
    profileService.setProfileBackground.mockReturnValue(
      of({ kind: ProfileBackgroundKind.Plain })
    );
    await setup({
      background: {
        kind: ProfileBackgroundKind.Preset,
        presetId: ProfileBackgroundPresetId.Dusk,
      },
    });
    await component.selectPlain();
    expect(profileService.setProfileBackground).toHaveBeenCalledWith({
      kind: 'plain',
    });
    expect(component.selection()).toBe('plain');
  });

  it('rejects non-raster and oversized files before cropping', async () => {
    await setup();
    const pick = (file: File) => {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: [file] });
      component.onFileSelected({ target: input } as unknown as Event);
    };

    pick(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }));
    expect(component.imageChangedEvent()).toBeNull();

    const big = new File([''], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 13 * 1024 * 1024 });
    pick(big);
    expect(component.imageChangedEvent()).toBeNull();
    expect(snackBar.open).toHaveBeenCalledTimes(2);

    pick(new File(['x'], 'ok.png', { type: 'image/png' }));
    expect(component.imageChangedEvent()).not.toBeNull();
    expect(component.fileName()).toBe('ok.png');
  });

  it('uploads the cropped banner and refreshes the preview', async () => {
    profileService.uploadBanner.mockReturnValue(of({ message: 'ok' }));
    await setup();

    const blob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
    component.fileName.set('hero.jpg');
    component.onImageCropped({ blob } as unknown as ImageCroppedEvent);
    expect(component.croppedBlob()).toBe(blob);

    await component.uploadBanner();
    expect(profileService.uploadBanner).toHaveBeenCalledWith(blob, 'hero.jpg');
    expect(component.hasBanner()).toBe(true);
    expect(component.bannerVersion()).toBe(1);
    expect(component.croppedBlob()).toBeNull();

    component.close();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('does nothing without a crop, and notifies when the upload fails', async () => {
    profileService.uploadBanner.mockReturnValue(
      throwError(() => new Error('nope'))
    );
    await setup();

    await component.uploadBanner();
    expect(profileService.uploadBanner).not.toHaveBeenCalled();

    component.onImageCropped({
      blob: new Blob(['x']),
    } as unknown as ImageCroppedEvent);
    await component.uploadBanner();
    expect(component.hasBanner()).toBe(false);
    expect(snackBar.open).toHaveBeenCalled();
    expect(component.isBusy()).toBe(false);
  });

  it('removes the banner', async () => {
    profileService.deleteBanner.mockReturnValue(of({ message: 'ok' }));
    await setup({ hasBanner: true });

    await component.removeBanner();
    fixture.detectChanges();
    expect(profileService.deleteBanner).toHaveBeenCalled();
    expect(component.hasBanner()).toBe(false);
    expect(query('profile-banner-preview')).toBeNull();

    component.close();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('keeps the banner and notifies when removal fails', async () => {
    profileService.deleteBanner.mockReturnValue(
      throwError(() => new Error('nope'))
    );
    await setup({ hasBanner: true });

    await component.removeBanner();
    expect(component.hasBanner()).toBe(true);
    expect(snackBar.open).toHaveBeenCalled();
  });

  it('clears a failed image load', async () => {
    await setup();
    component.fileName.set('broken.png');
    component.onLoadImageFailed();
    expect(component.fileName()).toBe('');
    expect(component.imageChangedEvent()).toBeNull();
    expect(snackBar.open).toHaveBeenCalled();
  });
});
