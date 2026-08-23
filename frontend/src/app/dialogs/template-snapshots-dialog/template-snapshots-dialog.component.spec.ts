import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { TemplateSnapshotService } from '../../services/project/template-snapshot.service';
import { TemplateSnapshotsDialogComponent } from './template-snapshots-dialog.component';

describe('TemplateSnapshotsDialogComponent', () => {
  let component: TemplateSnapshotsDialogComponent;
  let fixture: ComponentFixture<TemplateSnapshotsDialogComponent>;
  let templateSnapshots: {
    listTemplateSnapshots: ReturnType<typeof vi.fn>;
    createTemplateSnapshot: ReturnType<typeof vi.fn>;
    restoreTemplateSnapshot: ReturnType<typeof vi.fn>;
    deleteTemplateSnapshot: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };

  const info = (id: string) => ({
    id,
    documentId: 'template:char',
    name: 'v1',
    createdAt: new Date().toISOString(),
    synced: false,
  });

  beforeEach(async () => {
    templateSnapshots = {
      listTemplateSnapshots: vi.fn(),
      createTemplateSnapshot: vi.fn(),
      restoreTemplateSnapshot: vi.fn(),
      deleteTemplateSnapshot: vi.fn(),
    };
    dialog = { open: vi.fn() };
    dialog.open.mockReturnValue({ afterClosed: () => of(null) });
    snackBar = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [TemplateSnapshotsDialogComponent, translocoTestProvider()],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { templateId: 'char' },
        },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: TemplateSnapshotService, useValue: templateSnapshots },
      ],
    })
      .overrideComponent(TemplateSnapshotsDialogComponent, {
        set: {
          providers: [
            { provide: MatDialog, useValue: dialog },
            { provide: MatSnackBar, useValue: snackBar },
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TemplateSnapshotsDialogComponent);
    component = fixture.componentInstance;
    templateSnapshots.listTemplateSnapshots.mockResolvedValue([]);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load snapshots on init', async () => {
    const list = [info('a'), info('b')];
    templateSnapshots.listTemplateSnapshots.mockResolvedValue(list);
    component.ngOnInit();
    await fixture.whenStable();
    expect(templateSnapshots.listTemplateSnapshots).toHaveBeenCalledWith(
      'char'
    );
    expect(component.snapshots()).toEqual(list);
  });

  it('should handle load errors by setting an error message', async () => {
    templateSnapshots.listTemplateSnapshots.mockRejectedValue(new Error('x'));
    fixture.detectChanges();
    await component.loadSnapshots();
    expect(component.error()).toBeTruthy();
  });

  it('should create a snapshot when the create dialog returns a name', async () => {
    templateSnapshots.createTemplateSnapshot.mockResolvedValue(undefined);
    dialog.open.mockReturnValue({
      afterClosed: () => of({ name: 'Baseline', description: '' }),
    });
    await component.createSnapshot();
    expect(templateSnapshots.createTemplateSnapshot).toHaveBeenCalledWith(
      'char',
      'Baseline',
      ''
    );
    expect(snackBar.open).toHaveBeenCalled();
  });

  it('should not create a snapshot when cancelled', async () => {
    await component.createSnapshot();
    expect(templateSnapshots.createTemplateSnapshot).not.toHaveBeenCalled();
  });

  it('should restore a snapshot after confirmation', async () => {
    templateSnapshots.restoreTemplateSnapshot.mockResolvedValue(undefined);
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    await component.restoreSnapshot(info('a'));
    expect(templateSnapshots.restoreTemplateSnapshot).toHaveBeenCalledWith(
      'char',
      'a'
    );
  });

  it('should delete a snapshot after confirmation', async () => {
    templateSnapshots.deleteTemplateSnapshot.mockResolvedValue(undefined);
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    await component.deleteSnapshot(info('a'));
    expect(templateSnapshots.deleteTemplateSnapshot).toHaveBeenCalledWith('a');
  });

  it('should not restore when the confirm is declined', async () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });
    await component.restoreSnapshot(info('a'));
    expect(templateSnapshots.restoreTemplateSnapshot).not.toHaveBeenCalled();
  });

  it('should close the dialog', () => {
    const ref = TestBed.inject(MatDialogRef);
    const closeSpy = vi.spyOn(ref, 'close');
    component.close();
    expect(closeSpy).toHaveBeenCalled();
  });
});
