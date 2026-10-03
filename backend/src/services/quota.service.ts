/**
 * Per-user sync-capacity (storage quota) accounting.
 *
 * Two figures matter:
 *   - **authoritative usage** — the sum of real per-project storage sizes
 *     (`getProjectStorageSize`) across a user's projects. Accurate, but
 *     expensive: each project walks its storage directory (Bun) or pages a
 *     Durable Object (Workers).
 *   - **fast-path usage** — `users.storageUsedBytes`, incremented cheaply on
 *     the write path so a hot request does not trigger a full recompute.
 *
 * The fast-path counter drifts (failed uploads, deletions, direct DB edits),
 * so {@link QuotaService.reconcile} recomputes the authoritative figure and
 * writes it back. Enforcement reads whichever is available cheaply and treats
 * the reconciled value as truth; the counter exists to avoid recomputing on
 * every request, not to replace the recompute.
 *
 * Enforcement is opt-in per instance (`SYNC_QUOTA_ENABLED`, default off) so an
 * upgrade never starts refusing uploads on a self-hosted server. While it is
 * off, usage is still measured and reported, but {@link QuotaService.assertCanStore}
 * never refuses.
 */

import { eq, sql } from 'drizzle-orm';
import type { R2Bucket } from '@cloudflare/workers-types';
import type { DatabaseInstance } from '../types/context';
import { users } from '../db/schema/users';
import { configService } from './config.service';
import { projectService } from './project.service';
import { getProjectStorageSize, type CloudflareSizeEnv } from './storage-size.service';
import { mapWithConcurrency } from '../utils/concurrency';
import {
  DEFAULT_SYNC_QUOTA_BYTES,
  parseSyncQuotaBytes,
  resolveSyncQuotaBytes,
} from '../utils/sync-quota';
import { logger } from './logger.service';
import { QuotaExceededError, type QuotaExceededReason } from '../errors';

const quotaLog = logger.child('Quota');

/**
 * Fraction of the allowance at which a user is warned (but not blocked).
 * Enforcement only happens at 100%; this drives the UI warning state.
 */
export const SOFT_QUOTA_FRACTION = 0.8;

/** Bound on simultaneous per-project size calculations. */
const SIZE_CONCURRENCY = 5;

/**
 * How long a reconciled counter is trusted before a refusal pays for another
 * authoritative recompute. Without this, a client retrying a refused upload
 * (media auto-sync runs every minute) would walk every project's storage — or
 * page every Durable Object — on each attempt. Deletions update the counter
 * directly, so a user who frees space is not held to the stale figure.
 */
export const RECONCILE_COOLDOWN_MS = 60_000;

/**
 * How long a reconciled counter may drive the *accepting* fast path. The
 * counter only tracks writes the server sees (uploads, deletions); Yjs
 * document growth never reaches it, so a counter that is never re-measured
 * drifts low and would let an account keep uploading past its real allowance.
 * Past this age the next gated write pays for a recompute first.
 */
export const RECONCILE_MAX_AGE_MS = 10 * 60_000;

/** Storage bindings needed to compute authoritative usage on both runtimes. */
export type QuotaStorageEnv = Partial<CloudflareSizeEnv>;

/** Authoritative usage plus the allowance it is measured against. */
export interface QuotaUsage {
  usedBytes: number;
  quotaBytes: number;
  /** `usedBytes / quotaBytes`; `Infinity` when the allowance is zero. */
  fraction: number;
  /** True once usage is at or above the allowance (hard limit). */
  overQuota: boolean;
  /** True once usage is at or above {@link SOFT_QUOTA_FRACTION} (warning zone). */
  overSoftLimit: boolean;
}

/** Per-project breakdown, for admin/self-service displays. */
export interface ProjectUsage {
  id: string;
  slug: string;
  title: string;
  dataBytes: number;
  mediaBytes: number;
  totalBytes: number;
}

/** Storage context needed to reconcile on the write path. */
export interface QuotaStorageContext {
  r2?: R2Bucket;
  env?: QuotaStorageEnv;
  authToken?: string;
}

