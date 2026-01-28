import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ElementType, Project } from '@inkweld/index';
import { of } from 'rxjs';
import { Mock, MockedObject, vi } from 'vitest';

import {
  AddRelationshipDialogComponent,
  AddRelationshipDialogData,
} from '../../dialogs/add-relationship-dialog/add-relationship-dialog.component';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../../dialogs/confirmation-dialog/confirmation-dialog.component';
import { EditAvatarDialogComponent } from '../../dialogs/edit-avatar-dialog/edit-avatar-dialog.component';
import { EditProjectDialogComponent } from '../../dialogs/edit-project-dialog/edit-project-dialog.component';
import { FileUploadComponent } from '../../dialogs/file-upload/file-upload.component';
import { ImageGenerationDialogComponent } from '../../dialogs/image-generation-dialog/image-generation-dialog.component';
import {
  ImageViewerDialogComponent,
  ImageViewerDialogData,
} from '../../dialogs/image-viewer-dialog/image-viewer-dialog.component';
import { ImportProjectDialogComponent } from '../../dialogs/import-project-dialog/import-project-dialog.component';
import { InsertImageDialogComponent } from '../../dialogs/insert-image-dialog/insert-image-dialog.component';
import { MediaSelectorDialogComponent } from '../../dialogs/media-selector-dialog/media-selector-dialog.component';
import {
  NewElementDialogComponent,
  NewElementDialogResult,
} from '../../dialogs/new-element-dialog/new-element-dialog.component';
import { ProfileManagerDialogComponent } from '../../dialogs/profile-manager-dialog/profile-manager-dialog.component';
import {
  RenameDialogComponent,
  RenameDialogData,
} from '../../dialogs/rename-dialog/rename-dialog.component';
import { UserSettingsDialogComponent } from '../../dialogs/user-settings-dialog/user-settings-dialog.component';
import { WorldbuildingImageDialogComponent } from '../../dialogs/worldbuilding-image-dialog/worldbuilding-image-dialog.component';
import { DialogGatewayService } from './dialog-gateway.service';

