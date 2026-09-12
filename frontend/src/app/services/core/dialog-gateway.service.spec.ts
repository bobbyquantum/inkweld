import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import {
  ElementType,
  ProfileBackgroundPlainKind,
  type Project,
} from '@inkweld/index';
import { of } from 'rxjs';
import { type Mock, type MockedObject, vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import {
  AddRelationshipDialogComponent,
  type AddRelationshipDialogData,
} from '../../dialogs/add-relationship-dialog/add-relationship-dialog.component';
import { CanvasSetupDialogComponent } from '../../dialogs/canvas-setup-dialog/canvas-setup-dialog.component';
import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '../../dialogs/confirmation-dialog/confirmation-dialog.component';
import { EditAvatarDialogComponent } from '../../dialogs/edit-avatar-dialog/edit-avatar-dialog.component';
import { EditProjectDialogComponent } from '../../dialogs/edit-project-dialog/edit-project-dialog.component';
import { ElementPickerDialogComponent } from '../../dialogs/element-picker-dialog/element-picker-dialog.component';
import { FieldConfigDialogComponent } from '../../dialogs/field-config-dialog/field-config-dialog.component';
import { FileUploadComponent } from '../../dialogs/file-upload/file-upload.component';
import { IconPickerDialogComponent } from '../../dialogs/icon-picker-dialog/icon-picker-dialog.component';
import { ImageGenerationDialogComponent } from '../../dialogs/image-generation-dialog/image-generation-dialog.component';
import {
  ImageViewerDialogComponent,
  type ImageViewerDialogData,
} from '../../dialogs/image-viewer-dialog/image-viewer-dialog.component';
import { ImportProjectDialogComponent } from '../../dialogs/import-project-dialog/import-project-dialog.component';
import { InsertImageDialogComponent } from '../../dialogs/insert-image-dialog/insert-image-dialog.component';
import { InsertLinkDialogComponent } from '../../dialogs/insert-link-dialog/insert-link-dialog.component';
import { MediaSelectorDialogComponent } from '../../dialogs/media-selector-dialog/media-selector-dialog.component';
import {
  NewElementDialogComponent,
  type NewElementDialogResult,
} from '../../dialogs/new-element-dialog/new-element-dialog.component';
import { ProfileAppearanceDialogComponent } from '../../dialogs/profile-appearance-dialog/profile-appearance-dialog.component';
import { ProfileManagerDialogComponent } from '../../dialogs/profile-manager-dialog/profile-manager-dialog.component';
import {
  RenameDialogComponent,
  type RenameDialogData,
} from '../../dialogs/rename-dialog/rename-dialog.component';
import {
  SceneDetailsDialogComponent,
  type SceneDetailsDialogData,
} from '../../dialogs/scene-details-dialog/scene-details-dialog.component';
import { SnapshotsDialogComponent } from '../../dialogs/snapshots-dialog/snapshots-dialog.component';
import { TagEditorDialogComponent } from '../../dialogs/tag-editor-dialog/tag-editor-dialog.component';
import { TemplateSnapshotsDialogComponent } from '../../dialogs/template-snapshots-dialog/template-snapshots-dialog.component';
import { UserSettingsDialogComponent } from '../../dialogs/user-settings-dialog/user-settings-dialog.component';
import { WorldbuildingImageDialogComponent } from '../../dialogs/worldbuilding-image-dialog/worldbuilding-image-dialog.component';
import { ProjectActivationService } from '../local/project-activation.service';
import { DialogGatewayService } from './dialog-gateway.service';

describe('DialogGatewayService', () => {
  let service: DialogGatewayService;
  let dialogMock: MockedObject<MatDialog>;
  let dialogRefMock: Partial<MatDialogRef<any>>;

  const mockActivationService = {
    activate: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    dialogRefMock = {
      afterClosed: vi.fn().mockReturnValue(of(null)),
    };

    dialogMock = {
      open: vi.fn().mockReturnValue(dialogRefMock as MatDialogRef<any>),
    } as unknown as MockedObject<MatDialog>;

    TestBed.configureTestingModule({
      imports: [translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        DialogGatewayService,
        { provide: MatDialog, useValue: dialogMock },
        { provide: ProjectActivationService, useValue: mockActivationService },
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
      maxWidth: '100vw',
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

  it('should open the canvas setup dialog', async () => {
    const setup = { page: { background: '#fff', inkColor: '#000' } };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(setup));

    const result = await service.openCanvasSetupDialog({ mode: 'create' });

    expect(dialogMock.open).toHaveBeenCalledWith(CanvasSetupDialogComponent, {
      data: { mode: 'create' },
      disableClose: true,
      width: '480px',
      maxWidth: '95vw',
    });
    expect(result).toEqual(setup);
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

  it('should open the scene details dialog', async () => {
    const data: SceneDetailsDialogData = {
      elementName: 'The Gate',
      metadata: { role: 'scene' },
      timeSystems: [],
    };
    const dialogResult = { patch: { status: 'draft' } };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(dialogResult));

    const result = await service.openSceneDetailsDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(SceneDetailsDialogComponent, {
      data,
      disableClose: true,
      width: '520px',
      maxWidth: '95vw',
    });
    expect(result).toEqual(dialogResult);
  });

  it('should open the field config dialog', async () => {
    const data = {
      field: { key: 'name', label: 'Name', type: 'text' },
      fieldTypes: [{ value: 'text', label: 'Text' }],
    };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(
      of({ label: 'Full Name' })
    );

    const result = await service.openFieldConfigDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(FieldConfigDialogComponent, {
      data,
      disableClose: true,
      width: '560px',
      maxWidth: '92vw',
    });
    expect(result).toEqual({ label: 'Full Name' });
  });

  it('should open the icon picker dialog', async () => {
    const data = {
      current: 'person',
      icons: ['person', 'place'],
      titleKey: 'templates.editor.iconLabel',
    };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of('map'));

    const result = await service.openIconPickerDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(IconPickerDialogComponent, {
      data,
      disableClose: true,
      width: '480px',
      maxWidth: '92vw',
    });
    expect(result).toBe('map');
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

  it('should open image viewer dialog', async () => {
    const data: ImageViewerDialogData = {
      imageUrl: 'https://example.com/image.png',
      fileName: 'test-image.png',
    };

    await service.openImageViewerDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(ImageViewerDialogComponent, {
      data,
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'image-viewer-dialog-panel',
    });
  });

  it('should return image viewer dialog result', async () => {
    const data: ImageViewerDialogData = {
      imageUrl: 'https://example.com/image.png',
      fileName: 'test-image.png',
      canEdit: true,
    };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of('change-image'));

    const result = await service.openImageViewerDialog(data);

    expect(result).toBe('change-image');
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

  it('should open the profile appearance dialog and coerce the result', async () => {
    const data = {
      username: 'alice',
      appearance: {
        background: { kind: ProfileBackgroundPlainKind.Plain },
        hasBanner: false,
      },
    };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(undefined));

    const result = await service.openProfileAppearanceDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(
      ProfileAppearanceDialogComponent,
      { width: '560px', maxWidth: '95vw', data }
    );
    expect(result).toBe(false);
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
      width: '1000px',
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
      width: '1000px',
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

  it('should auto-activate project on successful import', async () => {
    const result = { success: true, slug: 'imported-novel' };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(result));

    await service.openImportProjectDialog('testuser');

    expect(mockActivationService.activate).toHaveBeenCalledWith(
      'testuser/imported-novel'
    );
  });

  it('should not auto-activate on failed import', async () => {
    const result = { success: false };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(result));

    await service.openImportProjectDialog('testuser');

    expect(mockActivationService.activate).not.toHaveBeenCalled();
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

  it('should open the tag editor dialog', async () => {
    const data = { elementId: 'e1' } as unknown as Parameters<
      DialogGatewayService['openTagEditorDialog']
    >[0];
    await service.openTagEditorDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(TagEditorDialogComponent, {
      data,
      width: '450px',
      autoFocus: false,
    });
  });

  it('should open the snapshots dialog', async () => {
    const data = { documentId: 'd1' } as unknown as Parameters<
      DialogGatewayService['openSnapshotsDialog']
    >[0];
    await service.openSnapshotsDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(SnapshotsDialogComponent, {
      data,
      width: '550px',
      autoFocus: false,
    });
  });

  it('should open the element picker dialog and return its result', async () => {
    const data = { title: 'Pick' } as unknown as Parameters<
      DialogGatewayService['openElementPickerDialog']
    >[0];
    const picked = { elementId: 'e2' };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(picked));

    const result = await service.openElementPickerDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(ElementPickerDialogComponent, {
      width: '500px',
      maxHeight: '80vh',
      data,
    });
    expect(result).toEqual(picked);
  });

  it('should open the template snapshots dialog', async () => {
    await service.openTemplateSnapshotsDialog('char');

    expect(dialogMock.open).toHaveBeenCalledWith(
      TemplateSnapshotsDialogComponent,
      {
        data: { templateId: 'char' },
        width: '550px',
        autoFocus: false,
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

  it('should open insert link dialog', async () => {
    const data = { existingHref: 'https://example.com', selectedText: 'hello' };
    const dialogResult = {
      href: 'https://example.com',
      openInNewTab: true,
    };
    (dialogRefMock.afterClosed as Mock).mockReturnValue(of(dialogResult));

    const result = await service.openInsertLinkDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(InsertLinkDialogComponent, {
      data,
      disableClose: false,
      width: '420px',
      maxWidth: '95vw',
    });
    expect(result).toEqual(dialogResult);
  });
});