type EnforcementUser = {
  id: string;
  username?: string | null;
  storageUsedBytes?: number | null;
  syncQuotaBytes?: number | null;
};

class QuotaService {
  /** userId → time of the last authoritative reconcile (per isolate/process). */
  private readonly lastReconciledAt = new Map<string, number>();

  /** Whether the instance refuses writes past the allowance. */
  async isEnabled(db: DatabaseInstance): Promise<boolean> {
    return configService.getBoolean(db, 'SYNC_QUOTA_ENABLED');
  }

  /**
   * The allowance that applies to a user: their override when set, otherwise
   * the instance-wide `SYNC_QUOTA_DEFAULT_BYTES` config (100 MB fallback).
   */
  async getEffectiveQuota(
    db: DatabaseInstance,
    user: { syncQuotaBytes?: number | null }
  ): Promise<number> {
    const instanceDefault = await configService.get(db, 'SYNC_QUOTA_DEFAULT_BYTES');
    return resolveSyncQuotaBytes(user.syncQuotaBytes, instanceDefault.value);
  }

  /**
   * Read the instance-wide default without needing a user row. Used by admin
   * surfaces that display the default before anyone has an override.
   */
  async getInstanceDefaultQuota(db: DatabaseInstance): Promise<number> {
    const configured = await configService.get(db, 'SYNC_QUOTA_DEFAULT_BYTES');
    return parseSyncQuotaBytes(configured.value) ?? DEFAULT_SYNC_QUOTA_BYTES;
  }

  /**
   * Recompute a user's usage from real per-project sizes. This is the
   * authoritative figure; it makes no writes.
   *
   * `projectService.findByUserId` is used (rather than a raw userId filter) so
   * the per-project `username` needed by the storage layer comes along.
   */
  async computeUsage(
    db: DatabaseInstance,
    user: { id: string; username?: string | null },
    r2?: R2Bucket,
    env?: QuotaStorageEnv,
    authToken = ''
  ): Promise<{ usedBytes: number; projects: ProjectUsage[] }> {
    const projects = await projectService.findByUserId(db, user.id);
    const username = user.username ?? '';

    const sized = await mapWithConcurrency(projects, SIZE_CONCURRENCY, async (p) => {
      const size = await getProjectStorageSize(username, p.slug, r2, env, authToken);
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        dataBytes: size.dataBytes,
        mediaBytes: size.mediaBytes,
        totalBytes: size.dataBytes + size.mediaBytes,
      };
    });

