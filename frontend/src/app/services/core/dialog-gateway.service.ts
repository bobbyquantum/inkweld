import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ElementType, Project } from '@inkweld/index';
import { firstValueFrom } from 'rxjs';

import {
  AddRelationshipDialogComponent,
  AddRelationshipDialogData,
  AddRelationshipDialogResult,
} from '../../dialogs/add-relationship-dialog/add-relationship-dialog.component';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../../dialogs/confirmation-dialog/confirmation-dialog.component';
import { EditAvatarDialogComponent } from '../../dialogs/edit-avatar-dialog/edit-avatar-dialog.component';
import { EditProjectDialogComponent } from '../../dialogs/edit-project-dialog/edit-project-dialog.component';
import { FileUploadComponent } from '../../dialogs/file-upload/file-upload.component';
import {
  ImageGenerationDialogComponent,
  ImageGenerationDialogData,
  ImageGenerationDialogResult,
} from '../../dialogs/image-generation-dialog/image-generation-dialog.component';
import {
  ImageViewerDialogComponent,
  ImageViewerDialogData,
} from '../../dialogs/image-viewer-dialog/image-viewer-dialog.component';
import {
  ImportProjectDialogComponent,
  ImportProjectDialogData,
  ImportProjectDialogResult,
} from '../../dialogs/import-project-dialog/import-project-dialog.component';
import {
  InsertImageDialogComponent,
  InsertImageDialogData,
  InsertImageDialogResult,
} from '../../dialogs/insert-image-dialog/insert-image-dialog.component';
import {
  MediaSelectorDialogComponent,
  MediaSelectorDialogData,
  MediaSelectorDialogResult,
} from '../../dialogs/media-selector-dialog/media-selector-dialog.component';
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
import {
  WorldbuildingImageDialogComponent,
  WorldbuildingImageDialogData,
  WorldbuildingImageDialogResult,
} from '../../dialogs/worldbuilding-image-dialog/worldbuilding-image-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class DialogGatewayService {
  private dialog = inject(MatDialog);

  openConfirmationDialog(data: ConfirmationDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data,
      disableClose: true,
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openEditProjectDialog(project: Project): Promise<Project | null> {
    const dialogRef = this.dialog.open(EditProjectDialogComponent, {
      data: project,
      disableClose: true,
      width: '600px',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openNewElementDialog(): Promise<NewElementDialogResult | null> {
    const dialogRef = this.dialog.open(NewElementDialogComponent, {
      disableClose: true,
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openNewFolderDialog(): Promise<{ name: string } | null> {
    const dialogRef = this.dialog.open(NewElementDialogComponent, {
      disableClose: true,
      width: '500px',
      data: { skipTypeSelection: true, preselectedType: ElementType.Folder },
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openRenameDialog(data: RenameDialogData): Promise<string | null> {
    const dialogRef = this.dialog.open(RenameDialogComponent, {
      data,
      disableClose: true,
      width: '400px',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openFileUploadDialog(): Promise<File | null> {
    const dialogRef = this.dialog.open(FileUploadComponent, {
      width: '500px',
      disableClose: true,
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openImageViewerDialog(data: ImageViewerDialogData): void {
    this.dialog.open(ImageViewerDialogComponent, {
      data,
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'image-viewer-dialog-panel',
    });
  }

  openEditAvatarDialog(): Promise<boolean> {
    const dialogRef = this.dialog.open(EditAvatarDialogComponent, {
      disableClose: true,
      width: '400px',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openGenerateCoverDialog(
    _project: Project
  ): Promise<ImageGenerationDialogResult | undefined> {
    // Use the new ImageGenerationDialogComponent with forCover mode
    return this.openImageGenerationDialog({ forCover: true });
  }

  openUserSettingsDialog(
    selectedCategory?:
      | 'account'
      | 'authorized-apps'
      | 'project-tree'
      | 'project'
  ): Promise<void> {
    const dialogRef = this.dialog.open(UserSettingsDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh',
      panelClass: 'user-settings-dialog-panel',
      data: { selectedCategory: selectedCategory || 'project-tree' },
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openAddRelationshipDialog(
    data: AddRelationshipDialogData
  ): Promise<AddRelationshipDialogResult | undefined> {
    const dialogRef = this.dialog.open(AddRelationshipDialogComponent, {
      data,
      disableClose: true,
      width: '500px',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openImageGenerationDialog(
    data?: ImageGenerationDialogData
  ): Promise<ImageGenerationDialogResult | undefined> {
    const dialogRef = this.dialog.open(ImageGenerationDialogComponent, {
      data: data || {},
      disableClose: false,
      width: '700px',
      maxWidth: '95vw',
      maxHeight: '90vh',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openImportProjectDialog(
    username?: string
  ): Promise<ImportProjectDialogResult | undefined> {
    const data: ImportProjectDialogData = { username };
    const dialogRef = this.dialog.open(ImportProjectDialogComponent, {
      data,
      disableClose: true,
      width: '500px',
      maxWidth: '95vw',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openMediaSelectorDialog(
    data: MediaSelectorDialogData
  ): Promise<MediaSelectorDialogResult | undefined> {
    const dialogRef = this.dialog.open(MediaSelectorDialogComponent, {
      data,
      disableClose: false,
      width: '600px',
      maxWidth: '95vw',
      maxHeight: '80vh',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openWorldbuildingImageDialog(
    data: WorldbuildingImageDialogData
  ): Promise<WorldbuildingImageDialogResult | undefined> {
    const dialogRef = this.dialog.open(WorldbuildingImageDialogComponent, {
      data,
      disableClose: false,
      width: '500px',
      maxWidth: '95vw',
      maxHeight: '90vh',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openProfileManagerDialog(): Promise<void> {
    const dialogRef = this.dialog.open(ProfileManagerDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      disableClose: false,
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openInsertImageDialog(
    data: InsertImageDialogData
  ): Promise<InsertImageDialogResult | undefined> {
    const dialogRef = this.dialog.open(InsertImageDialogComponent, {
      data,
      disableClose: false,
      width: '500px',
      maxWidth: '95vw',
      maxHeight: '90vh',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }
}
