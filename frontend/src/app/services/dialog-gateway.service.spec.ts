import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ProjectDto } from '@inkweld/model/project-dto';
import { of } from 'rxjs';

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
import {
  RenameDialogComponent,
  RenameDialogData,
} from '../dialogs/rename-dialog/rename-dialog.component';
import { DialogGatewayService } from './dialog-gateway.service';

describe('DialogGatewayService', () => {
  let service: DialogGatewayService;
  let dialogMock: vi.Mocked<MatDialog>;
  let dialogRefMock: Partial<MatDialogRef<any>>;

  beforeEach(() => {
    dialogRefMock = {
      afterClosed: vi.fn().mockReturnValue(of(null)),
    };

    dialogMock = {
      open: vi.fn().mockReturnValue(dialogRefMock as MatDialogRef<any>),
    } as unknown as vi.Mocked<MatDialog>;

    TestBed.configureTestingModule({
      providers: [
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
    (dialogRefMock.afterClosed as vi.Mock).mockReturnValue(of(true));

    const result = await service.openConfirmationDialog(data);

    expect(dialogMock.open).toHaveBeenCalledWith(ConfirmationDialogComponent, {
      data,
      disableClose: true,
    });
    expect(result).toBe(true);
  });

  it('should open edit project dialog', async () => {
    const project: ProjectDto = {
      id: '1',
      name: 'Test Project',
    } as unknown as ProjectDto;
    const updatedProject: ProjectDto = {
      ...project,
      name: 'Updated Project',
    } as ProjectDto;

    (dialogRefMock.afterClosed as vi.Mock).mockReturnValue(
      of(updatedProject)
    );

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
      type: 'ITEM',
    };
    (dialogRefMock.afterClosed as vi.Mock).mockReturnValue(of(dialogResult));

    const result = await service.openNewElementDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(NewElementDialogComponent, {
      disableClose: true,
      width: '400px',
    });
    expect(result).toEqual(dialogResult);
  });

  it('should open rename dialog', async () => {
    const data: RenameDialogData = {
      currentName: 'Rename Element',
    };
    (dialogRefMock.afterClosed as vi.Mock).mockReturnValue(of('New Name'));

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
    (dialogRefMock.afterClosed as vi.Mock).mockReturnValue(of(testFile));

    const result = await service.openFileUploadDialog();

    expect(dialogMock.open).toHaveBeenCalledWith(FileUploadComponent, {
      disableClose: true,
      width: '500px',
    });
    expect(result).toEqual(testFile);
  });

  it('should handle dialog cancellation', async () => {
    (dialogRefMock.afterClosed as vi.Mock).mockReturnValue(of(null));

    const result = await service.openRenameDialog({ currentName: 'Test' });

    expect(result).toBeNull();
  });
});