    const usedBytes = sized.reduce((sum, p) => sum + p.totalBytes, 0);
    return { usedBytes, projects: sized };
  }

  /**
   * Authoritative usage measured against the user's allowance.
   *
   * Callers that already have a `User` row should pass it in; otherwise the
   * row is loaded (and a missing user yields a zero-allowance result rather
   * than throwing).
   */
  async getUsage(
    db: DatabaseInstance,
    user: { id: string; username?: string | null; syncQuotaBytes?: number | null },
    r2?: R2Bucket,
    env?: QuotaStorageEnv,
    authToken = ''
  ): Promise<{ usage: QuotaUsage; projects: ProjectUsage[] }> {
    const [{ usedBytes, projects }, quotaBytes] = await Promise.all([
      this.computeUsage(db, user, r2, env, authToken),
      this.getEffectiveQuota(db, user),
    ]);

    return {
      usage: this.toQuotaUsage(usedBytes, quotaBytes),
      projects,
    };
  }

  /**
   * Recompute authoritative usage and persist it to `users.storageUsedBytes`.
   * Returns the fresh value so a caller can act on it immediately.
   *
   * Deliberately best-effort when persisting: a failed counter write must not
   * fail the request that triggered the reconcile, since the authoritative
   * recompute is the real product and the counter is an optimisation.
   */
  async reconcile(
    db: DatabaseInstance,
    user: { id: string; username?: string | null },
    r2?: R2Bucket,
    env?: QuotaStorageEnv,
    authToken = ''
  ): Promise<number> {
    const { usedBytes } = await this.computeUsage(db, user, r2, env, authToken);
    await this.persistUsage(db, user.id, usedBytes);
    return usedBytes;
  }

  /**
   * Store an authoritative figure (from {@link reconcile} or a caller that
   * already ran {@link computeUsage}) and start the refusal cooldown.
   */
  async persistUsage(db: DatabaseInstance, userId: string, usedBytes: number): Promise<void> {
    this.lastReconciledAt.set(userId, Date.now());
    try {
      await db.update(users).set({ storageUsedBytes: usedBytes }).where(eq(users.id, userId));
    } catch (error) {
      quotaLog.warn(`Failed to persist reconciled usage for user ${userId}`, { error });
    }
  }

  /** Forget the cooldown (tests, and after an admin changes an allowance). */
  clearReconcileCooldown(userId?: string): void {
    if (userId === undefined) this.lastReconciledAt.clear();
    else this.lastReconciledAt.delete(userId);
  }

  /**
   * Adjust the cached usage counter by a delta without a full recompute.
   *
   * Uses a SQL expression (`storageUsedBytes + delta`) rather than a
   * read-modify-write so concurrent uploads cannot lose an increment. Clamped
   * at zero so a deletion of more than the recorded usage cannot drive the
   * counter negative (which would overstate remaining capacity). Never throws:
   * the counter is an optimisation and a failure must not fail the write.
   */
  async adjustUsage(db: DatabaseInstance, userId: string, deltaBytes: number): Promise<void> {
    if (!Number.isFinite(deltaBytes) || deltaBytes === 0) return;
    try {
      await db
        .update(users)
        .set({
          storageUsedBytes: sql`MAX(0, ${users.storageUsedBytes} + ${Math.trunc(deltaBytes)})`,
        })
        .where(eq(users.id, userId));
    } catch (error) {
      quotaLog.warn(`Failed to adjust usage counter for user ${userId}`, { error });
    }
  }

  /** Record an upload's contribution to the cached counter. */
  async recordUpload(db: DatabaseInstance, userId: string, bytes: number): Promise<void> {
    await this.adjustUsage(db, userId, Math.abs(bytes));
  }

  /** Record freed space (media/project deletion) in the cached counter. */
  async recordDeletion(db: DatabaseInstance, userId: string, bytes: number): Promise<void> {
    await this.adjustUsage(db, userId, -Math.abs(bytes));
  }

  /**
   * Cheap check used on the write path: would adding `additionalBytes` exceed
   * the user's allowance?
   *
   * Reads the cached counter plus the allowance. Callers that must be exact
   * should {@link reconcile} first — this is intentionally the fast path.
   */
  async wouldExceedQuota(
    db: DatabaseInstance,
    user: { id: string; storageUsedBytes?: number | null; syncQuotaBytes?: number | null },
    additionalBytes: number
  ): Promise<boolean> {
    const quotaBytes = await this.getEffectiveQuota(db, user);
    const used = Math.max(0, user.storageUsedBytes ?? 0);
    return used + Math.max(0, additionalBytes) > quotaBytes;
  }

  /** Shape raw figures into the shared usage view. */
  toQuotaUsage(usedBytes: number, quotaBytes: number): QuotaUsage {
    const safeUsed = Math.max(0, usedBytes);
    const safeQuota = Math.max(0, quotaBytes);
    const overQuota = safeUsed >= safeQuota;
    return {
      usedBytes: safeUsed,
      quotaBytes: safeQuota,
      fraction: safeQuota === 0 ? Infinity : safeUsed / safeQuota,
      overQuota,
      overSoftLimit: safeQuota === 0 ? true : safeUsed >= safeQuota * SOFT_QUOTA_FRACTION,
    };
  }

  /**
   * Decide whether a write of `additionalBytes` must be refused, reconciling
   * first when the cheap counter suggests it would cross the line.
   *
   * The cached counter can drift high (a deletion never counted) or low (Yjs
   * document growth is never counted). So the counter only decides on its own
   * while it is fresh: it may accept a write for {@link RECONCILE_MAX_AGE_MS}
   * after a recompute, and refuse one for {@link RECONCILE_COOLDOWN_MS}.
   * Otherwise the authoritative usage is recomputed first. A burst of uploads
   * pays for one recompute, not one each.
   */
  async checkEnforcement(
    db: DatabaseInstance,
    user: {
      id: string;
      username?: string | null;
      storageUsedBytes?: number | null;
      syncQuotaBytes?: number | null;
    },
    additionalBytes: number,
    r2?: R2Bucket,
    env?: QuotaStorageEnv,
    authToken = ''
  ): Promise<QuotaUsage> {
    const quotaBytes = await this.getEffectiveQuota(db, user);
    const cached = Math.max(0, user.storageUsedBytes ?? 0);
    const needed = Math.max(0, additionalBytes);

    const reconciledAt = this.lastReconciledAt.get(user.id);
    const age = reconciledAt === undefined ? Infinity : Date.now() - reconciledAt;

    // Fast path: a recently measured counter that says the write fits.
    if (age < RECONCILE_MAX_AGE_MS && cached + needed <= quotaBytes) {
      return this.toQuotaUsage(cached, quotaBytes);
    }

    // The counter was reconciled moments ago (and deletions since then were
    // recorded on it), so it is as good as a recompute — trust it to refuse.
    if (age < RECONCILE_COOLDOWN_MS) {
      return this.toQuotaUsage(cached, quotaBytes);
    }

    // Stale, or the counter says "over": measure reality before deciding.
    const authoritative = await this.reconcile(db, user, r2, env, authToken);
    return this.toQuotaUsage(authoritative, quotaBytes);
  }

  /**
   * Gate a write that adds `bytes` to the account that owns it: refuse with a
   * {@link QuotaExceededError} when it would not fit, otherwise count it.
   *
   * Every route that grows a project's stored footprint (media upload, cover
   * image, published file, MCP-generated image) goes through here, so the
   * refusal body and the accounting stay identical. A no-op when enforcement
   * is disabled or the owner row is missing.
   *
   * `replacedBytes` is the size of a file this write overwrites, so replacing
   * an image with one of the same size is not counted twice.
   */
  async assertCanStore(
    db: DatabaseInstance,
    ownerId: string,
    bytes: number,
    reason: Exclude<QuotaExceededReason, 'project_create'>,
    storage: QuotaStorageContext = {},
    replacedBytes = 0
  ): Promise<void> {
    if (!(await this.isEnabled(db))) return;
    const owner = await this.loadOwner(db, ownerId);
    if (!owner) return;

    const growth = Math.max(0, bytes - Math.max(0, replacedBytes));
    const usage = await this.checkEnforcement(
      db,
      owner,
      growth,
      storage.r2,
      storage.env,
      storage.authToken ?? ''
    );
    if (usage.usedBytes + growth > usage.quotaBytes) {
      throw new QuotaExceededError({
        usedBytes: usage.usedBytes,
        quotaBytes: usage.quotaBytes,
        requiredBytes: growth,
        reason,
        message: 'This would exceed the account’s sync capacity.',
      });
    }
    // Count the accepted write optimistically; reconcile corrects any drift.
    await this.adjustUsage(db, ownerId, growth);
  }

  /**
   * Gate creating a new project: refused once the owner is at or over their
   * allowance. A no-op when enforcement is disabled.
   */
  async assertCanCreateProject(
    db: DatabaseInstance,
    owner: EnforcementUser,
    storage: QuotaStorageContext = {}
  ): Promise<void> {
    if (!(await this.isEnabled(db))) return;
    const usage = await this.checkEnforcement(
      db,
      owner,
      0,
      storage.r2,
      storage.env,
      storage.authToken ?? ''
    );
    if (usage.overQuota) {
      throw new QuotaExceededError({
        usedBytes: usage.usedBytes,
        quotaBytes: usage.quotaBytes,
        reason: 'project_create',
        message: 'This account has reached its sync capacity and cannot create more projects.',
      });
    }
  }

  private async loadOwner(db: DatabaseInstance, ownerId: string): Promise<EnforcementUser | null> {
    const [row] = await db.select().from(users).where(eq(users.id, ownerId)).limit(1);
    return row ?? null;
  }
}

export const quotaService = new QuotaService();
