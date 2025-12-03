import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  PublishingPhase,
  PublishingProgress,
  PublishService,
} from '@services/publish';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PublishingProgressDialogComponent,
  PublishingProgressDialogData,
} from './publishing-progress-dialog.component';

describe('PublishingProgressDialogComponent', () => {
  let component: PublishingProgressDialogComponent;
  let dialogRefMock: { close: ReturnType<typeof vi.fn> };
  let publishServiceMock: {
    progress$: BehaviorSubject<PublishingProgress>;
    currentProgress: PublishingProgress;
    publish: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  const dialogData: PublishingProgressDialogData = {
    planId: 'plan-1',
    filename: 'test-output.epub',
    skipSync: false,
  };

  const initialProgress: PublishingProgress = {
    phase: PublishingPhase.IDLE,
    overallProgress: 0,
    message: '',
    cancellable: true,
  };

  beforeEach(async () => {
    dialogRefMock = {
      close: vi.fn(),
    };

    publishServiceMock = {
      progress$: new BehaviorSubject<PublishingProgress>(initialProgress),
      currentProgress: initialProgress,
      publish: vi.fn().mockResolvedValue({ success: true }),
      cancel: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        PublishingProgressDialogComponent,
        MatDialogModule,
        NoopAnimationsModule,
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialogRef, useValue: dialogRefMock },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: PublishService, useValue: publishServiceMock },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(
      PublishingProgressDialogComponent
    );
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start publishing on init', () => {
    expect(publishServiceMock.publish).toHaveBeenCalledWith('plan-1', {
      filename: 'test-output.epub',
      skipSync: false,
    });
  });

  describe('getPhaseIcon', () => {
    it('should return correct icon for IDLE', () => {
      expect(component.getPhaseIcon(PublishingPhase.IDLE)).toBe(
        'hourglass_empty'
      );
    });

    it('should return correct icon for INITIALIZING', () => {
      expect(component.getPhaseIcon(PublishingPhase.INITIALIZING)).toBe(
        'settings'
      );
    });

    it('should return correct icon for SYNCING', () => {
      expect(component.getPhaseIcon(PublishingPhase.SYNCING)).toBe('sync');
    });

    it('should return correct icon for GENERATING', () => {
      expect(component.getPhaseIcon(PublishingPhase.GENERATING)).toBe(
        'auto_stories'
      );
    });

    it('should return correct icon for FINALIZING', () => {
      expect(component.getPhaseIcon(PublishingPhase.FINALIZING)).toBe(
        'check_circle_outline'
      );
    });

    it('should return correct icon for COMPLETE', () => {
      expect(component.getPhaseIcon(PublishingPhase.COMPLETE)).toBe(
        'check_circle'
      );
    });

    it('should return correct icon for ERROR', () => {
      expect(component.getPhaseIcon(PublishingPhase.ERROR)).toBe('error');
    });

    it('should return correct icon for CANCELLED', () => {
      expect(component.getPhaseIcon(PublishingPhase.CANCELLED)).toBe('cancel');
    });

    it('should return default icon for unknown phase', () => {
      expect(component.getPhaseIcon('unknown' as PublishingPhase)).toBe(
        'hourglass_empty'
      );
    });
  });

  describe('getPhaseName', () => {
    it('should return correct name for IDLE', () => {
      expect(component.getPhaseName(PublishingPhase.IDLE)).toBe('Preparing');
    });

    it('should return correct name for INITIALIZING', () => {
      expect(component.getPhaseName(PublishingPhase.INITIALIZING)).toBe(
        'Initializing'
      );
    });

    it('should return correct name for SYNCING', () => {
      expect(component.getPhaseName(PublishingPhase.SYNCING)).toBe(
        'Syncing Documents'
      );
    });

    it('should return correct name for GENERATING', () => {
      expect(component.getPhaseName(PublishingPhase.GENERATING)).toBe(
        'Generating Output'
      );
    });

    it('should return correct name for FINALIZING', () => {
      expect(component.getPhaseName(PublishingPhase.FINALIZING)).toBe(
        'Finalizing'
      );
    });

    it('should return correct name for COMPLETE', () => {
      expect(component.getPhaseName(PublishingPhase.COMPLETE)).toBe('Complete');
    });

    it('should return correct name for ERROR', () => {
      expect(component.getPhaseName(PublishingPhase.ERROR)).toBe('Error');
    });

    it('should return correct name for CANCELLED', () => {
      expect(component.getPhaseName(PublishingPhase.CANCELLED)).toBe(
        'Cancelled'
      );
    });

    it('should return default name for unknown phase', () => {
      expect(component.getPhaseName('unknown' as PublishingPhase)).toBe(
        'Processing'
      );
    });
  });

  describe('isFinalPhase', () => {
    it('should return true for COMPLETE', () => {
      expect(component.isFinalPhase(PublishingPhase.COMPLETE)).toBe(true);
    });

    it('should return true for ERROR', () => {
      expect(component.isFinalPhase(PublishingPhase.ERROR)).toBe(true);
    });

    it('should return true for CANCELLED', () => {
      expect(component.isFinalPhase(PublishingPhase.CANCELLED)).toBe(true);
    });

    it('should return false for IDLE', () => {
      expect(component.isFinalPhase(PublishingPhase.IDLE)).toBe(false);
    });

    it('should return false for SYNCING', () => {
      expect(component.isFinalPhase(PublishingPhase.SYNCING)).toBe(false);
    });

    it('should return false for GENERATING', () => {
      expect(component.isFinalPhase(PublishingPhase.GENERATING)).toBe(false);
    });
  });

  describe('onCancel', () => {
    it('should call cancel when cancellable', () => {
      publishServiceMock.currentProgress = {
        ...initialProgress,
        cancellable: true,
      };

      component.onCancel();

      expect(publishServiceMock.cancel).toHaveBeenCalled();
      expect(dialogRefMock.close).not.toHaveBeenCalled();
    });

    it('should close dialog when not cancellable', () => {
      publishServiceMock.currentProgress = {
        ...initialProgress,
        cancellable: false,
      };

      component.onCancel();

      expect(publishServiceMock.cancel).not.toHaveBeenCalled();
      expect(dialogRefMock.close).toHaveBeenCalledWith({
        success: false,
        cancelled: true,
      });
    });
  });

  describe('onClose', () => {
    it('should close with success on COMPLETE phase', () => {
      publishServiceMock.currentProgress = {
        phase: PublishingPhase.COMPLETE,
        overallProgress: 100,
        message: 'Done',
        cancellable: false,
      };

      component.onClose();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        success: true,
        error: undefined,
        cancelled: false,
      });
    });

    it('should close with error on ERROR phase', () => {
      publishServiceMock.currentProgress = {
        phase: PublishingPhase.ERROR,
        overallProgress: 50,
        message: 'Failed',
        error: 'Something went wrong',
        cancellable: false,
      };

      component.onClose();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        success: false,
        error: 'Something went wrong',
        cancelled: false,
      });
    });

    it('should close with cancelled on CANCELLED phase', () => {
      publishServiceMock.currentProgress = {
        phase: PublishingPhase.CANCELLED,
        overallProgress: 25,
        message: 'Cancelled',
        cancellable: false,
      };

      component.onClose();

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        success: false,
        error: undefined,
        cancelled: true,
      });
    });
  });

  describe('progress subscription', () => {
    it('should auto-close on COMPLETE after delay', async () => {
      vi.useFakeTimers();

      // Emit complete progress
      publishServiceMock.progress$.next({
        phase: PublishingPhase.COMPLETE,
        overallProgress: 100,
        message: 'Done',
        cancellable: false,
      });

      // Fast-forward through the timeout
      vi.advanceTimersByTime(1500);

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        success: true,
      });

      vi.useRealTimers();
    });

    it('should close on CANCELLED', () => {
      publishServiceMock.progress$.next({
        phase: PublishingPhase.CANCELLED,
        overallProgress: 0,
        message: 'Cancelled',
        cancellable: false,
      });

      expect(dialogRefMock.close).toHaveBeenCalledWith({
        success: false,
        cancelled: true,
      });
    });

    it('should not close on ERROR phase', () => {
      publishServiceMock.progress$.next({
        phase: PublishingPhase.ERROR,
        overallProgress: 50,
        message: 'Error',
        error: 'Failed',
        cancellable: false,
      });

      expect(dialogRefMock.close).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle publish failure', async () => {
      publishServiceMock.publish.mockResolvedValue({ success: false });

      // Re-initialize to trigger publish
      const fixture = TestBed.createComponent(
        PublishingProgressDialogComponent
      );
      fixture.detectChanges();

      // Should not throw
      expect(publishServiceMock.publish).toHaveBeenCalled();
    });

    it('should handle publish exception', async () => {
      publishServiceMock.publish.mockRejectedValue(new Error('Network error'));

      // Re-initialize to trigger publish
      const fixture = TestBed.createComponent(
        PublishingProgressDialogComponent
      );
      fixture.detectChanges();

      // Should not throw
      expect(publishServiceMock.publish).toHaveBeenCalled();
    });
  });
});
