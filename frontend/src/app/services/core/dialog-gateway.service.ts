import { inject, Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ElementType, type Project } from '@inkweld/index';
import { firstValueFrom } from 'rxjs';

import type {
  AddRelationshipDialogData,
  AddRelationshipDialogResult,
} from '../../dialogs/add-relationship-dialog/add-relationship-dialog.component';
import type {
  CanvasSetupDialogData,
  CanvasSetupDialogResult,
} from '../../dialogs/canvas-setup-dialog/canvas-setup-dialog.component';
import type { ConfirmationDialogData } from '../../dialogs/confirmation-dialog/confirmation-dialog.component';
import type {
  ElementPickerDialogData,
  ElementPickerDialogResult,
} from '../../dialogs/element-picker-dialog/element-picker-dialog.component';
import type {
  FieldConfigDialogData,
  FieldConfigDialogResult,
} from '../../dialogs/field-config-dialog/field-config-dialog.component';
import type { IconPickerDialogData } from '../../dialogs/icon-picker-dialog/icon-picker-dialog.component';
import type {
  ImageGenerationDialogData,
  ImageGenerationDialogResult,
} from '../../dialogs/image-generation-dialog/image-generation-dialog.component';
import type {
  ImageViewerDialogData,
  ImageViewerDialogResult,
} from '../../dialogs/image-viewer-dialog/image-viewer-dialog.component';
import type {
  ImportProjectDialogData,
  ImportProjectDialogResult,
} from '../../dialogs/import-project-dialog/import-project-dialog.component';
import type {
  InsertImageDialogData,
  InsertImageDialogResult,
} from '../../dialogs/insert-image-dialog/insert-image-dialog.component';
import type {
  InsertLinkDialogData,
  InsertLinkDialogResult,
} from '../../dialogs/insert-link-dialog/insert-link-dialog.component';
import type {
  MediaSelectorDialogData,
  MediaSelectorDialogResult,
} from '../../dialogs/media-selector-dialog/media-selector-dialog.component';
import type { NewElementDialogResult } from '../../dialogs/new-element-dialog/new-element-dialog.component';
import type { ProfileAppearanceDialogData } from '../../dialogs/profile-appearance-dialog/profile-appearance-dialog.component';
import type { ProfileManagerDialogData } from '../../dialogs/profile-manager-dialog/profile-manager-dialog.component';
import type { RenameDialogData } from '../../dialogs/rename-dialog/rename-dialog.component';
import type {
  SceneDetailsDialogData,
  SceneDetailsDialogResult,
} from '../../dialogs/scene-details-dialog/scene-details-dialog.component';
import type { SnapshotsDialogData } from '../../dialogs/snapshots-dialog/snapshots-dialog.component';
import type { TagEditorDialogData } from '../../dialogs/tag-editor-dialog/tag-editor-dialog.component';
import type {
  WorldbuildingImageDialogData,
  WorldbuildingImageDialogResult,
} from '../../dialogs/worldbuilding-image-dialog/worldbuilding-image-dialog.component';
import { ProjectActivationService } from '../local/project-activation.service';

/**
 * Central place to open dialogs.
 *
 * Every dialog component is loaded with a dynamic import at the moment it is
 * opened. This service is injected by ProjectStateService, which is reachable
 * from the app shell at bootstrap, so static imports here would pull every
 * dialog — and, through the snapshots / edit-project / user-settings dialogs,
 * DocumentService and the entire ProseMirror editor stack plus the canvas
 * renderer — into the initial bundle. Only types are imported statically.
 */
@Injectable({
  providedIn: 'root',
})
export class DialogGatewayService {
  private readonly dialog = inject(MatDialog);
  private readonly activationService = inject(ProjectActivationService);

  async openConfirmationDialog(data: ConfirmationDialogData): Promise<boolean> {
    const { ConfirmationDialogComponent } =
      await import('../../dialogs/confirmation-dialog/confirmation-dialog.component');
    const dialogRef = this.dialog.open<unknown, unknown, boolean>(
      ConfirmationDialogComponent,
      {
        data,
        disableClose: true,
      }
    );
    return (await firstValueFrom(dialogRef.afterClosed())) ?? false;
  }

