import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { SetupService } from '@services/core/setup.service';
import { LocalStorageService } from '@services/local/local-storage.service';
import { UnifiedUserService } from '@services/user/unified-user.service';
import { UserService } from '@services/user/user.service';
import { ImageCroppedEvent, LoadedImage } from 'ngx-image-cropper';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { EditAvatarDialogComponent } from './edit-avatar-dialog.component';

describe('EditAvatarDialogComponent', () => {
  let component: EditAvatarDialogComponent;
  let fixture: ComponentFixture<EditAvatarDialogComponent>;
  let userServiceMock: {
    uploadAvatar: ReturnType<typeof vi.fn>;
    setCurrentUser: ReturnType<typeof vi.fn>;
  };
  let dialogRefMock: { close: ReturnType<typeof vi.fn> };
  let setupServiceMock: { getMode: ReturnType<typeof vi.fn> };
  let localStorageMock: { saveUserAvatar: ReturnType<typeof vi.fn> };
  let unifiedUserServiceMock: {
    currentUser: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    userServiceMock = {
      uploadAvatar: vi.fn(),
      setCurrentUser: vi.fn().mockResolvedValue(undefined),
    };
    dialogRefMock = { close: vi.fn() };
    setupServiceMock = { getMode: vi.fn().mockReturnValue('server') };
    localStorageMock = {
      saveUserAvatar: vi.fn().mockResolvedValue(undefined),
    };
    unifiedUserServiceMock = {
      currentUser: vi
        .fn()
        .mockReturnValue({ username: 'testuser', hasAvatar: false }),
    };

    await TestBed.configureTestingModule({
      imports: [EditAvatarDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UserService, useValue: userServiceMock },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: SetupService, useValue: setupServiceMock },
        { provide: LocalStorageService, useValue: localStorageMock },
        { provide: UnifiedUserService, useValue: unifiedUserServiceMock },
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
    component.imageChangedEvent = {} as Event;
    component.croppedImage = 'url' as unknown as typeof component.croppedImage;
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
    const sanitized = component.croppedImage as {
      changingThisBreaksApplicationSecurity: string;
    };
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
    vi.spyOn(window, 'alert').mockImplementation(() => {});
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

    it('should upload avatar and close dialog on success in server mode', async () => {
      const blob = new Blob([''], { type: 'image/png' });
      component.croppedBlob = blob;
      component.fileName = 'test.png';
      setupServiceMock.getMode.mockReturnValue('server');
      userServiceMock.uploadAvatar.mockReturnValue(of(null));

      await component.submit();

      expect(userServiceMock.uploadAvatar).toHaveBeenCalledWith(
        expect.any(File)
      );
      expect(localStorageMock.saveUserAvatar).toHaveBeenCalledWith(
        'testuser',
        blob
      );
      expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });

    it('should save to offline storage only in offline mode', async () => {
      const blob = new Blob([''], { type: 'image/png' });
      component.croppedBlob = blob;
      component.fileName = 'test.png';
      setupServiceMock.getMode.mockReturnValue('local');

      await component.submit();

      expect(userServiceMock.uploadAvatar).not.toHaveBeenCalled();
      expect(localStorageMock.saveUserAvatar).toHaveBeenCalledWith(
        'testuser',
        blob
      );
      expect(dialogRefMock.close).toHaveBeenCalledWith(true);
    });

    it('should show alert and not close dialog on error', async () => {
      const blob = new Blob([''], { type: 'image/png' });
      component.croppedBlob = blob;
      component.fileName = 'test.png';
      setupServiceMock.getMode.mockReturnValue('server');
      userServiceMock.uploadAvatar.mockReturnValue(
        throwError(() => new Error('err'))
      );
      vi.spyOn(window, 'alert').mockImplementation(() => {});

      await component.submit();

      expect(window.alert).toHaveBeenCalledWith(
        'Failed to upload avatar. Please try again.'
      );
      expect(dialogRefMock.close).not.toHaveBeenCalled();
    });
  });
});
