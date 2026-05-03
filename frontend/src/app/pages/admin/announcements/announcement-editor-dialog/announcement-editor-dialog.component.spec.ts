import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AnnouncementService } from '@services/announcement/announcement.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnnouncementEditorDialogComponent,
  type AnnouncementEditorDialogData,
} from './announcement-editor-dialog.component';

describe('AnnouncementEditorDialogComponent', () => {
  let component: AnnouncementEditorDialogComponent;
  let fixture: ComponentFixture<AnnouncementEditorDialogComponent>;
  let mockDialogRef: any;
  let mockAnnouncementService: any;
  let mockSnackBar: any;

  const createComponent = async (data: AnnouncementEditorDialogData) => {
    mockDialogRef = {
      close: vi.fn(),
    };

    mockAnnouncementService = {
      adminAnnouncements: signal([]),
      isLoadingAdmin: signal(false),
      error: signal(null),
      createAnnouncement: vi.fn().mockResolvedValue(undefined),
      updateAnnouncement: vi.fn().mockResolvedValue(undefined),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AnnouncementEditorDialogComponent, MatDialogModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: AnnouncementService, useValue: mockAnnouncementService },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AnnouncementEditorDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  describe('create mode', () => {
    beforeEach(async () => {
      await createComponent({ mode: 'create' });
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should have correct title for create mode', () => {
      expect(component.dialogTitle).toBe('Create Announcement');
    });

    it('should not be in edit mode', () => {
      expect(component.isEditMode).toBe(false);
    });

    it('should initialize empty form', () => {
      expect(component.titleStr()).toBe('');
      expect(component.contentStr()).toBe('');
      expect(component.form.get('type')?.value).toBe('announcement');
      expect(component.form.get('priority')?.value).toBe('normal');
      expect(component.form.get('isPublic')?.value).toBe(true);
      expect(component.form.get('expiresAt')?.value).toBeNull();
    });

    it('should be invalid when title and content are empty', () => {
      expect(component.isFormValid()).toBe(false);
    });

    describe('submit', () => {
      it('should not submit if form is invalid', async () => {
        await component.submit();

        expect(
          mockAnnouncementService.createAnnouncement
        ).not.toHaveBeenCalled();
        expect(mockDialogRef.close).not.toHaveBeenCalled();
      });

      it('should create announcement with valid form', async () => {
        component.titleStr.set('Test Title');
        component.contentStr.set('Test Content');

        await component.submit();

        expect(mockAnnouncementService.createAnnouncement).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Test Title',
            content: 'Test Content',
            type: 'announcement',
            priority: 'normal',
            isPublic: true,
          })
        );
        expect(mockDialogRef.close).toHaveBeenCalledWith(true);
      });

      it('should show error on create failure', async () => {
        mockAnnouncementService.createAnnouncement.mockRejectedValue(
          new Error('Failed')
        );
        component.titleStr.set('Test Title');
        component.contentStr.set('Test Content');

        await component.submit();

        expect(mockSnackBar.open).toHaveBeenCalledWith(
          'Failed to create announcement',
          'Dismiss',
          { duration: 5000 }
        );
        expect(mockDialogRef.close).not.toHaveBeenCalled();
      });

      it('should set isSubmitting during submit', async () => {
        component.titleStr.set('Test Title');
        component.contentStr.set('Test Content');

        let submittingDuringCall = false;
        mockAnnouncementService.createAnnouncement.mockImplementation(() => {
          submittingDuringCall = component.isSubmitting;
          return Promise.resolve();
        });

        await component.submit();

        expect(submittingDuringCall).toBe(true);
        expect(component.isSubmitting).toBe(false);
      });

      it('should convert expiresAt to ISO string', async () => {
        const expiresAt = new Date('2026-12-31');
        component.titleStr.set('Test Title');
        component.contentStr.set('Test Content');
        component.form.patchValue({ expiresAt });

        await component.submit();

        expect(mockAnnouncementService.createAnnouncement).toHaveBeenCalledWith(
          expect.objectContaining({
            expiresAt: expiresAt.toISOString(),
          })
        );
      });
    });

    describe('cancel', () => {
      it('should close dialog with false', () => {
        component.cancel();

        expect(mockDialogRef.close).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('edit mode', () => {
    const existingAnnouncement = {
      id: '1',
      title: 'Existing Title',
      content: 'Existing Content',
      type: 'maintenance' as const,
      priority: 'high' as const,
      isPublic: false,
      expiresAt: '2026-12-31T00:00:00.000Z',
      publishedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'admin-user-id',
    };

    beforeEach(async () => {
      await createComponent({
        mode: 'edit',
        announcement: existingAnnouncement,
      });
    });

    it('should have correct title for edit mode', () => {
      expect(component.dialogTitle).toBe('Edit Announcement');
    });

    it('should be in edit mode', () => {
      expect(component.isEditMode).toBe(true);
    });

    it('should populate form with existing data', () => {
      expect(component.titleStr()).toBe('Existing Title');
      expect(component.contentStr()).toBe('Existing Content');
      expect(component.form.get('type')?.value).toBe('maintenance');
      expect(component.form.get('priority')?.value).toBe('high');
      expect(component.form.get('isPublic')?.value).toBe(false);
      expect(component.form.get('expiresAt')?.value).toEqual(
        new Date('2026-12-31T00:00:00.000Z')
      );
    });

    describe('submit', () => {
      it('should update announcement with valid form', async () => {
        component.titleStr.set('Updated Title');

        await component.submit();

        expect(mockAnnouncementService.updateAnnouncement).toHaveBeenCalledWith(
          '1',
          expect.objectContaining({
            title: 'Updated Title',
          })
        );
        expect(mockDialogRef.close).toHaveBeenCalledWith(true);
      });

      it('should show error on update failure', async () => {
        mockAnnouncementService.updateAnnouncement.mockRejectedValue(
          new Error('Failed')
        );

        await component.submit();

        expect(mockSnackBar.open).toHaveBeenCalledWith(
          'Failed to update announcement',
          'Dismiss',
          { duration: 5000 }
        );
      });
    });
  });

  describe('type and priority options', () => {
    beforeEach(async () => {
      await createComponent({ mode: 'create' });
    });

    it('should have correct type options', () => {
      expect(component.typeOptions).toEqual([
        { value: 'announcement', label: 'Announcement', icon: 'campaign' },
        { value: 'update', label: 'Update', icon: 'update' },
        { value: 'maintenance', label: 'Maintenance', icon: 'build' },
      ]);
    });

    it('should have correct priority options', () => {
      expect(component.priorityOptions).toEqual([
        { value: 'low', label: 'Low' },
        { value: 'normal', label: 'Normal' },
        { value: 'high', label: 'High' },
      ]);
    });
  });
});
