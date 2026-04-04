import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ElementType, type Project } from '@inkweld/index';
import { firstValueFrom } from 'rxjs';

import {
  AddRelationshipDialogComponent,
  type AddRelationshipDialogData,
  type AddRelationshipDialogResult,
} from '../../dialogs/add-relationship-dialog/add-relationship-dialog.component';
import {
  ConfirmationDialogComponent,
  type ConfirmationDialogData,
} from '../../dialogs/confirmation-dialog/confirmation-dialog.component';
import { EditAvatarDialogComponent } from '../../dialogs/edit-avatar-dialog/edit-avatar-dialog.component';
import { EditProjectDialogComponent } from '../../dialogs/edit-project-dialog/edit-project-dialog.component';
import { FileUploadComponent } from '../../dialogs/file-upload/file-upload.component';
import {
  ImageGenerationDialogComponent,
  type ImageGenerationDialogData,
  type ImageGenerationDialogResult,
} from '../../dialogs/image-generation-dialog/image-generation-dialog.component';
import {
  ImageViewerDialogComponent,
  type ImageViewerDialogData,
  type ImageViewerDialogResult,
} from '../../dialogs/image-viewer-dialog/image-viewer-dialog.component';
import {
  ImportProjectDialogComponent,
  type ImportProjectDialogData,
  type ImportProjectDialogResult,
} from '../../dialogs/import-project-dialog/import-project-dialog.component';
import {
  InsertImageDialogComponent,
  type InsertImageDialogData,
  type InsertImageDialogResult,
} from '../../dialogs/insert-image-dialog/insert-image-dialog.component';
import {
  MediaSelectorDialogComponent,
  type MediaSelectorDialogData,
  type MediaSelectorDialogResult,
} from '../../dialogs/media-selector-dialog/media-selector-dialog.component';
import {
  NewElementDialogComponent,
  type NewElementDialogResult,
} from '../../dialogs/new-element-dialog/new-element-dialog.component';
import { ProfileManagerDialogComponent } from '../../dialogs/profile-manager-dialog/profile-manager-dialog.component';
import {
  RenameDialogComponent,
  type RenameDialogData,
} from '../../dialogs/rename-dialog/rename-dialog.component';
import { UserSettingsDialogComponent } from '../../dialogs/user-settings-dialog/user-settings-dialog.component';
import {
  WorldbuildingImageDialogComponent,
  type WorldbuildingImageDialogData,
  type WorldbuildingImageDialogResult,
} from '../../dialogs/worldbuilding-image-dialog/worldbuilding-image-dialog.component';
import { ProjectActivationService } from '../local/project-activation.service';

@Injectable({
  providedIn: 'root',
})
export class DialogGatewayService {
  private readonly dialog = inject(MatDialog);
  private readonly activationService = inject(ProjectActivationService);

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

  openImageViewerDialog(
    data: ImageViewerDialogData
  ): Promise<ImageViewerDialogResult> {
    const dialogRef = this.dialog.open(ImageViewerDialogComponent, {
      data,
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'image-viewer-dialog-panel',
    });
    return firstValueFrom(dialogRef.afterClosed());
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

  async openImportProjectDialog(
    username?: string
  ): Promise<ImportProjectDialogResult | undefined> {
    const data: ImportProjectDialogData = { username };
    const dialogRef = this.dialog.open<
      ImportProjectDialogComponent,
      ImportProjectDialogData,
      ImportProjectDialogResult
    >(ImportProjectDialogComponent, {
      data,
      disableClose: true,
      width: '500px',
      maxWidth: '95vw',
    });
    const result = await firstValueFrom(dialogRef.afterClosed());

    // Auto-activate imported project on this device
    if (result?.success && result.slug && username) {
      await this.activationService
        .activate(`${username}/${result.slug}`)
        .catch(() => {});
    }

    return result;
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
