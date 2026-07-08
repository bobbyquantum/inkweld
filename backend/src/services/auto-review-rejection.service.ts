/**
 * Service for storing and retrieving auto-review rejections.
 *
 * When a user rejects a suggestion, we store it so the LLM can be told
 * "don't repeat these" on the next review. When a user accepts a suggestion,
 * we delete any matching rejections (the issue is resolved).
 */

import { eq, and } from 'drizzle-orm';
import {
  autoReviewRejections,
  type InsertAutoReviewRejection,
} from '../db/schema/auto-review-rejections';
import type { DatabaseInstance } from '../types/context';
import { logger } from './logger.service';

const rejectionLog = logger.child('AutoReviewRejections');

export interface RejectionContext {
  originalText: string;
  suggestionText: string;
  category: string;
  message: string;
}

export class AutoReviewRejectionService {
  /**
   * Store a rejected suggestion.
   */
  async addRejection(
    db: DatabaseInstance,
    params: {
      projectId: string;
      documentId: string;
      elementId: string;
      rejection: RejectionContext;
      userId: string;
    }
  ): Promise<void> {
    const insert: InsertAutoReviewRejection = {
      projectId: params.projectId,
      documentId: params.documentId,
      elementId: params.elementId,
      originalText: params.rejection.originalText,
      suggestionText: params.rejection.suggestionText,
      category: params.rejection.category,
      message: params.rejection.message,
      rejectedBy: params.userId,
      rejectedAt: Math.floor(Date.now() / 1000),
    };
    await db.insert(autoReviewRejections).values(insert);
    rejectionLog.debug(`Stored rejection for element ${params.elementId}`);
  }

  /**
   * Get all rejections for a document element.
   */
  async getRejections(
    db: DatabaseInstance,
    projectId: string,
    elementId: string
  ): Promise<RejectionContext[]> {
    const rows = await db
      .select()
      .from(autoReviewRejections)
      .where(
        and(
          eq(autoReviewRejections.projectId, projectId),
          eq(autoReviewRejections.elementId, elementId)
        )
      );
    return rows.map((r) => ({
      originalText: r.originalText,
      suggestionText: r.suggestionText,
      category: r.category ?? '',
      message: r.message ?? '',
    }));
  }

  /**
   * Delete rejections matching an accepted suggestion (issue resolved).
   */
  async deleteMatchingRejections(
    db: DatabaseInstance,
    projectId: string,
    elementId: string,
    originalText: string
  ): Promise<void> {
    await db
      .delete(autoReviewRejections)
      .where(
        and(
          eq(autoReviewRejections.projectId, projectId),
          eq(autoReviewRejections.elementId, elementId),
          eq(autoReviewRejections.originalText, originalText)
        )
      );
  }

  /**
   * Count rejections for a document element.
   */
  async countRejections(
    db: DatabaseInstance,
    projectId: string,
    elementId: string
  ): Promise<number> {
    const rows = await db
      .select({ id: autoReviewRejections.id })
      .from(autoReviewRejections)
      .where(
        and(
          eq(autoReviewRejections.projectId, projectId),
          eq(autoReviewRejections.elementId, elementId)
        )
      );
    return rows.length;
  }

  /**
   * Delete all rejections for a document element (reset).
   */
  async deleteAllRejections(
    db: DatabaseInstance,
    projectId: string,
    elementId: string
  ): Promise<void> {
    await db
      .delete(autoReviewRejections)
      .where(
        and(
          eq(autoReviewRejections.projectId, projectId),
          eq(autoReviewRejections.elementId, elementId)
        )
      );
    rejectionLog.info(`Cleared all rejections for element ${elementId}`);
  }
}

export const autoReviewRejectionService = new AutoReviewRejectionService();
