import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Project } from '@inkweld/index';
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
  GenerateCoverDialogComponent,
  GenerateCoverDialogData,
} from '../../dialogs/generate-cover-dialog/generate-cover-dialog.component';
import {
  ImageViewerDialogComponent,
  ImageViewerDialogData,
} from '../../dialogs/image-viewer-dialog/image-viewer-dialog.component';
import {
  NewElementDialogComponent,
  NewElementDialogResult,
} from '../../dialogs/new-element-dialog/new-element-dialog.component';
import {
  RenameDialogComponent,
  RenameDialogData,
} from '../../dialogs/rename-dialog/rename-dialog.component';
import { UserSettingsDialogComponent } from '../../dialogs/user-settings-dialog/user-settings-dialog.component';

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
      maxWidth: '90vw',
      maxHeight: '90vh',
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

  openGenerateCoverDialog(project: Project): Promise<boolean> {
    const dialogRef = this.dialog.open(GenerateCoverDialogComponent, {
      data: { project } as GenerateCoverDialogData,
      disableClose: false,
      width: '600px',
      maxWidth: '95vw',
      maxHeight: '90vh',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openUserSettingsDialog(
    selectedCategory?:
      | 'general'
      | 'account'
      | 'project-tree'
      | 'project'
      | 'connection'
  ): Promise<void> {
    const dialogRef = this.dialog.open(UserSettingsDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh',
      panelClass: 'user-settings-dialog-panel',
      data: { selectedCategory: selectedCategory || 'general' },
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
}
