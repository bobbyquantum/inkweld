import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  AdminImageAuditsService,
  ImageGenerationAudit,
  ImageGenerationAuditStatus,
} from 'api-client';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminImageAuditsComponent } from './image-audits.component';

describe('AdminImageAuditsComponent', () => {
  let component: AdminImageAuditsComponent;
  let fixture: ComponentFixture<AdminImageAuditsComponent>;

  let mockAuditService: {
    adminListImageAudits: ReturnType<typeof vi.fn>;
    adminGetImageAuditStats: ReturnType<typeof vi.fn>;
  };

  let mockSnackBar: { open: ReturnType<typeof vi.fn> };

  let mockDialog: { open: ReturnType<typeof vi.fn> };

  const createMockAudit = (
    overrides: Partial<ImageGenerationAudit> = {}
  ): ImageGenerationAudit => ({
    id: '1',
    userId: 'user-1',
    username: 'testuser',
    profileId: 'profile-1',
    profileName: 'Test Profile',
    prompt: 'Test prompt',
    referenceImageUrls: null,
    outputImageUrls: null,
    creditCost: 1,
    status: ImageGenerationAuditStatus.Success,
    message: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(async () => {
    mockAuditService = {
      adminListImageAudits: vi.fn().mockReturnValue(
        of({
          audits: [],
          total: 0,
        })
      ),
      adminGetImageAuditStats: vi.fn().mockReturnValue(
        of({
          totalRequests: 0,
          successfulRequests: 0,
          blockedRequests: 0,
          moderatedRequests: 0,
          totalCreditsUsed: 0,
        })
      ),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    mockDialog = {
      open: vi.fn().mockReturnValue({
        afterClosed: () => of(undefined),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminImageAuditsComponent],
      providers: [
        provideAnimations(),
        { provide: AdminImageAuditsService, useValue: mockAuditService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminImageAuditsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load audits on init', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockAuditService.adminListImageAudits).toHaveBeenCalled();
    });

    it('should load stats on init', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockAuditService.adminGetImageAuditStats).toHaveBeenCalled();
    });
  });

  describe('truncatePrompt', () => {
    it('should return full prompt if under max length', () => {
      const shortPrompt = 'Short prompt';
      expect(component.truncatePrompt(shortPrompt)).toBe(shortPrompt);
    });

    it('should truncate and add ellipsis for long prompts', () => {
      const longPrompt =
        'This is a very long prompt that exceeds the default maximum length of eighty characters and should be truncated';
      const result = component.truncatePrompt(longPrompt);
      expect(result.length).toBe(83); // 80 + '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('should respect custom max length', () => {
      const prompt = 'This is a test prompt';
      const result = component.truncatePrompt(prompt, 10);
      expect(result).toBe('This is a ...');
    });
  });

  describe('onStatusFilterChange', () => {
    it('should set status filter and reset page', () => {
      fixture.detectChanges();

      component.onStatusFilterChange('success');

      expect(component.statusFilter()).toBe('success');
      expect(component.page()).toBe(1);
    });

    it('should reload audits', () => {
      fixture.detectChanges();
      mockAuditService.adminListImageAudits.mockClear();

      component.onStatusFilterChange('moderated');

      expect(mockAuditService.adminListImageAudits).toHaveBeenCalled();
    });
  });

  describe('onPageChange', () => {
    it('should update page and limit', () => {
      fixture.detectChanges();

      component.onPageChange({ pageIndex: 2, pageSize: 50, length: 100 });

      expect(component.page()).toBe(3); // pageIndex is 0-based
      expect(component.limit()).toBe(50);
    });

    it('should reload audits', () => {
      fixture.detectChanges();
      mockAuditService.adminListImageAudits.mockClear();

      component.onPageChange({ pageIndex: 1, pageSize: 25, length: 50 });

      expect(mockAuditService.adminListImageAudits).toHaveBeenCalled();
    });
  });

  describe('viewOutputImages', () => {
    it('should open dialog when outputImageUrls exist', () => {
      fixture.detectChanges();

      const audit = createMockAudit({
        outputImageUrls: ['http://example.com/image.png'],
      });
      component.viewOutputImages(audit);

      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should reload audits and stats', () => {
      fixture.detectChanges();
      mockAuditService.adminListImageAudits.mockClear();
      mockAuditService.adminGetImageAuditStats.mockClear();

      component.refresh();

      expect(mockAuditService.adminListImageAudits).toHaveBeenCalled();
      expect(mockAuditService.adminGetImageAuditStats).toHaveBeenCalled();
    });
  });
});
