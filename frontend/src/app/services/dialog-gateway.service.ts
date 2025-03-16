import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ProjectDto } from '@inkweld/model/project-dto';
import { firstValueFrom } from 'rxjs';

import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../dialogs/confirmation-dialog/confirmation-dialog.component';
import { EditProjectDialogComponent } from '../dialogs/edit-project-dialog/edit-project-dialog.component';
import { FileUploadComponent } from '../dialogs/file-upload/file-upload.component';
import {
  NewElementDialogComponent,
  NewElementDialogResult,
} from '../dialogs/new-element-dialog/new-element-dialog.component';
import { NewProjectDialogComponent } from '../dialogs/new-project-dialog/new-project-dialog.component';
import {
  RenameDialogComponent,
  RenameDialogData,
} from '../dialogs/rename-dialog/rename-dialog.component';

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

  openEditProjectDialog(project: ProjectDto): Promise<ProjectDto | null> {
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
      width: '400px',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  openNewProjectDialog(): Promise<ProjectDto | null> {
    const dialogRef = this.dialog.open(NewProjectDialogComponent, {
      disableClose: true,
      width: '600px',
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
}
