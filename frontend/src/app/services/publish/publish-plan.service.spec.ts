import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ChapterNumbering,
  PublishFormat,
  PublishPlan,
  PublishPlanItemType,
} from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';
import { PublishPlanService } from './publish-plan.service';

describe('PublishPlanService', () => {
  let service: PublishPlanService;
  let projectStateMock: {
    publishPlans: ReturnType<typeof signal<PublishPlan[]>>;
    getPublishPlans: ReturnType<typeof vi.fn>;
    getPublishPlan: ReturnType<typeof vi.fn>;
    createPublishPlan: ReturnType<typeof vi.fn>;
    updatePublishPlan: ReturnType<typeof vi.fn>;
    deletePublishPlan: ReturnType<typeof vi.fn>;
  };
  let loggerMock: { info: ReturnType<typeof vi.fn> };

  const mockPlan: PublishPlan = {
    id: 'plan-1',
    name: 'Test Plan',
    format: PublishFormat.EPUB,
    metadata: {
      title: 'Test Book',
      author: 'Test Author',
      language: 'en',
    },
    options: {
      includeToc: true,
      includeCover: false,
      chapterNumbering: ChapterNumbering.None,
      sceneBreakText: '* * *',
      includeWordCounts: false,
      fontFamily: 'serif',
      fontSize: 12,
      lineHeight: 1.5,
    },
    items: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    const plansSignal = signal<PublishPlan[]>([mockPlan]);

    projectStateMock = {
      publishPlans: plansSignal,
      getPublishPlans: vi.fn().mockReturnValue([mockPlan]),
      getPublishPlan: vi.fn().mockImplementation((id: string) => {
        if (id === 'plan-1') return mockPlan;
        return undefined;
      }),
      createPublishPlan: vi.fn(),
      updatePublishPlan: vi.fn(),
      deletePublishPlan: vi.fn(),
    };

    loggerMock = {
      info: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        PublishPlanService,
        { provide: ProjectStateService, useValue: projectStateMock },
        { provide: LoggerService, useValue: loggerMock },
      ],
    });

    service = TestBed.inject(PublishPlanService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getPlans', () => {
    it('should return all plans from project state', () => {
      const plans = service.getPlans();
      expect(plans).toEqual([mockPlan]);
      expect(projectStateMock.getPublishPlans).toHaveBeenCalled();
    });
  });

  describe('getPlan', () => {
    it('should return a specific plan by ID', () => {
      const plan = service.getPlan('plan-1');
      expect(plan).toEqual(mockPlan);
      expect(projectStateMock.getPublishPlan).toHaveBeenCalledWith('plan-1');
    });

    it('should return undefined for non-existent plan', () => {
      const plan = service.getPlan('non-existent');
      expect(plan).toBeUndefined();
    });
  });

  describe('createPlan', () => {
    it('should create a new plan with provided metadata', () => {
      const plan = service.createPlan('My Book', 'My Title', 'Author Name');

      expect(plan).toBeDefined();
      expect(plan.name).toBe('My Book');
      expect(plan.metadata.title).toBe('My Title');
      expect(plan.metadata.author).toBe('Author Name');
      expect(projectStateMock.createPublishPlan).toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        'PublishPlanService',
        'Creating plan: My Book'
      );
    });

    it('should generate a unique ID for the plan', () => {
      const plan1 = service.createPlan('Plan 1', 'Title 1', 'Author 1');
      const plan2 = service.createPlan('Plan 2', 'Title 2', 'Author 2');

      expect(plan1.id).toBeDefined();
      expect(plan2.id).toBeDefined();
      expect(plan1.id).not.toBe(plan2.id);
    });
  });

  describe('updatePlan', () => {
    it('should update an existing plan', () => {
      const updatedPlan = { ...mockPlan, name: 'Updated Plan' };
      service.updatePlan(updatedPlan);

      expect(projectStateMock.updatePublishPlan).toHaveBeenCalledWith(
        updatedPlan
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        'PublishPlanService',
        'Updating plan: Updated Plan'
      );
    });
  });

  describe('deletePlan', () => {
    it('should delete a plan by ID', () => {
      service.deletePlan('plan-1');

      expect(projectStateMock.deletePublishPlan).toHaveBeenCalledWith('plan-1');
      expect(loggerMock.info).toHaveBeenCalledWith(
        'PublishPlanService',
        'Deleting plan: plan-1'
      );
    });
  });

  describe('duplicatePlan', () => {
    it('should duplicate an existing plan with a new name', () => {
      const duplicated = service.duplicatePlan('plan-1', 'Duplicated Plan');

      expect(duplicated).toBeDefined();
      expect(duplicated.id).not.toBe(mockPlan.id);
      expect(duplicated.name).toBe('Duplicated Plan');
      expect(duplicated.metadata).toEqual(mockPlan.metadata);
      expect(duplicated.format).toBe(mockPlan.format);
      expect(projectStateMock.createPublishPlan).toHaveBeenCalledWith(
        duplicated
      );
    });

    it('should throw error when duplicating non-existent plan', () => {
      expect(() => service.duplicatePlan('non-existent', 'New Name')).toThrow(
        'Plan not found: non-existent'
      );
    });

    it('should set new timestamps on duplicated plan', () => {
      const duplicated = service.duplicatePlan('plan-1', 'Duplicated Plan');

      expect(duplicated.createdAt).not.toBe(mockPlan.createdAt);
      expect(duplicated.updatedAt).not.toBe(mockPlan.updatedAt);
    });
  });

  describe('getOrCreateQuickExportPlan', () => {
    it('should return existing Quick Export plan if found', () => {
      const quickExportPlan: PublishPlan = {
        ...mockPlan,
        name: 'Quick Export',
      };
      projectStateMock.getPublishPlans.mockReturnValue([quickExportPlan]);

      const plan = service.getOrCreateQuickExportPlan('Title', 'Author', [
        'elem-1',
        'elem-2',
      ]);

      expect(plan).toEqual(quickExportPlan);
      expect(projectStateMock.createPublishPlan).not.toHaveBeenCalled();
    });

    it('should create new Quick Export plan if none exists', () => {
      projectStateMock.getPublishPlans.mockReturnValue([mockPlan]); // No Quick Export

      const plan = service.getOrCreateQuickExportPlan('My Title', 'My Author', [
        'elem-1',
        'elem-2',
      ]);

      expect(plan.name).toBe('Quick Export');
      expect(plan.metadata.title).toBe('My Title');
      expect(plan.metadata.author).toBe('My Author');
      expect(plan.items).toHaveLength(2);
      expect(plan.items[0].type).toBe(PublishPlanItemType.Element);
      expect((plan.items[0] as { elementId: string }).elementId).toBe('elem-1');
      expect(projectStateMock.createPublishPlan).toHaveBeenCalled();
    });

    it('should create element items with isChapter true', () => {
      projectStateMock.getPublishPlans.mockReturnValue([]);

      const plan = service.getOrCreateQuickExportPlan('Title', 'Author', [
        'elem-1',
      ]);

      const elementItem = plan.items[0] as {
        elementId: string;
        isChapter: boolean;
      };
      expect(elementItem.isChapter).toBe(true);
    });
  });

  describe('plans signal', () => {
    it('should expose plans as a computed signal', () => {
      const plans = service.plans();
      expect(plans).toEqual([mockPlan]);
    });
  });

  describe('plans$ observable', () => {
    it('should expose plans as an observable', async () => {
      // toObservable may not emit synchronously, so we need to wait
      const emittedPlans = await new Promise<PublishPlan[] | undefined>(
        resolve => {
          const sub = service.plans$.subscribe(plans => {
            resolve(plans);
            sub.unsubscribe();
          });
          // Fallback timeout to prevent hanging
          setTimeout(() => resolve(undefined), 100);
        }
      );

      expect(emittedPlans).toEqual([mockPlan]);
    });
  });
});
