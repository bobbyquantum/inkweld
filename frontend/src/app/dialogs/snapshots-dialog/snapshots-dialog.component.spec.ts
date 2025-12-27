import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  UnifiedSnapshot,
  UnifiedSnapshotService,
} from '@services/project/unified-snapshot.service';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import {
  SnapshotsDialogComponent,
  SnapshotsDialogData,
} from './snapshots-dialog.component';

describe('SnapshotsDialogComponent', () => {
  let component: SnapshotsDialogComponent;
  let fixture: ComponentFixture<SnapshotsDialogComponent>;
  let snapshotServiceMock: MockedObject<UnifiedSnapshotService>;
  let dialogMock: MockedObject<MatDialog>;
  let dialogRefMock: MockedObject<MatDialogRef<SnapshotsDialogComponent>>;
  let snackBarMock: MockedObject<MatSnackBar>;

  const mockSnapshots: UnifiedSnapshot[] = [
    {
      id: 'snap-2',
      documentId: 'doc-1',
      name: 'Snapshot 2',
      description: 'Second snapshot (newest)',
      wordCount: 200,
      createdAt: '2024-01-02T00:00:00Z',
      isLocal: true,
      isSynced: true,
    },
    {
      id: 'snap-1',
      documentId: 'doc-1',
      name: 'Snapshot 1',
      description: 'First snapshot (older)',
      wordCount: 100,
      createdAt: '2024-01-01T00:00:00Z',
      isLocal: true,
      isSynced: false,
    },
  ];

  const mockDialogData: SnapshotsDialogData = {
    documentId: 'doc-1',
    currentWordCount: 150,
  };

  beforeEach(async () => {
    snapshotServiceMock = {
      listSnapshots: vi.fn().mockResolvedValue(mockSnapshots),
      createSnapshot: vi.fn().mockResolvedValue(mockSnapshots[0]),
      restoreFromSnapshot: vi.fn().mockResolvedValue(true),
      deleteSnapshot: vi.fn().mockResolvedValue(undefined),
    } as unknown as MockedObject<UnifiedSnapshotService>;

    dialogMock = {
      open: vi.fn().mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(null)),
      }),
    } as unknown as MockedObject<MatDialog>;

    dialogRefMock = {
      close: vi.fn(),
    } as unknown as MockedObject<MatDialogRef<SnapshotsDialogComponent>>;

    snackBarMock = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [SnapshotsDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UnifiedSnapshotService, useValue: snapshotServiceMock },
        { provide: MatDialog, useValue: dialogMock },
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: MatSnackBar, useValue: snackBarMock },
      ],
    })
      .overrideComponent(SnapshotsDialogComponent, {
        set: {
          providers: [{ provide: MatDialog, useValue: dialogMock }],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SnapshotsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load snapshots on init', async () => {
    await fixture.whenStable();
    expect(snapshotServiceMock.listSnapshots).toHaveBeenCalledWith('doc-1');
    expect(component.snapshots().length).toBe(2);
  });

  it('should sort snapshots by date descending', async () => {
    await fixture.whenStable();
    const snapshots = component.snapshots();
    expect(snapshots[0].id).toBe('snap-2'); // Newer first
    expect(snapshots[1].id).toBe('snap-1'); // Older second
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2024-01-01T12:00:00Z');
    expect(result).toContain('2024');
  });

  it('should format word count correctly', () => {
    expect(component.formatWordCount(1000)).toBe('1,000');
    expect(component.formatWordCount(null)).toBe('0');
    expect(component.formatWordCount(undefined)).toBe('0');
  });

  it('should close dialog when close is called', () => {
    component.close();
    expect(dialogRefMock.close).toHaveBeenCalled();
  });

  it('should show loading state', () => {
    component.loading.set(true);
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.loading-container')).toBeTruthy();
  });

  it('should show error state', () => {
    component.loading.set(false);
    component.error.set('Test error');
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.error-container')).toBeTruthy();
  });

  it('should show empty state when no snapshots', async () => {
    snapshotServiceMock.listSnapshots.mockResolvedValue([]);
    await component.loadSnapshots();
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.empty-state')).toBeTruthy();
  });

  it('should delete snapshot and show success message', async () => {
    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await component.deleteSnapshot(mockSnapshots[0]);

    expect(snapshotServiceMock.deleteSnapshot).toHaveBeenCalledWith('snap-2');
    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Snapshot deleted successfully',
      'OK',
      { duration: 3000 }
    );
  });

  it('should not delete snapshot if user cancels', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await component.deleteSnapshot(mockSnapshots[0]);

    expect(snapshotServiceMock.deleteSnapshot).not.toHaveBeenCalled();
  });

  it('should handle delete snapshot error', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    snapshotServiceMock.deleteSnapshot.mockRejectedValue(
      new Error('Delete failed')
    );

    await component.deleteSnapshot(mockSnapshots[0]);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to delete snapshot',
      'OK',
      { duration: 3000 }
    );
  });

  it('should handle load snapshots error', async () => {
    snapshotServiceMock.listSnapshots.mockRejectedValue(
      new Error('Load failed')
    );

    await component.loadSnapshots();

    expect(component.error()).toBe(
      'Failed to load snapshots. Please try again.'
    );
    expect(component.loading()).toBe(false);
  });

  it('should open create snapshot dialog and handle cancel', async () => {
    dialogMock.open.mockReturnValue({
      afterClosed: () => of(null),
    } as unknown as MatDialogRef<unknown>);

    await component.createSnapshot();

    expect(dialogMock.open).toHaveBeenCalled();
    expect(snapshotServiceMock.createSnapshot).not.toHaveBeenCalled();
  });

  it('should create snapshot when dialog returns result', async () => {
    dialogMock.open.mockReturnValue({
      afterClosed: () => of({ name: 'New Snapshot', description: 'Test' }),
    } as unknown as MatDialogRef<unknown>);

    await component.createSnapshot();

    expect(snapshotServiceMock.createSnapshot).toHaveBeenCalledWith(
      'doc-1',
      'New Snapshot',
      'Test'
    );
    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Snapshot "Snapshot 2" created successfully',
      'OK',
      { duration: 3000 }
    );
  });

  it('should handle create snapshot error', async () => {
    dialogMock.open.mockReturnValue({
      afterClosed: () => of({ name: 'New Snapshot', description: 'Test' }),
    } as unknown as MatDialogRef<unknown>);
    snapshotServiceMock.createSnapshot.mockRejectedValue(
      new Error('Create failed')
    );

    await component.createSnapshot();

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to create snapshot',
      'OK',
      { duration: 3000 }
    );
    expect(component.loading()).toBe(false);
  });

  it('should restore snapshot when confirmed', async () => {
    dialogMock.open.mockReturnValue({
      afterClosed: () => of(true),
    } as unknown as MatDialogRef<unknown>);

    await component.restoreSnapshot(mockSnapshots[0]);

    expect(snapshotServiceMock.restoreFromSnapshot).toHaveBeenCalledWith(
      'doc-1',
      'snap-2'
    );
    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Document restored to "Snapshot 2"',
      'OK',
      { duration: 3000 }
    );
    expect(dialogRefMock.close).toHaveBeenCalledWith(true);
  });

  it('should not restore snapshot when cancelled', async () => {
    dialogMock.open.mockReturnValue({
      afterClosed: () => of(false),
    } as unknown as MatDialogRef<unknown>);

    await component.restoreSnapshot(mockSnapshots[0]);

    expect(snapshotServiceMock.restoreFromSnapshot).not.toHaveBeenCalled();
  });

  it('should handle restore snapshot error', async () => {
    dialogMock.open.mockReturnValue({
      afterClosed: () => of(true),
    } as unknown as MatDialogRef<unknown>);
    snapshotServiceMock.restoreFromSnapshot.mockRejectedValue(
      new Error('Restore failed')
    );

    await component.restoreSnapshot(mockSnapshots[0]);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Failed to restore snapshot',
      'OK',
      { duration: 3000 }
    );
    expect(component.loading()).toBe(false);
  });

  it('should show preview coming soon message', () => {
    component.previewSnapshot(mockSnapshots[0]);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Preview feature coming soon',
      'OK',
      { duration: 3000 }
    );
  });
});
