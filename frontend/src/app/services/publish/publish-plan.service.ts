import { computed, inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

import {
  createDefaultPublishPlan,
  PublishPlan,
  PublishPlanItemType,
} from '../../models/publish-plan';
import { LoggerService } from '../core/logger.service';
import { ProjectStateService } from '../project/project-state.service';

/**
 * Service for managing publish plans.
 *
 * Delegates to ProjectStateService for storage, which uses the IElementSyncProvider
 * abstraction (Yjs online, IndexedDB offline).
 *
 * This allows:
 * - Real-time collaboration on publish plans (online mode)
 * - Offline storage via IndexedDB (offline mode)
 * - Automatic sync when switching modes
 */
@Injectable({
  providedIn: 'root',
})
export class PublishPlanService {
  private readonly logger = inject(LoggerService);
  private readonly projectState = inject(ProjectStateService);

  /** Signal for reactive access to plans */
  readonly plans = computed(() => this.projectState.publishPlans());

  /** Observable of all publish plans for current project */
  readonly plans$: Observable<PublishPlan[]> = toObservable(this.plans);

  /**
   * Get all publish plans for the current project
   */
  getPlans(): PublishPlan[] {
    return this.projectState.getPublishPlans();
  }

  /**
   * Get a specific publish plan by ID
   */
  getPlan(planId: string): PublishPlan | undefined {
    return this.projectState.getPublishPlan(planId);
  }

  /**
   * Create a new publish plan
   */
  createPlan(
    name: string,
    projectTitle: string,
    authorName: string
  ): PublishPlan {
    const plan = createDefaultPublishPlan(projectTitle, authorName);
    plan.name = name;

    this.logger.info('PublishPlanService', `Creating plan: ${name}`);
    this.projectState.createPublishPlan(plan);

    return plan;
  }

  /**
   * Update an existing publish plan
   */
  updatePlan(plan: PublishPlan): void {
    this.logger.info('PublishPlanService', `Updating plan: ${plan.name}`);
    this.projectState.updatePublishPlan(plan);
  }

  /**
   * Delete a publish plan
   */
  deletePlan(planId: string): void {
    this.logger.info('PublishPlanService', `Deleting plan: ${planId}`);
    this.projectState.deletePublishPlan(planId);
  }

  /**
   * Duplicate an existing plan
   */
  duplicatePlan(planId: string, newName: string): PublishPlan {
    const original = this.getPlan(planId);
    if (!original) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const duplicate: PublishPlan = {
      ...structuredClone(original),
      id: crypto.randomUUID(),
      name: newName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.projectState.createPublishPlan(duplicate);

    return duplicate;
  }

  /**
   * Get or create a default quick export plan
   */
  getOrCreateQuickExportPlan(
    projectTitle: string,
    authorName: string,
    elementIds: string[]
  ): PublishPlan {
    // Look for existing quick export plan
    const existing = this.getPlans().find(p => p.name === 'Quick Export');
    if (existing) {
      return existing;
    }

    // Create new quick export plan
    const plan = createDefaultPublishPlan(projectTitle, authorName);
    plan.name = 'Quick Export';

    // Add all elements as chapters
    for (const elementId of elementIds) {
      plan.items.push({
        id: crypto.randomUUID(),
        type: PublishPlanItemType.Element,
        elementId,
        includeChildren: false,
        isChapter: true,
      });
    }

    this.projectState.createPublishPlan(plan);

    return plan;
  }
}
