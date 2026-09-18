import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminService } from '@services/admin/admin.service';
import { formatBytes } from '@utils/format-bytes';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { AdminUserProjectsDialogComponent } from './admin-user-projects-dialog.component';

describe('AdminUserProjectsDialogComponent', () => {
  let component: AdminUserProjectsDialogComponent;
  let fixture: ComponentFixture<AdminUserProjectsDialogComponent>;
  let adminService: {
    listUserProjects: ReturnType<typeof vi.fn>;
    setUserQuota: ReturnType<typeof vi.fn>;
  };
  let snackBar: { open: ReturnType<typeof vi.fn> };

  const sampleResult = {
    userId: 'u1',
    username: 'alice',
    projects: [
      {
        id: 'p1',
        slug: 'novel',
        title: 'My Novel',
        dataBytes: 5000,
        mediaBytes: 1000,
        totalBytes: 6000,
      },
    ],
    totalDataBytes: 5000,
    totalMediaBytes: 1000,
    totalBytes: 6000,
    syncQuotaBytes: null as number | null,
    effectiveQuotaBytes: 104857600,
    instanceDefaultQuotaBytes: 104857600,
  };

  beforeEach(async () => {
    adminService = {
      listUserProjects: vi.fn().mockResolvedValue(sampleResult),
      setUserQuota: vi.fn().mockResolvedValue(undefined),
    };
    snackBar = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [translocoTestProvider(), AdminUserProjectsDialogComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AdminService, useValue: adminService },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { userId: 'u1', username: 'alice' },
        },
      ],
    })
      .overrideComponent(AdminUserProjectsDialogComponent, {
        add: { providers: [{ provide: MatSnackBar, useValue: snackBar }] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminUserProjectsDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load and display projects with sizes', async () => {
    expect(adminService.listUserProjects).toHaveBeenCalledWith('u1');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.data()?.projects.length).toBe(1);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('My Novel');
    expect(compiled.textContent).toContain('4.9 KB data');
    expect(compiled.textContent).toContain('1000 B media');
  });

  it('should set error state on failure', async () => {
    adminService.listUserProjects = vi
      .fn()
      .mockRejectedValue(new Error('boom'));

    component.refresh();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.error()).toBe('Failed to load projects');
    expect(component.isLoading()).toBe(false);
  });

  it('should format bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  describe('quota editor', () => {
    it('defaults to "use instance default" when the user has no override', async () => {
      await fixture.whenStable();
      expect(component.useDefaultQuota()).toBe(true);
      expect(component.quotaMb()).toBeNull();
    });

    it('seeds an MB value from an explicit override', async () => {
      adminService.listUserProjects.mockResolvedValue({
        ...sampleResult,
        syncQuotaBytes: 5 * 1024 * 1024,
      });
      component.refresh();
      await fixture.whenStable();

      expect(component.useDefaultQuota()).toBe(false);
      expect(component.quotaMb()).toBe(5);
    });

    it('seeds the field from the effective allowance when opting out of default', async () => {
      await fixture.whenStable();
      component.onUseDefaultChange(false);
      expect(component.useDefaultQuota()).toBe(false);
      // 104857600 bytes = 100 MB
      expect(component.quotaMb()).toBe(100);
    });

    it('saves an override in bytes', async () => {
      await fixture.whenStable();
      component.onUseDefaultChange(false);
      component.quotaMb.set(250);
      await component.saveQuota();

      expect(adminService.setUserQuota).toHaveBeenCalledWith(
        'u1',
        250 * 1024 * 1024
      );
      expect(snackBar.open).toHaveBeenCalled();
    });

    it('clears the override by sending null when using the default', async () => {
      await fixture.whenStable();
      component.useDefaultQuota.set(true);
      await component.saveQuota();

      expect(adminService.setUserQuota).toHaveBeenCalledWith('u1', null);
    });

    it('clamps a negative entry to zero', async () => {
      await fixture.whenStable();
      component.onUseDefaultChange(false);
      component.quotaMb.set(-10);
      await component.saveQuota();

      expect(adminService.setUserQuota).toHaveBeenCalledWith('u1', 0);
    });

    it('reports a failed save without throwing', async () => {
      adminService.setUserQuota.mockRejectedValue(new Error('nope'));
      await fixture.whenStable();
      await component.saveQuota();

      expect(snackBar.open).toHaveBeenCalled();
      expect(component.isSavingQuota()).toBe(false);
    });
  });
});
