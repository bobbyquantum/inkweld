import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { ElementType } from '@inkweld/index';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BackmatterType,
  createDefaultPublishPlan,
  FrontmatterType,
  PublishFormat,
  PublishPlan,
  PublishPlanItemType,
  SeparatorStyle,
} from '../../../../models/publish-plan';
import { ProjectStateService } from '../../../../services/project/project-state.service';
import { PublishService } from '../../../../services/publish/publish.service';
import { PublishPlanTabComponent } from './publish-plan-tab.component';

describe('PublishPlanTabComponent', () => {
  let component: PublishPlanTabComponent;
  let fixture: ComponentFixture<PublishPlanTabComponent>;
  let mockProjectState: {
    elements: ReturnType<typeof signal<any[]>>;
    project: ReturnType<typeof signal<any>>;
    getPublishPlan: ReturnType<typeof vi.fn>;
    updatePublishPlan: ReturnType<typeof vi.fn>;
  };
  let mockPublishService: {
    publish: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: {
    open: ReturnType<typeof vi.fn>;
  };
  let testPlan: PublishPlan;

  beforeEach(async () => {
    testPlan = createDefaultPublishPlan('Test Project', 'Test Author');

    mockProjectState = {
      elements: signal([
        { id: 'elem-1', name: 'Chapter 1', type: ElementType.Item },
        { id: 'elem-2', name: 'Chapter 2', type: ElementType.Item },
        { id: 'folder-1', name: 'Folder', type: ElementType.Folder },
      ]),
      project: signal({ title: 'Test Project', coverImage: null }),
      getPublishPlan: vi.fn().mockReturnValue(testPlan),
      updatePublishPlan: vi.fn(),
    };

    mockPublishService = {
      publish: vi.fn().mockResolvedValue({ success: true, stats: { wordCount: 1000, chapterCount: 5 } }),
    };

    mockSnackBar = {
      open: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PublishPlanTabComponent, NoopAnimationsModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: PublishService, useValue: mockPublishService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({
              get: (key: string) => (key === 'tabId' ? testPlan.id : null),
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PublishPlanTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display plan name', () => {
    // Plan name is displayed in header
    const header = fixture.nativeElement.querySelector('.plan-header h2');
    expect(header?.textContent).toContain('Default Export');
  });

  it('should show save button when changes are made', () => {
    // Initially no save button
    let saveBtn = fixture.nativeElement.querySelector(
      '.header-actions button[color="primary"]'
    );
    expect(saveBtn).toBeNull();

    // Simulate a change by calling the component method directly
    component['hasChanges'].set(true);
    fixture.detectChanges();

    // Now save button should appear
    saveBtn = fixture.nativeElement.querySelector(
      '.header-actions button[color="primary"]'
    );
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.textContent).toContain('Save Changes');
  });

  it('should call updatePublishPlan when saving', async () => {
    // Make a change
    component['hasChanges'].set(true);
    fixture.detectChanges();

    // Click save
    const saveBtn = fixture.nativeElement.querySelector(
      '.header-actions button[color="primary"]'
    );
    saveBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockProjectState.updatePublishPlan).toHaveBeenCalled();
  });
});
