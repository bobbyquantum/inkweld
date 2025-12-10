/**
 * Tests for Publish Complete Dialog Component
 */
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';

import { PublishFormat } from '../../models/publish-plan';
import { PublishedFile, SharePermission } from '../../models/published-file';
import { SetupService } from '../../services/core/setup.service';
import { PublishedFilesService } from '../../services/publish/published-files.service';
import {
  PublishCompleteDialogComponent,
  PublishCompleteDialogData,
} from './publish-complete-dialog.component';

describe('PublishCompleteDialogComponent', () => {
  let component: PublishCompleteDialogComponent;
  let mockDialogRef: { close: Mock };
  let mockSnackBar: { open: Mock };
  let mockPublishedFilesService: {
    getShareUrl: Mock;
    updateSharePermission: Mock;
  };
  let mockSetupService: { getMode: Mock };

  const mockFile: PublishedFile = {
    id: 'file-123',
    projectId: 'project-456',
    filename: 'My Novel.epub',
    format: PublishFormat.EPUB,
    mimeType: 'application/epub+zip',
    size: 1024 * 512, // 512 KB
    planName: 'Full Novel',
    sharePermission: SharePermission.Private,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    metadata: {
      title: 'My Novel',
      author: 'Test Author',
      itemCount: 10,
      wordCount: 50000,
    },
  };

  const mockDialogData: PublishCompleteDialogData = {
    file: mockFile,
    projectKey: 'testuser/my-novel',
    blob: new Blob(['test content'], { type: 'application/epub+zip' }),
  };

  beforeEach(() => {
    mockDialogRef = { close: vi.fn() };
    mockSnackBar = { open: vi.fn() };
    mockPublishedFilesService = {
      getShareUrl: vi.fn().mockReturnValue('https://example.com/share/abc123'),
      updateSharePermission: vi.fn(),
    };
    mockSetupService = {
      getMode: vi.fn().mockReturnValue('server'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: PublishedFilesService, useValue: mockPublishedFilesService },
        { provide: SetupService, useValue: mockSetupService },
      ],
    });

    component = TestBed.runInInjectionContext(
      () => new PublishCompleteDialogComponent()
    );
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with file from dialog data', () => {
      expect(component.file()).toEqual(mockFile);
    });

    it('should initialize share permission from file', () => {
      expect(component.sharePermission()).toBe(SharePermission.Private);
    });

    it('should set isOnline to true when in server mode', () => {
      expect(component.isOnline).toBe(true);
    });

    it('should set isOnline to false when in offline mode', () => {
      mockSetupService.getMode.mockReturnValue('offline');
      component = TestBed.runInInjectionContext(
        () => new PublishCompleteDialogComponent()
      );
      expect(component.isOnline).toBe(false);
    });
  });

  describe('File Info Display', () => {
    it('should return EPUB for format name', () => {
      expect(component.formatName).toBe('EPUB');
    });

    it('should return book icon for EPUB format', () => {
      expect(component.formatIcon).toBe('book');
    });

    it('should format file size in KB', () => {
      expect(component.fileSizeFormatted).toBe('512.0 KB');
    });

    it('should format file size in bytes for small files', () => {
      component.file.set({ ...mockFile, size: 500 });
      expect(component.fileSizeFormatted).toBe('500 B');
    });

    it('should format file size in MB for large files', () => {
      component.file.set({ ...mockFile, size: 1024 * 1024 * 2.5 });
      expect(component.fileSizeFormatted).toBe('2.50 MB');
    });
  });

  describe('Sharing', () => {
    it('should return false for canShare when private', () => {
      expect(component.canShare).toBe(false);
    });

    it('should return true for canShare when Link permission', () => {
      component.sharePermission.set(SharePermission.Link);
      expect(component.canShare).toBe(true);
    });

    it('should return true for canShare when Public permission', () => {
      component.sharePermission.set(SharePermission.Public);
      expect(component.canShare).toBe(true);
    });

    it('should get share URL from service', () => {
      expect(component.shareUrl).toBe('https://example.com/share/abc123');
      expect(mockPublishedFilesService.getShareUrl).toHaveBeenCalledWith(
        mockFile
      );
    });
  });

  describe('Download', () => {
    it('should trigger file download', () => {
      // Mock document methods
      const createElementSpy = vi.spyOn(document, 'createElement');
      const appendChildSpy = vi
        .spyOn(document.body, 'appendChild')
        .mockImplementation(() => document.body);
      const removeChildSpy = vi
        .spyOn(document.body, 'removeChild')
        .mockImplementation(() => document.body);
      const revokeObjectURLSpy = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => {});
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
      } as unknown as HTMLAnchorElement;
      createElementSpy.mockReturnValue(mockAnchor);

      component.download();

      expect(mockAnchor.href).toBe('blob:test');
      expect(mockAnchor.download).toBe('My Novel.epub');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'File downloaded',
        'Dismiss',
        { duration: 2000 }
      );

      // Cleanup
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
    });
  });

  describe('Copy Share Link', () => {
    it('should copy link to clipboard when sharing enabled', async () => {
      component.sharePermission.set(SharePermission.Link);

      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

      await component.copyShareLink();

      expect(writeTextSpy).toHaveBeenCalledWith(
        'https://example.com/share/abc123'
      );
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Link copied to clipboard',
        'Dismiss',
        {
          duration: 2000,
        }
      );
    });

    it('should show error when no share URL', async () => {
      mockPublishedFilesService.getShareUrl.mockReturnValue(null);

      await component.copyShareLink();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Enable sharing first',
        'Dismiss',
        { duration: 2000 }
      );
    });

    it('should show error when clipboard copy fails', async () => {
      component.sharePermission.set(SharePermission.Link);

      const writeTextSpy = vi.fn().mockRejectedValue(new Error('Copy failed'));
      Object.assign(navigator, { clipboard: { writeText: writeTextSpy } });

      await component.copyShareLink();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to copy link',
        'Dismiss',
        { duration: 2000 }
      );
    });
  });

  describe('Permission Change', () => {
    it('should update share permission on selection change', async () => {
      const updatedFile = {
        ...mockFile,
        sharePermission: SharePermission.Link,
      };
      mockPublishedFilesService.updateSharePermission.mockResolvedValue(
        updatedFile
      );

      await component.onPermissionChange(SharePermission.Link);

      expect(component.sharePermission()).toBe(SharePermission.Link);
      expect(
        mockPublishedFilesService.updateSharePermission
      ).toHaveBeenCalledWith(
        'testuser/my-novel',
        'file-123',
        SharePermission.Link
      );
      expect(component.file()).toEqual(updatedFile);
    });

    it('should show error when permission update fails', async () => {
      mockPublishedFilesService.updateSharePermission.mockRejectedValue(
        new Error('Update failed')
      );

      await component.onPermissionChange(SharePermission.Link);

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to update sharing',
        'Dismiss',
        {
          duration: 3000,
        }
      );
    });

    it('should set updating state during permission change', async () => {
      let updateResolved = false;
      mockPublishedFilesService.updateSharePermission.mockImplementation(() => {
        expect(component.updating()).toBe(true);
        updateResolved = true;
        return Promise.resolve(mockFile);
      });

      await component.onPermissionChange(SharePermission.Link);

      expect(updateResolved).toBe(true);
      expect(component.updating()).toBe(false);
    });

    it('should ignore Collaborators permission (not implemented)', async () => {
      await component.onPermissionChange(SharePermission.Collaborators);

      expect(
        mockPublishedFilesService.updateSharePermission
      ).not.toHaveBeenCalled();
    });

    it('should not update file if updateSharePermission returns null', async () => {
      mockPublishedFilesService.updateSharePermission.mockResolvedValue(null);
      const originalFile = component.file();

      await component.onPermissionChange(SharePermission.Link);

      expect(component.file()).toEqual(originalFile);
    });
  });

  describe('Dialog Actions', () => {
    it('should close dialog with view-files action', () => {
      component.viewFiles();

      expect(mockDialogRef.close).toHaveBeenCalledWith({
        action: 'view-files',
        file: mockFile,
      });
    });

    it('should close dialog with close action', () => {
      component.close();

      expect(mockDialogRef.close).toHaveBeenCalledWith({
        action: 'close',
        file: mockFile,
      });
    });
  });

  describe('Share Options', () => {
    it('should have correct share options', () => {
      expect(component.shareOptions).toHaveLength(4);
      expect(component.shareOptions[0].value).toBe(SharePermission.Private);
      expect(component.shareOptions[1].value).toBe(
        SharePermission.Collaborators
      );
      expect(component.shareOptions[2].value).toBe(SharePermission.Link);
      expect(component.shareOptions[3].value).toBe(SharePermission.Public);
    });

    it('should have Collaborators option disabled', () => {
      const collaboratorsOption = component.shareOptions.find(
        o => o.value === SharePermission.Collaborators
      );
      expect(collaboratorsOption?.disabled).toBe(true);
      expect(collaboratorsOption?.tooltip).toBe('Coming soon');
    });
  });
});
