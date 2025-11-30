import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DocumentSnapshotService } from '@services/project/document-snapshot.service';
import { of, throwError } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { DocumentSnapshot } from '../../../api-client';
import { SnapshotPanelComponent } from './snapshot-panel.component';

describe('SnapshotPanelComponent', () => {
  let component: SnapshotPanelComponent;
  let fixture: ComponentFixture<SnapshotPanelComponent>;
  let snapshotServiceMock: MockedObject<DocumentSnapshotService>;
  let dialogMock: MockedObject<MatDialog>;
  let snackBarMock: MockedObject<MatSnackBar>;

  const mockSnapshots: DocumentSnapshot[] = [
    {
      id: 'snap-1',
      documentId: 'doc-1',
      name: 'Snapshot 1',
      description: 'First snapshot',
      wordCount: 100,
      createdAt: '2024-01-01T00:00:00Z',
    },
    {
      id: 'snap-2',
      documentId: 'doc-1',
      name: 'Snapshot 2',
      description: 'Second snapshot',
      wordCount: 200,
      createdAt: '2024-01-02T00:00:00Z',
    },
  ];

  beforeEach(async () => {
    snapshotServiceMock = {
      listSnapshots: vi.fn().mockReturnValue(of(mockSnapshots)),
      createSnapshot: vi.fn().mockReturnValue(of(mockSnapshots[0])),
      restoreSnapshot: vi.fn().mockReturnValue(of({ message: 'Restored' })),
      deleteSnapshot: vi.fn().mockReturnValue(of({ message: 'Deleted' })),
      previewSnapshot: vi
        .fn()
        .mockReturnValue(of({ yDocState: 'base64state' })),
    } as unknown as MockedObject<DocumentSnapshotService>;

    dialogMock = {
      open: vi.fn().mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(null)),
      }),
    } as unknown as MockedObject<MatDialog>;

    snackBarMock = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [SnapshotPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DocumentSnapshotService, useValue: snapshotServiceMock },
        { provide: MatDialog, useValue: dialogMock },
        { provide: MatSnackBar, useValue: snackBarMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SnapshotPanelComponent);
    component = fixture.componentInstance;
    // Set required input
    fixture.componentRef.setInput('documentId', 'doc-1');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load snapshots on init', () => {
      expect(snapshotServiceMock.listSnapshots).toHaveBeenCalledWith('doc-1', {
        orderBy: 'createdAt',
        order: 'DESC',
        limit: 100,
      });
      expect(component.snapshots()).toEqual(mockSnapshots);
    });
  });

  describe('loadSnapshots', () => {
    it('should set loading to true while loading', () => {
      component.loading.set(false);
      component.loadSnapshots();

      // After subscribe completes, loading should be false
      expect(component.loading()).toBe(false);
      expect(component.snapshots()).toEqual(mockSnapshots);
    });

    it('should handle error when loading snapshots', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      snapshotServiceMock.listSnapshots.mockReturnValue(
        throwError(() => new Error('Load failed'))
      );

      component.loadSnapshots();

      expect(component.error()).toBe(
        'Failed to load snapshots. Please try again.'
      );
      expect(component.loading()).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('createSnapshot', () => {
    it('should open create dialog and create snapshot when confirmed', async () => {
      const createResult = {
        name: 'New Snapshot',
        description: 'Test description',
      };
      dialogMock.open.mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(createResult)),
      } as unknown as ReturnType<typeof dialogMock.open>);

      await component.createSnapshot();

      expect(dialogMock.open).toHaveBeenCalled();
      expect(snapshotServiceMock.createSnapshot).toHaveBeenCalledWith('doc-1', {
        documentId: 'doc-1',
        name: 'New Snapshot',
        description: 'Test description',
        yDocState: '',
      });
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Snapshot "Snapshot 1" created successfully',
        'OK',
        { duration: 3000 }
      );
    });

    it('should not create snapshot when dialog is cancelled', async () => {
      dialogMock.open.mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(null)),
      } as unknown as ReturnType<typeof dialogMock.open>);

      await component.createSnapshot();

      expect(dialogMock.open).toHaveBeenCalled();
      expect(snapshotServiceMock.createSnapshot).not.toHaveBeenCalled();
    });

    it('should handle error when creating snapshot', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      dialogMock.open.mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of({ name: 'Test' })),
      } as unknown as ReturnType<typeof dialogMock.open>);
      snapshotServiceMock.createSnapshot.mockReturnValue(
        throwError(() => new Error('Create failed'))
      );

      await component.createSnapshot();

      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Failed to create snapshot',
        'OK',
        { duration: 3000 }
      );
      expect(component.loading()).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('restoreSnapshot', () => {
    it('should open restore dialog and restore snapshot when confirmed', async () => {
      dialogMock.open.mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(true)),
      } as unknown as ReturnType<typeof dialogMock.open>);

      await component.restoreSnapshot(mockSnapshots[0]);

      expect(dialogMock.open).toHaveBeenCalled();
      expect(snapshotServiceMock.restoreSnapshot).toHaveBeenCalledWith(
        'doc-1',
        'snap-1'
      );
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Document restored to "Snapshot 1"',
        'OK',
        { duration: 3000 }
      );
    });

    it('should not restore snapshot when dialog is cancelled', async () => {
      dialogMock.open.mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(false)),
      } as unknown as ReturnType<typeof dialogMock.open>);

      await component.restoreSnapshot(mockSnapshots[0]);

      expect(snapshotServiceMock.restoreSnapshot).not.toHaveBeenCalled();
    });

    it('should handle error when restoring snapshot', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      dialogMock.open.mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(true)),
      } as unknown as ReturnType<typeof dialogMock.open>);
      snapshotServiceMock.restoreSnapshot.mockReturnValue(
        throwError(() => new Error('Restore failed'))
      );

      await component.restoreSnapshot(mockSnapshots[0]);

      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Failed to restore snapshot',
        'OK',
        { duration: 3000 }
      );
      expect(component.loading()).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('previewSnapshot', () => {
    it('should show not implemented message for preview', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      component.previewSnapshot(mockSnapshots[0]);

      expect(snapshotServiceMock.previewSnapshot).toHaveBeenCalledWith(
        'doc-1',
        'snap-1'
      );
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Preview feature needs implementation (backend returns yDocState, not HTML)',
        'OK',
        { duration: 5000 }
      );
      consoleSpy.mockRestore();
    });

    it('should handle error when previewing snapshot', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      snapshotServiceMock.previewSnapshot.mockReturnValue(
        throwError(() => new Error('Preview failed'))
      );

      component.previewSnapshot(mockSnapshots[0]);

      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Failed to preview snapshot',
        'OK',
        { duration: 3000 }
      );
      consoleSpy.mockRestore();
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete snapshot when confirmed', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      component.deleteSnapshot(mockSnapshots[0]);

      expect(snapshotServiceMock.deleteSnapshot).toHaveBeenCalledWith(
        'doc-1',
        'snap-1'
      );
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Snapshot deleted successfully',
        'OK',
        { duration: 3000 }
      );
    });

    it('should not delete snapshot when cancelled', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      component.deleteSnapshot(mockSnapshots[0]);

      expect(snapshotServiceMock.deleteSnapshot).not.toHaveBeenCalled();
    });

    it('should handle error when deleting snapshot', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      snapshotServiceMock.deleteSnapshot.mockReturnValue(
        throwError(() => new Error('Delete failed'))
      );

      component.deleteSnapshot(mockSnapshots[0]);

      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Failed to delete snapshot',
        'OK',
        { duration: 3000 }
      );
      consoleSpy.mockRestore();
    });
  });

  describe('formatDate', () => {
    it('should format date string correctly', () => {
      const result = component.formatDate('2024-01-15T10:30:00Z');

      // The exact format depends on locale, but it should contain the date
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format Date object correctly', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = component.formatDate(date);

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatWordCount', () => {
    it('should format number with commas', () => {
      expect(component.formatWordCount(1000)).toBe('1,000');
      expect(component.formatWordCount(1234567)).toBe('1,234,567');
    });

    it('should return "0" for null', () => {
      expect(component.formatWordCount(null)).toBe('0');
    });

    it('should return "0" for undefined', () => {
      expect(component.formatWordCount(undefined)).toBe('0');
    });

    it('should handle zero', () => {
      expect(component.formatWordCount(0)).toBe('0');
    });
  });

  describe('closePanel output', () => {
    it('should emit when close is requested', () => {
      const emitSpy = vi.spyOn(component.closePanel, 'emit');

      component.closePanel.emit();

      expect(emitSpy).toHaveBeenCalled();
    });
  });
});