  async openEditProjectDialog(project: Project): Promise<Project | null> {
    const { EditProjectDialogComponent } =
      await import('../../dialogs/edit-project-dialog/edit-project-dialog.component');
    const dialogRef = this.dialog.open<unknown, unknown, Project | null>(
      EditProjectDialogComponent,
      {
        data: project,
        disableClose: true,
        // Responsive: 600px on desktop, edge-to-edge on phones (the dialog's
        // SCSS stacks the cover/form columns under 600px viewport width).
        width: '600px',
        maxWidth: '100vw',
      }
    );
    return (await firstValueFrom(dialogRef.afterClosed())) ?? null;
  }

  async openNewElementDialog(): Promise<NewElementDialogResult | null> {
    const { NewElementDialogComponent } =
      await import('../../dialogs/new-element-dialog/new-element-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      NewElementDialogResult | null
    >(NewElementDialogComponent, {
      disableClose: true,
      width: '800px',
      maxWidth: '90vw',
      maxHeight: '90vh',
    });
    return (await firstValueFrom(dialogRef.afterClosed())) ?? null;
  }

  /**
   * Ask for a canvas's page colours (and, when creating, its size). Resolves
   * with the chosen settings, or undefined when cancelled.
   */
  async openCanvasSetupDialog(
    data: CanvasSetupDialogData
  ): Promise<CanvasSetupDialogResult | undefined> {
    const { CanvasSetupDialogComponent } =
      await import('../../dialogs/canvas-setup-dialog/canvas-setup-dialog.component');
    const dialogRef = this.dialog.open<
      InstanceType<typeof CanvasSetupDialogComponent>,
      CanvasSetupDialogData,
      CanvasSetupDialogResult
    >(CanvasSetupDialogComponent, {
      data,
      disableClose: true,
      width: '480px',
      maxWidth: '95vw',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  async openNewFolderDialog(): Promise<{ name: string } | null> {
    const { NewElementDialogComponent } =
      await import('../../dialogs/new-element-dialog/new-element-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      { name: string } | null
    >(NewElementDialogComponent, {
      disableClose: true,
      width: '500px',
      data: { skipTypeSelection: true, preselectedType: ElementType.Folder },
    });
    return (await firstValueFrom(dialogRef.afterClosed())) ?? null;
  }

  async openSceneDetailsDialog(
    data: SceneDetailsDialogData
  ): Promise<SceneDetailsDialogResult | undefined> {
    const { SceneDetailsDialogComponent } =
      await import('../../dialogs/scene-details-dialog/scene-details-dialog.component');
    const dialogRef = this.dialog.open<
      InstanceType<typeof SceneDetailsDialogComponent>,
      SceneDetailsDialogData,
      SceneDetailsDialogResult
    >(SceneDetailsDialogComponent, {
      data,
      disableClose: true,
      width: '520px',
      maxWidth: '95vw',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  async openRenameDialog(data: RenameDialogData): Promise<string | null> {
    const { RenameDialogComponent } =
      await import('../../dialogs/rename-dialog/rename-dialog.component');
    const dialogRef = this.dialog.open<unknown, unknown, string | null>(
      RenameDialogComponent,
      {
        data,
        disableClose: true,
        width: '400px',
      }
    );
    return (await firstValueFrom(dialogRef.afterClosed())) ?? null;
  }

  /**
   * Open the schema field settings dialog. Resolves with the applied patch
   * (or undefined when cancelled).
   */
  async openFieldConfigDialog(
    data: FieldConfigDialogData
  ): Promise<FieldConfigDialogResult | undefined> {
    const { FieldConfigDialogComponent } =
      await import('../../dialogs/field-config-dialog/field-config-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      FieldConfigDialogResult
    >(FieldConfigDialogComponent, {
      data,
      disableClose: true,
      width: '560px',
      maxWidth: '92vw',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  /** Open the icon picker dialog. Resolves with the chosen icon or undefined. */
  async openIconPickerDialog(
    data: IconPickerDialogData
  ): Promise<string | undefined> {
    const { IconPickerDialogComponent } =
      await import('../../dialogs/icon-picker-dialog/icon-picker-dialog.component');
    const dialogRef = this.dialog.open<unknown, unknown, string>(
      IconPickerDialogComponent,
      {
        data,
        disableClose: true,
        width: '480px',
        maxWidth: '92vw',
      }
    );
    return firstValueFrom(dialogRef.afterClosed());
  }

  async openFileUploadDialog(): Promise<File | null> {
    const { FileUploadComponent } =
      await import('../../dialogs/file-upload/file-upload.component');
    const dialogRef = this.dialog.open<unknown, unknown, File | null>(
      FileUploadComponent,
      {
        width: '500px',
        disableClose: true,
      }
    );
    return (await firstValueFrom(dialogRef.afterClosed())) ?? null;
  }

  async openImageViewerDialog(
    data: ImageViewerDialogData
  ): Promise<ImageViewerDialogResult> {
    const { ImageViewerDialogComponent } =
      await import('../../dialogs/image-viewer-dialog/image-viewer-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      ImageViewerDialogResult
    >(ImageViewerDialogComponent, {
      data,
      width: '100vw',
      height: '100vh',
      maxWidth: '100vw',
      maxHeight: '100vh',
      panelClass: 'image-viewer-dialog-panel',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  async openEditAvatarDialog(): Promise<boolean> {
    const { EditAvatarDialogComponent } =
      await import('../../dialogs/edit-avatar-dialog/edit-avatar-dialog.component');
    const dialogRef = this.dialog.open<unknown, unknown, boolean>(
      EditAvatarDialogComponent,
      {
        disableClose: true,
        width: '400px',
      }
    );
    return (await firstValueFrom(dialogRef.afterClosed())) ?? false;
  }

  /**
   * Let the owner dress their profile page (banner + backdrop). Resolves to
   * true when anything was changed, so the page knows to reload.
   */
  async openProfileAppearanceDialog(
    data: ProfileAppearanceDialogData
  ): Promise<boolean> {
    const { ProfileAppearanceDialogComponent } =
      await import('../../dialogs/profile-appearance-dialog/profile-appearance-dialog.component');
    const dialogRef = this.dialog.open<unknown, unknown, boolean>(
      ProfileAppearanceDialogComponent,
      {
        width: '560px',
        maxWidth: '95vw',
        data,
      }
    );
    return firstValueFrom(dialogRef.afterClosed()).then(result => !!result);
  }

  openGenerateCoverDialog(
    _project: Project
  ): Promise<ImageGenerationDialogResult | undefined> {
    // Use the new ImageGenerationDialogComponent with forCover mode
    return this.openImageGenerationDialog({ forCover: true });
  }

  async openUserSettingsDialog(
    selectedCategory?:
      'account' | 'authorized-apps' | 'project-tree' | 'project'
  ): Promise<void> {
    const { UserSettingsDialogComponent } =
      await import('../../dialogs/user-settings-dialog/user-settings-dialog.component');
    const dialogRef = this.dialog.open<unknown, unknown, void>(
      UserSettingsDialogComponent,
      {
        width: '1000px',
        maxWidth: '90vw',
        maxHeight: '90vh',
        panelClass: 'user-settings-dialog-panel',
        data: { selectedCategory: selectedCategory || 'project-tree' },
      }
    );
    await firstValueFrom(dialogRef.afterClosed());
  }

  async openAddRelationshipDialog(
    data: AddRelationshipDialogData
  ): Promise<AddRelationshipDialogResult | undefined> {
    const { AddRelationshipDialogComponent } =
      await import('../../dialogs/add-relationship-dialog/add-relationship-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      AddRelationshipDialogResult
    >(AddRelationshipDialogComponent, {
      data,
      disableClose: true,
      width: '500px',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  async openImageGenerationDialog(
    data?: ImageGenerationDialogData
  ): Promise<ImageGenerationDialogResult | undefined> {
    const { ImageGenerationDialogComponent } =
      await import('../../dialogs/image-generation-dialog/image-generation-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      ImageGenerationDialogResult
    >(ImageGenerationDialogComponent, {
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
    const { ImportProjectDialogComponent } =
      await import('../../dialogs/import-project-dialog/import-project-dialog.component');
    const data: ImportProjectDialogData = { username };
    const dialogRef = this.dialog.open<
      InstanceType<typeof ImportProjectDialogComponent>,
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

  async openMediaSelectorDialog(
    data: MediaSelectorDialogData
  ): Promise<MediaSelectorDialogResult | undefined> {
    const { MediaSelectorDialogComponent } =
      await import('../../dialogs/media-selector-dialog/media-selector-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      MediaSelectorDialogResult
    >(MediaSelectorDialogComponent, {
      data,
      disableClose: false,
      width: '600px',
      maxWidth: '95vw',
      maxHeight: '80vh',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  async openWorldbuildingImageDialog(
    data: WorldbuildingImageDialogData
  ): Promise<WorldbuildingImageDialogResult | undefined> {
    const { WorldbuildingImageDialogComponent } =
      await import('../../dialogs/worldbuilding-image-dialog/worldbuilding-image-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      WorldbuildingImageDialogResult
    >(WorldbuildingImageDialogComponent, {
      data,
      disableClose: false,
      width: '500px',
      maxWidth: '95vw',
      maxHeight: '90vh',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  async openProfileManagerDialog(
    data?: ProfileManagerDialogData
  ): Promise<void> {
    const { ProfileManagerDialogComponent } =
      await import('../../dialogs/profile-manager-dialog/profile-manager-dialog.component');
    const dialogRef = this.dialog.open<unknown, unknown, void>(
      ProfileManagerDialogComponent,
      {
        width: '500px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        disableClose: false,
        ...(data ? { data } : {}),
      }
    );
    await firstValueFrom(dialogRef.afterClosed());
  }

  async openInsertLinkDialog(
    data: InsertLinkDialogData
  ): Promise<InsertLinkDialogResult | undefined> {
    const { InsertLinkDialogComponent } =
      await import('../../dialogs/insert-link-dialog/insert-link-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      InsertLinkDialogResult
    >(InsertLinkDialogComponent, {
      data,
      disableClose: false,
      width: '420px',
      maxWidth: '95vw',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  async openInsertImageDialog(
    data: InsertImageDialogData
  ): Promise<InsertImageDialogResult | undefined> {
    const { InsertImageDialogComponent } =
      await import('../../dialogs/insert-image-dialog/insert-image-dialog.component');
    const dialogRef = this.dialog.open<
      unknown,
      unknown,
      InsertImageDialogResult
    >(InsertImageDialogComponent, {
      data,
      disableClose: false,
      width: '500px',
      maxWidth: '95vw',
      maxHeight: '90vh',
    });
    return firstValueFrom(dialogRef.afterClosed());
  }

  async openTagEditorDialog(data: TagEditorDialogData): Promise<void> {
    const { TagEditorDialogComponent } =
      await import('../../dialogs/tag-editor-dialog/tag-editor-dialog.component');
    this.dialog.open<unknown, unknown, void>(TagEditorDialogComponent, {
      data,
      width: '450px',
      autoFocus: false,
    });
  }

  async openSnapshotsDialog(data: SnapshotsDialogData): Promise<void> {
    const { SnapshotsDialogComponent } =
      await import('../../dialogs/snapshots-dialog/snapshots-dialog.component');
    this.dialog.open<unknown, unknown, void>(SnapshotsDialogComponent, {
      data,
      width: '550px',
      autoFocus: false,
    });
  }

  async openTemplateSnapshotsDialog(templateId: string): Promise<void> {
    const { TemplateSnapshotsDialogComponent } =
      await import('../../dialogs/template-snapshots-dialog/template-snapshots-dialog.component');
    this.dialog.open<unknown, unknown, void>(TemplateSnapshotsDialogComponent, {
      data: { templateId },
      width: '550px',
      autoFocus: false,
    });
  }

  async openElementPickerDialog(
    data: ElementPickerDialogData
  ): Promise<ElementPickerDialogResult | undefined> {
    const { ElementPickerDialogComponent } =
      await import('../../dialogs/element-picker-dialog/element-picker-dialog.component');
    const dialogRef = this.dialog.open<
      InstanceType<typeof ElementPickerDialogComponent>,
      ElementPickerDialogData,
      ElementPickerDialogResult
    >(ElementPickerDialogComponent, {
      width: '500px',
      maxHeight: '80vh',
      data,
    });
    return firstValueFrom(dialogRef.afterClosed());
  }
}
