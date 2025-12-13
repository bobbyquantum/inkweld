import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  UnifiedSnapshot,
  UnifiedSnapshotService,
} from '@services/project/unified-snapshot.service';
import { of } from 'rxjs';
import { MockedObject, vi } from 'vitest';

import { SnapshotPanelComponent } from './snapshot-panel.component';

describe('SnapshotPanelComponent', () => {
  let component: SnapshotPanelComponent;
  let fixture: ComponentFixture<SnapshotPanelComponent>;
  let snapshotServiceMock: MockedObject<UnifiedSnapshotService>;
  let dialogMock: MockedObject<MatDialog>;
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

    snackBarMock = {
      open: vi.fn(),
    } as unknown as MockedObject<MatSnackBar>;

    await TestBed.configureTestingModule({
      imports: [SnapshotPanelComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UnifiedSnapshotService, useValue: snapshotServiceMock },
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
    it('should load snapshots on init', async () => {
      // Wait for async loadSnapshots to complete
      await vi.waitFor(() => {
        expect(snapshotServiceMock.listSnapshots).toHaveBeenCalledWith('doc-1');
      });
    });
  });

  describe('loadSnapshots', () => {
    it('should set loading to false after loading completes', async () => {
      await component.loadSnapshots();

      expect(component.loading()).toBe(false);
    });

    it('should handle error when loading snapshots', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      snapshotServiceMock.listSnapshots.mockRejectedValue(
        new Error('Load failed')
      );

      await component.loadSnapshots();

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
      expect(snapshotServiceMock.createSnapshot).toHaveBeenCalledWith(
        'doc-1',
        'New Snapshot',
        'Test description'
      );
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Snapshot "Snapshot 2" created successfully',
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
      expect(snapshotServiceMock.restoreFromSnapshot).toHaveBeenCalledWith(
        'doc-1',
        'snap-2'
      );
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Document restored to "Snapshot 2"',
        'OK',
        { duration: 3000 }
      );
    });

    it('should not restore snapshot when dialog is cancelled', async () => {
      dialogMock.open.mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(false)),
      } as unknown as ReturnType<typeof dialogMock.open>);

      await component.restoreSnapshot(mockSnapshots[0]);

      expect(snapshotServiceMock.restoreFromSnapshot).not.toHaveBeenCalled();
    });

    it('should handle error when restoring snapshot', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      dialogMock.open.mockReturnValue({
        afterClosed: vi.fn().mockReturnValue(of(true)),
      } as unknown as ReturnType<typeof dialogMock.open>);
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
      consoleSpy.mockRestore();
    });
  });

  describe('previewSnapshot', () => {
    it('should show coming soon message for preview', () => {
      component.previewSnapshot(mockSnapshots[0]);

      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Preview feature coming soon',
        'OK',
        { duration: 3000 }
      );
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete snapshot when confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      await component.deleteSnapshot(mockSnapshots[0]);

      expect(snapshotServiceMock.deleteSnapshot).toHaveBeenCalledWith('snap-2');
      expect(snackBarMock.open).toHaveBeenCalledWith(
        'Snapshot deleted successfully',
        'OK',
        { duration: 3000 }
      );
    });

    it('should not delete snapshot when cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      await component.deleteSnapshot(mockSnapshots[0]);

      expect(snapshotServiceMock.deleteSnapshot).not.toHaveBeenCalled();
    });

    it('should handle error when deleting snapshot', async () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
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
