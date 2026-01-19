import { eq, desc, and, gte, lte, like } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import {
  imageGenerationAudits,
  ImageGenerationAudit,
  InsertImageGenerationAudit,
} from '../db/schema/image-generation-audits';
import { users } from '../db/schema/users';
import { logger } from './logger.service';

const auditLog = logger.child('ImageAudit');

/**
 * Input for creating an audit record
 */
export interface CreateAuditInput {
  userId: string;
  profileId: string;
  profileName: string;
  prompt: string;
  referenceImageUrls?: string[];
  outputImageUrls?: string[];
  creditCost: number;
  status: 'success' | 'moderated';
  message?: string;
}

/**
 * Filters for listing audit records
 */
export interface AuditListFilters {
  userId?: string;
  profileId?: string;
  status?: 'success' | 'moderated';
  startDate?: Date;
  endDate?: Date;
  search?: string; // Search in prompt text
  page?: number;
  limit?: number;
}

/**
 * Paginated audit list result
 */
export interface PaginatedAuditResult {
  audits: AuditWithUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Audit record with user information
 */
export interface AuditWithUser extends ImageGenerationAudit {
  username: string | null;
}

/**
 * Service for managing image generation audit records
 */
class ImageAuditService {
  /**
   * Create an audit record
   */
  async create(db: DatabaseInstance, input: CreateAuditInput): Promise<ImageGenerationAudit> {
    const [audit] = await db
      .insert(imageGenerationAudits)
      .values({
        userId: input.userId,
        profileId: input.profileId,
        profileName: input.profileName,
        prompt: input.prompt,
        referenceImageUrls: input.referenceImageUrls || null,
        outputImageUrls: input.outputImageUrls || null,
        creditCost: input.creditCost,
        status: input.status,
        message: input.message || null,
      } satisfies InsertImageGenerationAudit)
      .returning();

    auditLog.info(
      `Audit created: user=${input.userId}, profile=${input.profileName}, status=${input.status}, credits=${input.creditCost}`
    );

    return audit;
  }

  /**
   * List audit records with filtering and pagination (admin only)
   */
  async list(db: DatabaseInstance, filters: AuditListFilters = {}): Promise<PaginatedAuditResult> {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const offset = (page - 1) * limit;

    // Build conditions array
    const conditions = [];

    if (filters.userId) {
      conditions.push(eq(imageGenerationAudits.userId, filters.userId));
    }
    if (filters.profileId) {
      conditions.push(eq(imageGenerationAudits.profileId, filters.profileId));
    }
    if (filters.status) {
      conditions.push(eq(imageGenerationAudits.status, filters.status));
    }
    if (filters.startDate) {
      conditions.push(gte(imageGenerationAudits.createdAt, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(imageGenerationAudits.createdAt, filters.endDate));
    }
    if (filters.search) {
      conditions.push(like(imageGenerationAudits.prompt, `%${filters.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count by fetching all matching IDs
    const allIds = await db.select().from(imageGenerationAudits).where(whereClause);
    const total = allIds.length;

    // Get paginated results with user info
    const auditsWithUsers = await db
      .select()
      .from(imageGenerationAudits)
      .leftJoin(users, eq(imageGenerationAudits.userId, users.id))
      .where(whereClause)
      .orderBy(desc(imageGenerationAudits.createdAt))
      .limit(limit)
      .offset(offset);

    const audits: AuditWithUser[] = auditsWithUsers.map((row) => ({
      ...row.image_generation_audits,
      username: row.users?.username || null,
    }));

    return {
      audits,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single audit record by ID
   */
  async getById(db: DatabaseInstance, id: string): Promise<AuditWithUser | null> {
    const result = await db
      .select()
      .from(imageGenerationAudits)
      .leftJoin(users, eq(imageGenerationAudits.userId, users.id))
      .where(eq(imageGenerationAudits.id, id))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    return {
      ...result[0].image_generation_audits,
      username: result[0].users?.username || null,
    };
  }

  /**
   * Get usage statistics summary
   */
  async getStats(
    db: DatabaseInstance,
    filters: { startDate?: Date; endDate?: Date } = {}
  ): Promise<{
    totalRequests: number;
    totalCredits: number;
    successCount: number;
    moderatedCount: number;
    byProfile: { profileName: string; count: number; credits: number }[];
    byUser: { userId: string; username: string | null; count: number; credits: number }[];
  }> {
    const conditions = [];
    if (filters.startDate) {
      conditions.push(gte(imageGenerationAudits.createdAt, filters.startDate));
    }
    if (filters.endDate) {
      conditions.push(lte(imageGenerationAudits.createdAt, filters.endDate));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get all matching audits
    const audits = await db
      .select()
      .from(imageGenerationAudits)
      .leftJoin(users, eq(imageGenerationAudits.userId, users.id))
      .where(whereClause);

    // Calculate stats
    let totalRequests = 0;
    let totalCredits = 0;
    let successCount = 0;
    let moderatedCount = 0;

    const profileStats = new Map<string, { count: number; credits: number }>();
    const userStats = new Map<
      string,
      { username: string | null; count: number; credits: number }
    >();

    for (const row of audits) {
      const audit = row.image_generation_audits;
      const username = row.users?.username || null;

      totalRequests++;
      totalCredits += audit.creditCost;

      if (audit.status === 'success') {
        successCount++;
      } else {
        moderatedCount++;
      }

      // Profile stats
      const profileName = audit.profileName;
      const existing = profileStats.get(profileName) || { count: 0, credits: 0 };
      existing.count++;
      existing.credits += audit.creditCost;
      profileStats.set(profileName, existing);

      // User stats
      const userId = audit.userId;
      const existingUser = userStats.get(userId) || {
        username,
        count: 0,
        credits: 0,
      };
      existingUser.count++;
      existingUser.credits += audit.creditCost;
      userStats.set(userId, existingUser);
    }

    return {
      totalRequests,
      totalCredits,
      successCount,
      moderatedCount,
      byProfile: Array.from(profileStats.entries())
        .map(([profileName, stats]) => ({
          profileName,
          ...stats,
        }))
        .sort((a, b) => b.credits - a.credits),
      byUser: Array.from(userStats.entries())
        .map(([userId, stats]) => ({
          userId,
          ...stats,
        }))
        .sort((a, b) => b.credits - a.credits),
    };
  }
}

export const imageAuditService = new ImageAuditService();
