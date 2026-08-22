import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AdminService } from '@services/admin/admin.service';
import { formatBytes } from '@utils/format-bytes';
import { vi } from 'vitest';

import { translocoTestProvider } from '../../../testing/transloco-test-provider';
import { AdminUserProjectsDialogComponent } from './admin-user-projects-dialog.component';

describe('AdminUserProjectsDialogComponent', () => {
  let component: AdminUserProjectsDialogComponent;
  let fixture: ComponentFixture<AdminUserProjectsDialogComponent>;
  let adminService: { listUserProjects: ReturnType<typeof vi.fn> };

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
  };

  beforeEach(async () => {
    adminService = {
      listUserProjects: vi.fn().mockResolvedValue(sampleResult),
    };

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
    }).compileComponents();

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
});
