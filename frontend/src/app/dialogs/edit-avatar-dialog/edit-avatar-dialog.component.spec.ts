import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { UserService } from '@services/user/user.service';
import { ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { EditAvatarDialogComponent } from './edit-avatar-dialog.component';

describe('EditAvatarDialogComponent', () => {
  let component: EditAvatarDialogComponent;
  let fixture: ComponentFixture<EditAvatarDialogComponent>;
  let userServiceMock: any;
  let dialogRefMock: any;

  beforeEach(async () => {
    userServiceMock = { uploadAvatar: vi.fn() };
    dialogRefMock = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [EditAvatarDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UserService, useValue: userServiceMock },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditAvatarDialogComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('fileChangeEvent should set imageChangedEvent and fileName', () => {
    const file = new File([''], 'test.png', { type: 'image/png' });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    const event = { target: input } as unknown as Event;
    component.fileChangeEvent(event);
    expect(component.imageChangedEvent).toBe(event);
    expect(component.fileName).toBe('test.png');
  });

  it('resetState should clear state', () => {
    component.imageChangedEvent = {} as any;
    component.croppedImage = 'url' as any;
    component.croppedBlob = new Blob();
    component.hasImageLoaded = true;
    component.isCropperReady = true;
    component.hasLoadFailed = true;
    component.resetState();
    expect(component.imageChangedEvent).toBeNull();
    expect(component.croppedImage).toBeNull();
    expect(component.croppedBlob).toBeNull();
    expect(component.hasImageLoaded).toBeFalsy();
    expect(component.isCropperReady).toBeFalsy();
    expect(component.hasLoadFailed).toBeFalsy();
  });

  it('imageCropped should set croppedImage and croppedBlob', () => {
    const blob = new Blob([''], { type: 'image/png' });
    const event = { objectUrl: 'url', blob } as unknown as ImageCroppedEvent;
    component.imageCropped(event);
    expect(component.croppedBlob).toBe(blob);
    // sanitized URL has based string
    const sanitized: any = component.croppedImage;
    expect(sanitized.changingThisBreaksApplicationSecurity).toContain('url');
  });

  it('onImageLoaded should set hasImageLoaded', () => {
    component.onImageLoaded({} as unknown as LoadedImage);
    expect(component.hasImageLoaded).toBeTruthy();
  });

  it('onCropperReady should set isCropperReady', () => {
    component.onCropperReady();
    expect(component.isCropperReady).toBeTruthy();
  });

  it('onLoadImageFailed should set hasLoadFailed to true and alert', () => {
    vi.spyOn(window, 'alert');
    component.onLoadImageFailed();
    expect(component.hasLoadFailed).toBeTruthy();
    expect(window.alert).toHaveBeenCalledWith(
      'Failed to load image. Please try another file.'
    );
  });

  describe('submit', () => {
    it('should return early when no blob or fileName', async () => {
      await component.submit();
      expect(userServiceMock.uploadAvatar).not.toHaveBeenCalled();
    });

    it('should upload avatar and close dialog on success', async () => {
      const blob = new Blob([''], { type: 'image/png' });
      component.croppedBlob = blob;
      component.fileName = 'test.png';
      userServiceMock.uploadAvatar.mockReturnValue(of(null));
      await component.submit();
      expect(userServiceMock.uploadAvatar).toHaveBeenCalledWith(
        new File([blob], 'test.png', { type: blob.type })
      );
      expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });

    it('should show alert and not close dialog on error', async () => {
      const blob = new Blob([''], { type: 'image/png' });
      component.croppedBlob = blob;
      component.fileName = 'test.png';
      userServiceMock.uploadAvatar.mockReturnValue(
        throwError(() => new Error('err'))
      );
      vi.spyOn(window, 'alert');
      await component.submit();
      expect(window.alert).toHaveBeenCalledWith(
        'Failed to upload avatar. Please try again.'
      );
      expect(dialogRefMock.close).not.toHaveBeenCalled();
    });
  });
});
