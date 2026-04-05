import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDefaultPublishPlan,
  PublishFormat,
  type PublishPlan,
} from '../../../../models/publish-plan';
import { DialogGatewayService } from '../../../../services/core/dialog-gateway.service';
import { ProjectStateService } from '../../../../services/project/project-state.service';
import { PublishedFilesService } from '../../../../services/publish/published-files.service';
import { PublishPlansListTabComponent } from './publish-plans-list-tab.component';

describe('PublishPlansListTabComponent', () => {
  let component: PublishPlansListTabComponent;
  let fixture: ComponentFixture<PublishPlansListTabComponent>;
  let testPlan: PublishPlan;

  const mockProjectState = {
    publishPlans: signal<PublishPlan[]>([]),
    project: signal({
      title: 'Test',
      username: 'user',
      slug: 'proj',
      coverImage: null,
    }),
    createPublishPlan: vi.fn(),
    openPublishPlan: vi.fn(),
    deletePublishPlan: vi.fn(),
  };

  const mockPublishedFilesService = {
    loadFiles: vi.fn().mockResolvedValue([]),
  };

  const mockDialogGateway = {
    openConfirmationDialog: vi.fn().mockResolvedValue(false),
  };

  const mockRouter = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    testPlan = createDefaultPublishPlan('Test Project', 'Test Author');
    mockProjectState.publishPlans.set([testPlan]);
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [PublishPlansListTabComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: PublishedFilesService, useValue: mockPublishedFilesService },
        { provide: DialogGatewayService, useValue: mockDialogGateway },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublishPlansListTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }, 10000);

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display plan cards', () => {
    const cards = fixture.nativeElement.querySelectorAll(
      '[data-testid="publish-plan-card"]'
    );
    expect(cards.length).toBe(1);
  });

  it('should show empty state when no plans', () => {
    mockProjectState.publishPlans.set([]);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector(
      '[data-testid="empty-plans-state"]'
    );
    expect(empty).toBeTruthy();
  });

  it('should create a new plan', () => {
    component.createPublishPlan();

    expect(mockProjectState.createPublishPlan).toHaveBeenCalled();
    expect(mockProjectState.openPublishPlan).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalled();
  });

  it('should open a plan', () => {
    component.openPublishPlan(testPlan);

    expect(mockProjectState.openPublishPlan).toHaveBeenCalledWith(testPlan);
    expect(mockRouter.navigate).toHaveBeenCalledWith([
      '/',
      'user',
      'proj',
      'publish-plan',
      testPlan.id,
    ]);
  });

  it('should delete a plan after confirmation', async () => {
    mockDialogGateway.openConfirmationDialog.mockResolvedValue(true);
    const event = new Event('click');

    await component.deletePublishPlan(event, testPlan);

    expect(mockProjectState.deletePublishPlan).toHaveBeenCalledWith(
      testPlan.id
    );
  });

  it('should not delete a plan when cancelled', async () => {
    mockDialogGateway.openConfirmationDialog.mockResolvedValue(false);
    const event = new Event('click');

    await component.deletePublishPlan(event, testPlan);

    expect(mockProjectState.deletePublishPlan).not.toHaveBeenCalled();
  });

  it('should toggle history', () => {
    expect(component['expandedPlanId']()).toBeNull();

    component.toggleHistory('plan-1');
    expect(component['expandedPlanId']()).toBe('plan-1');

    component.toggleHistory('plan-1');
    expect(component['expandedPlanId']()).toBeNull();
  });

  it('should format file size', () => {
    expect(component.formatSize(500)).toBe('500 B');
    expect(component.formatSize(1024)).toBe('1.0 KB');
    expect(component.formatSize(1048576)).toBe('1.0 MB');
  });

  it('should format format names', () => {
    expect(component.formatFormatName(PublishFormat.EPUB)).toBe('EPUB');
    expect(component.formatFormatName(PublishFormat.PDF_SIMPLE)).toBe('PDF');
    expect(component.formatFormatName(PublishFormat.HTML)).toBe('HTML');
    expect(component.formatFormatName(PublishFormat.MARKDOWN)).toBe('Markdown');
    expect(component.formatFormatName('unknown')).toBe('unknown');
  });
});