describe('DialogGatewayService', () => {
  let service: DialogGatewayService;
  let dialogMock: MockedObject<MatDialog>;
  let dialogRefMock: Partial<MatDialogRef<any>>;

  beforeEach(() => {
    dialogRefMock = {
      afterClosed: vi.fn().mockReturnValue(of(null)),
    };

    dialogMock = {
      open: vi.fn().mockReturnValue(dialogRefMock as MatDialogRef<any>),
    } as unknown as MockedObject<MatDialog>;

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DialogGatewayService,
        { provide: MatDialog, useValue: dialogMock },
      ],
    });

    service = TestBed.inject(DialogGatewayService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should open confirmation dialog', async () => {
    const data: ConfirmationDialogData = {
      title: 'Test',
      message: 'Test message',
    };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(true));

    const result = await service.openConfirmationDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(ConfirmationDialogComponent, {
      data,
      disableClose: true,
    });
    expect(result).toBe(true);
  });

  it('should open edit project dialog', async () => {
    const project: Project = {
      id: '1',
      name: 'Test Project',
    } as unknown as Project;
    const updatedProject: Project = {
      ...project,
      name: 'Updated Project',
    } as Project;

    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(updatedProject));

    const result = await service.openEditProjectDialog(project);

    expect(dialogMock.open).toHaveBeenCalledWith(EditProjectDialogComponent, {
      data: project,
      disableClose: true,
      width: '600px',
    });
    expect(result).toEqual(updatedProject);
  });

  it('should open new element dialog', async () => {
    const dialogResult: NewElementDialogResult = {
      name: 'New Element',
      type: ElementType.Item,
    };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(dialogResult));

    const result = await service.openNewElementDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(NewElementDialogComponent, {
      disableClose: true,
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh',
    });
    expect(result).toEqual(dialogResult);
  });

  it('should open rename dialog', async () => {
    const data: RenameDialogData = {
      currentName: 'Rename Element',
    };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of('New Name'));

    const result = await service.openRenameDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(RenameDialogComponent, {
      data,
      disableClose: true,
      width: '400px',
    });
    expect(result).toBe('New Name');
  });

  it('should open file upload dialog', async () => {
    const testFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(testFile));

    const result = await service.openFileUploadDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(FileUploadComponent, {
      disableClose: true,
      width: '500px',
    });
    expect(result).toEqual(testFile);
  });

  it('should handle dialog cancellation', async () => {
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(null));

    const result = await service.openRenameDialog({ currentName: 'Test' });

    expect(result).toBeNull();
  });

  it('should open image viewer dialog', () => {
    const data: ImageViewerDialogData = {
      imageUrl: 'https://example.com/image.png',
      fileName: 'test-image.png',
    };

    service.openImageViewerDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(ImageViewerDialogComponent, {
      data,
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'image-viewer-dialog-panel',
    });
  });

  it('should open edit avatar dialog', async () => {
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(true));

    const result = await service.openEditAvatarDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(EditAvatarDialogComponent, {
      disableClose: true,
      width: '400px',
    });
    expect(result).toBe(true);
  });

  it('should open generate cover dialog using image generation dialog', async () => {
    const project: Project = {
      id: '1',
      title: 'Test Project',
      slug: 'test-project',
      username: 'testuser',
    } as Project;
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of({ saved: true }));

    const result = await service.openGenerateCoverDialog(project);

    // openGenerateCoverDialog now delegates to openImageGenerationDialog with forCover: true
    expect(dialogMock.open).toHaveBeenCalledWith(
      ImageGenerationDialogComponent,
      expect.objectContaining({
        data: { forCover: true },
      })
    );
    expect(result).toEqual({ saved: true });
  });

  it('should open user settings dialog with default category', async () => {
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(undefined));

    await service.openUserSettingsDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(UserSettingsDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh',
      panelClass: 'user-settings-dialog-panel',
      data: { selectedCategory: 'project-tree' },
    });
  });

  it('should open user settings dialog with specified category', async () => {
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(undefined));

    await service.openUserSettingsDialog('project-tree');

    expect(dialogMock.open).toHaveBeenCalledWith(UserSettingsDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh',
      panelClass: 'user-settings-dialog-panel',
      data: { selectedCategory: 'project-tree' },
    });
  });

  it('should open add relationship dialog', async () => {
    const data: AddRelationshipDialogData = {
      sourceElementId: 'element-1',
      sourceSchemaType: 'character-v1',
    };
    const result = {
      targetElementId: 'element-2',
      relationshipType: 'related',
    };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(result));

    const dialogResult = await service.openAddRelationshipDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(
      AddRelationshipDialogComponent,
      {
        data,
        disableClose: true,
        width: '500px',
      }
    );
    expect(dialogResult).toEqual(result);
  });

  it('should open image generation dialog without data', async () => {
    const result = { saved: true };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(result));

    const dialogResult = await service.openImageGenerationDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(
      ImageGenerationDialogComponent,
      expect.objectContaining({
        data: {},
        disableClose: false,
        width: '700px',
      })
    );
    expect(dialogResult).toEqual(result);
  });

  it('should open image generation dialog with data', async () => {
    const data = { forCover: false };
    const result = { saved: true };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(result));

    const dialogResult = await service.openImageGenerationDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(
      ImageGenerationDialogComponent,
      expect.objectContaining({
        data,
      })
    );
    expect(dialogResult).toEqual(result);
  });

  it('should open import project dialog with username', async () => {
    const result = { projectId: 'imported-123' };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(result));

    const dialogResult = await service.openImportProjectDialog('testuser');

    expect(dialogMock.open).toHaveBeenCalledWith(ImportProjectDialogComponent, {
      data: { username: 'testuser' },
      disableClose: true,
      width: '500px',
      maxWidth: '95vw',
    });
    expect(dialogResult).toEqual(result);
  });

  it('should open import project dialog without username', async () => {
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(undefined));

    await service.openImportProjectDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(ImportProjectDialogComponent, {
      data: { username: undefined },
      disableClose: true,
      width: '500px',
      maxWidth: '95vw',
    });
  });

  it('should open media selector dialog', async () => {
    const data = {
      projectKey: 'testuser/test-project',
      selectMultiple: false,
      username: 'testuser',
      slug: 'test-project',
    };
    const result = { selectedMedia: ['image.jpg'] };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(result));

    const dialogResult = await service.openMediaSelectorDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(MediaSelectorDialogComponent, {
      data,
      disableClose: false,
      width: '600px',
      maxWidth: '95vw',
      maxHeight: '80vh',
    });
    expect(dialogResult).toEqual(result);
  });

  it('should open worldbuilding image dialog', async () => {
    const data = {
      projectKey: 'testuser/test-project',
      elementId: 'element-1',
      elementName: 'Test Element',
      username: 'testuser',
      slug: 'test-project',
    };
    const result = { imageUrl: 'https://example.com/image.png' };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(result));

    const dialogResult = await service.openWorldbuildingImageDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(
      WorldbuildingImageDialogComponent,
      {
        data,
        disableClose: false,
        width: '500px',
        maxWidth: '95vw',
        maxHeight: '90vh',
      }
    );
    expect(dialogResult).toEqual(result);
  });

  it('should open profile manager dialog', async () => {
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(undefined));

    await service.openProfileManagerDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(
      ProfileManagerDialogComponent,
      {
        width: '500px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        disableClose: false,
      }
    );
  });

  it('should open new folder dialog', async () => {
    const dialogResult = { name: 'New Folder' };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(dialogResult));

    const result = await service.openNewFolderDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(NewElementDialogComponent, {
      disableClose: true,
      width: '500px',
      data: { skipTypeSelection: true, preselectedType: ElementType.Folder },
    });
    expect(result).toEqual(dialogResult);
  });

  it('should open insert image dialog', async () => {
    const data = {
      projectKey: 'testuser/test-project',
      username: 'testuser',
      slug: 'test-project',
    };
    const dialogResult = { imageUrl: 'https://example.com/image.png' };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(dialogResult));

    const result = await service.openInsertImageDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(InsertImageDialogComponent, {
      data,
      disableClose: false,
      width: '500px',
      maxWidth: '95vw',
      maxHeight: '90vh',
    });
    expect(result).toEqual(dialogResult);
  });
});
