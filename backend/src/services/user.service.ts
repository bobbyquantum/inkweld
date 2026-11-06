import bcrypt from 'bcryptjs';
import { chunk, firstResultSequential } from '@inkweld/async';
import { sessionWatermarkNow } from '../utils/session-validity';
import { eq, ne, like, or, asc, and, sql, isNull, inArray, type SQL } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import type { D1DatabaseInstance } from '../db/d1';
import { users, type User, type InsertUser, type ProfileVisibility } from '../db/schema';
import {
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
  fitsUsernameRule,
  isReservedUsername,
  usernameBase,
} from '../schemas/auth.schemas';
import { configService } from './config.service';
import { mcpOAuthService } from './mcp-oauth.service';

const SALT_ROUNDS = 10;

/** Numbered variants tried before a random suffix when a username is taken. */
const MAX_USERNAME_SUFFIX = 100;

/** Candidate usernames checked per query. */
const USERNAME_CANDIDATE_BATCH = 20;

/**
 * Whether `error` is an insert refused because an account already has the
 * username (exactly, or ignoring case: see `UserService.create`).
 */
export function isUsernameConflict(error: unknown): boolean {
  // Drizzle can wrap SQLite and D1 constraint errors in a query error.
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause.message.includes('UNIQUE constraint failed: users.username')) return true;
  }
  return false;
}

/**
 * Why an account may not sign in. `code` lets clients tell a rejected
 * registration from one still awaiting a decision; the messages are the ones
 * the sign-in routes have always returned for disabled and pending accounts.
 */
export interface LoginRefusal {
  error: string;
  code: 'ACCOUNT_DISABLED' | 'ACCOUNT_PENDING' | 'ACCOUNT_REJECTED';
}

export interface PaginatedUsersResult {
  users: User[];
  total: number;
  hasMore: boolean;
}

export interface ListUsersOptions {
  search?: string;
  limit?: number;
  offset?: number;
  /** If true, only return users who are approved AND enabled */
  activeOnly?: boolean;
  /**
   * If true, `search` also matches against email. Off by default: an email
   * predicate lets a caller confirm whether an address is registered, which
   * only admins should be able to do.
   */
  searchEmail?: boolean;
}

/**
 * Thrown by `createOrUpdateGithubUser` when no account is linked to the
 * GitHub identity yet and another account already uses its verified email
 * address. Sign-in stops there: the identity is not attached to that account,
 * and no second account with the same address is created.
 */
export class GithubEmailInUseError extends Error {
  constructor() {
    super('An account with this email address already exists');
    this.name = 'GithubEmailInUseError';
  }
}

class UserService {
  /**
   * Find user by ID
   */
  async findById(db: DatabaseInstance, id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  /**
   * Find user by username
   */
  async findByUsername(db: DatabaseInstance, username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  /**
   * Find user by email
   */
  async findByEmail(db: DatabaseInstance, email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  /**
   * Whether an account other than `exceptUserId` uses this email address.
   * Letter case is ignored, so `Writer@Example.com` and `writer@example.com`
   * count as the same address.
   */
  private async isEmailUsedByAnotherAccount(
    db: DatabaseInstance,
    email: string,
    exceptUserId?: string
  ): Promise<boolean> {
    const sameAddress = sql`lower(${users.email}) = lower(${email})`;
    const result = await db
      .select()
      .from(users)
      .where(exceptUserId ? and(sameAddress, ne(users.id, exceptUserId)) : sameAddress)
      .limit(1);
    return result.length > 0;
  }

  /**
   * Find user by GitHub ID
   */
  async findByGithubId(db: DatabaseInstance, githubId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.githubId, githubId)).limit(1);
    return result[0];
  }

  async findByOidcIdentity(
    db: DatabaseInstance,
    issuer: string,
    subject: string
  ): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(and(eq(users.oidcIssuer, issuer), eq(users.oidcSubject, subject)))
      .limit(1);
    return result[0];
  }

  /** Find the account linked to a Home Assistant user id (ingress sign-in). */
  async findByHomeAssistantUserId(
    db: DatabaseInstance,
    homeAssistantUserId: string
  ): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.homeAssistantUserId, homeAssistantUserId))
      .limit(1);
    return result[0];
  }

  /**
   * Which of `usernames` an account already has, compared ignoring case.
   * Resolves to the matching names in lower case. One query, a search of the
   * `lower(username)` index; callers pass a handful of names (D1 allows 100
   * bound parameters per query).
   */
  async findTakenUsernames(
    db: DatabaseInstance,
    usernames: readonly string[]
  ): Promise<Set<string>> {
    const lowered = [...new Set(usernames.map((name) => name.toLowerCase()))];
    if (lowered.length === 0) return new Set();
    // SQLite's lower() folds ASCII letters only, which covers every name a
    // new account may use. The expression must stay `lower(username)` to
    // match the users_username_lower_idx index.
    const usernameLower = sql<string>`lower(${users.username})`;
    // Cast to one union member before .select(projection): TypeScript cannot
    // call a generic method with arguments on a union of drizzle instances.
    const rows = await (db as D1DatabaseInstance)
      .select({ username: usernameLower })
      .from(users)
      .where(inArray(usernameLower, lowered));
    return new Set(rows.map((row) => row.username));
  }

  /**
   * Whether an account already has this username, ignoring case. A new
   * account may not differ from an existing one only in letter case
   * (`Alice` and `alice`); accounts that already do keep their names.
   */
  async isUsernameTaken(db: DatabaseInstance, username: string): Promise<boolean> {
    return (await this.findTakenUsernames(db, [username])).size > 0;
  }

  /**
   * A username for a new account made from `base`: `base` itself when it is
   * free, otherwise the first free `base-2`, `base-3`, … (each cut to fit
   * {@link USERNAME_MAX_LENGTH}), then a random suffix. A `base` shorter
   * than the minimum starts at `base-2`, and one with characters outside the
   * username rule is first reduced to a lower-case stem. Reserved names are
   * skipped and names are compared ignoring case. A concurrent sign-up can
   * still take the name before the insert, which then fails
   * ({@link isUsernameConflict}).
   */
  async availableUsername(db: DatabaseInstance, base: string): Promise<string> {
    const stem = USERNAME_PATTERN.test(base) ? base : usernameBase(base, 'user');
    const candidates = Array.from({ length: MAX_USERNAME_SUFFIX }, (_, i) => {
      const tail = i === 0 ? '' : `-${i + 1}`;
      return `${stem.slice(0, USERNAME_MAX_LENGTH - tail.length)}${tail}`;
    }).filter((candidate) => fitsUsernameRule(candidate) && !isReservedUsername(candidate));
    // Sequential: the batches are checked in order, so the lowest free suffix
    // wins and later batches are never queried.
    const free = await firstResultSequential(
      chunk(candidates, USERNAME_CANDIDATE_BATCH),
      async (batch) => {
        const taken = await this.findTakenUsernames(db, batch);
        return batch.find((candidate) => !taken.has(candidate.toLowerCase()));
      }
    );
    return free ?? `${stem.slice(0, 20)}-${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * The username for a new GitHub account: the GitHub login, with its case,
   * when it is free (ignoring case), not reserved and at least
   * 3 characters long; otherwise the first free `login-2`, `login-3`, …, as
   * OIDC sign-in picks one (a 2-character login `tj` becomes `tj-2`). GitHub
   * logins use only letters, digits and `-` and are at most 39 characters;
   * anything else is first reduced to a lower-case stem, as OIDC usernames
   * are.
   */
  private githubUsername(db: DatabaseInstance, login: string): Promise<string> {
    const base = USERNAME_PATTERN.test(login) ? login : usernameBase(login, 'github-user');
    return this.availableUsername(db, base);
  }

  /**
   * The value to insert as a new account's username: `username`, or, when an
   * account already has it ignoring case, that account's username, so the
   * insert fails on the unique index just as for an exact duplicate
   * ({@link isUsernameConflict}). The lookup is part of the INSERT statement,
   * so two overlapping sign-ups for `Alice` and `alice` can't both succeed.
   */
  private newUsernameValue(username: string): SQL {
    return sql`coalesce((select ${users.username} from ${users} where lower(${users.username}) = lower(${username}) limit 1), ${username})`;
  }

  /**
   * Create a new user with username/password. Fails with a unique-constraint
   * error ({@link isUsernameConflict}) when an account already has the
   * username, compared ignoring case.
   * @param db Database instance
   * @param data User data
   * @param options Additional options like skipApproval
   */
  async create(
    db: DatabaseInstance,
    data: {
      username: string;
      /** Optional: accounts registered without an email store NULL, not a placeholder. */
      email?: string | null;
      /**
       * Plaintext password to hash. Optional: passwordless registrations
       * (PASSWORD_LOGIN_ENABLED=false) create a user with a NULL password
       * column and rely on a passkey being enrolled in the same flow.
       */
      password?: string;
      name?: string;
      /** Legal-document version accepted at registration, if any. */
      policyAcceptedVersion?: string;
      /** Home Assistant user id for accounts created by ingress sign-in. */
      homeAssistantUserId?: string;
      /** OIDC identity. Both values are set together and never linked by email. */
      oidcIssuer?: string;
      oidcSubject?: string;
    },
    options?: {
      /** Override the default approval behavior. If true, user is auto-approved. */
      autoApprove?: boolean;
    }
  ): Promise<User> {
    const hashedPassword = data.password ? await bcrypt.hash(data.password, SALT_ROUNDS) : null;

    // Use explicit autoApprove option if provided, otherwise check database config
    // configService reads from database first, then environment, then defaults
    const userApprovalRequired = await configService.getBoolean(db, 'USER_APPROVAL_REQUIRED');
    const shouldAutoApprove = options?.autoApprove ?? !userApprovalRequired;

    const id = crypto.randomUUID();
    const newUser: InsertUser = {
      id,
      username: data.username,
      email: data.email || null,
      password: hashedPassword,
      name: data.name || null,
      oidcIssuer: data.oidcIssuer ?? null,
      oidcSubject: data.oidcSubject ?? null,
      enabled: true,
      approved: shouldAutoApprove,
      homeAssistantUserId: data.homeAssistantUserId ?? null,
      ...(data.policyAcceptedVersion && {
        policyAcceptedVersion: data.policyAcceptedVersion,
        policyAcceptedAt: Math.floor(Date.now() / 1000),
      }),
    };

    await db.insert(users).values({ ...newUser, username: this.newUsernameValue(data.username) });

    // Return the created user
    const created = await this.findById(db, id);
    if (created === undefined) {
      throw new Error('Failed to create user');
    }
    return created;
  }

  /**
   * Resolve an OIDC account by the verified issuer/subject pair, creating it
   * on first sign-in. Email is profile data only and is never used to link
   * an OIDC identity to another account.
   */
  async createOrUpdateOidcUser(
    db: DatabaseInstance,
    data: {
      issuer: string;
      subject: string;
      username: string;
      email?: string;
      emailVerified: boolean;
      name: string;
    },
    options?: { autoApprove?: boolean }
  ): Promise<User> {
    const existing = await this.findByOidcIdentity(db, data.issuer, data.subject);
    const email = data.emailVerified ? data.email : undefined;
    if (existing) {
      await db
        .update(users)
        .set({
          email: email || existing.email,
          name: data.name || existing.name,
        })
        .where(eq(users.id, existing.id));
      const updated = await this.findById(db, existing.id);
      if (!updated) throw new Error('Failed to update OIDC user');
      return updated;
    }

    return this.create(
      db,
      {
        username: data.username,
        email,
        name: data.name,
        oidcIssuer: data.issuer,
        oidcSubject: data.subject,
      },
      options
    );
  }

  /**
   * Resolve the account for a GitHub sign-in. Accounts are matched by GitHub
   * id only, never by email. The account linked to this id has its name
   * refreshed, and its email when GitHub's verified address is not used by
   * another account. A new identity gets a new account. If another account
   * already uses the new identity's verified email address (letter case
   * aside), this throws {@link GithubEmailInUseError} instead of linking to
   * that account or creating a second one with the same address.
   */
  async createOrUpdateGithubUser(
    db: DatabaseInstance,
    data: {
      githubId: string;
      username: string;
      email: string;
      name: string;
      /**
       * Whether GitHub reports `email` as verified. An unverified address is
       * neither stored nor compared with the addresses of other accounts.
       * Defaults to false, so a caller that leaves the flag out stores no
       * address.
       */
      emailVerified?: boolean;
    }
  ): Promise<User> {
    const email = data.emailVerified ? data.email : '';

    // 1. Look up by GitHub ID (exact match — user has logged in with GitHub before)
    const existingByGithubId = await this.findByGithubId(db, data.githubId);

    if (existingByGithubId) {
      // Update the linked account. Its email only changes to a verified
      // address that no other account uses; otherwise the stored one stays.
      const emailIsFree =
        email !== '' && !(await this.isEmailUsedByAnotherAccount(db, email, existingByGithubId.id));
      await db
        .update(users)
        .set({
          email: emailIsFree ? email : existingByGithubId.email,
          name: data.name,
        })
        .where(eq(users.id, existingByGithubId.id));

      const updated = await this.findById(db, existingByGithubId.id);
      if (!updated) {
        throw new Error('Failed to update user');
      }
      return updated;
    }

    // 2. An existing account is never linked by email. If one already uses
    //    this verified address, stop instead of creating a second account
    //    with it.
    if (email !== '' && (await this.isEmailUsedByAnotherAccount(db, email))) {
      throw new GithubEmailInUseError();
    }

    // 3. Create new user
    const id = crypto.randomUUID();
    const username = await this.githubUsername(db, data.username);
    const newUser: InsertUser = {
      id,
      githubId: data.githubId,
      username,
      email,
      name: data.name,
      enabled: true,
      approved: false,
    };

    await db.insert(users).values({ ...newUser, username: this.newUsernameValue(username) });

    const created = await this.findById(db, id);
    if (created === undefined) {
      throw new Error('Failed to create user');
    }
    return created;
  }

  /**
   * Validate user password
   */
  validatePassword(user: User, password: string): Promise<boolean> {
    if (!user.password) {
      return Promise.resolve(false);
    }
    return bcrypt.compare(password, user.password);
  }

  /**
   * Update user password
   */
  async updatePassword(db: DatabaseInstance, userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    // A password change (self-service or via reset link) must end every
    // session that predates it — that is the whole point of resetting after
    // a suspected compromise.
    await db
      .update(users)
      .set({ password: hashedPassword, sessionsValidFrom: sessionWatermarkNow() })
      .where(eq(users.id, userId));
    await mcpOAuthService.revokeUserSessions(db, userId, 'Password changed');
  }

  /**
   * Revoke every session token issued before now for this user. Existing
   * JWTs keep verifying cryptographically, but getUserFromSession and both
   * WebSocket auth paths reject them via users.sessionsValidFrom.
   */
  async invalidateSessions(db: DatabaseInstance, userId: string): Promise<void> {
    await db
      .update(users)
      .set({ sessionsValidFrom: sessionWatermarkNow() })
      .where(eq(users.id, userId));
    await mcpOAuthService.revokeUserSessions(db, userId, 'Sessions invalidated');
  }

  /**
   * Approve user (admin only)
   */
  async approveUser(db: DatabaseInstance, userId: string): Promise<void> {
    await db.update(users).set({ approved: true, rejectedAt: null }).where(eq(users.id, userId));
  }

  /**
   * Reject/unapprove user (admin only). The account is kept (Delete removes
   * it) but marked rejected, so it leaves the pending list and its owner is
   * told the registration was not approved instead of being kept waiting.
   */
  async rejectUser(db: DatabaseInstance, userId: string): Promise<void> {
    const now = sessionWatermarkNow();
    await db
      .update(users)
      .set({ approved: false, rejectedAt: now, sessionsValidFrom: now })
      .where(eq(users.id, userId));
    await mcpOAuthService.revokeUserSessions(db, userId, 'Account rejected');
  }

  /**
   * Enable/disable user (admin only)
   */
  async setUserEnabled(db: DatabaseInstance, userId: string, enabled: boolean): Promise<void> {
    // Disabling also cuts existing sessions; re-enabling requires a fresh login.
    await db
      .update(users)
      .set(enabled ? { enabled } : { enabled, sessionsValidFrom: sessionWatermarkNow() })
      .where(eq(users.id, userId));
    if (!enabled) await mcpOAuthService.revokeUserSessions(db, userId, 'Account disabled');
  }

  /**
   * Set user admin status (admin only)
   */
  async setUserAdmin(db: DatabaseInstance, userId: string, isAdmin: boolean): Promise<void> {
    await db.update(users).set({ isAdmin }).where(eq(users.id, userId));
  }

  /**
   * Elect one admin only when the instance has none. The conditional update is
   * atomic, so concurrent first OIDC sign-ins cannot leave the instance without
   * an administrator or promote multiple accounts.
   */
  async setUserAdminIfNoneExists(db: DatabaseInstance, userId: string): Promise<void> {
    await db
      .update(users)
      .set({ isAdmin: true })
      .where(
        and(
          eq(users.id, userId),
          eq(users.enabled, true),
          eq(users.approved, true),
          isNull(users.rejectedAt),
          sql`NOT EXISTS (SELECT 1 FROM ${users} WHERE ${users.isAdmin} = 1
            AND ${users.enabled} = 1 AND ${users.approved} = 1 AND ${users.rejectedAt} IS NULL)`
        )
      );
  }

  /** Record that the user accepted the given legal-document version now. */
  async recordPolicyAcceptance(db: DatabaseInstance, userId: string, version: string) {
    const acceptedAt = Math.floor(Date.now() / 1000);
    await db
      .update(users)
      .set({ policyAcceptedVersion: version, policyAcceptedAt: acceptedAt })
      .where(eq(users.id, userId));
    return { acceptedVersion: version, acceptedAt };
  }

  /**
   * Set a user's sync-capacity override in bytes (admin only).
   *
   * `null` clears the override so the instance default applies. `0` is an
   * explicit zero allowance and is stored as `0`, not `null` — the two mean
   * different things and the column relies on that distinction.
   */
  async setUserSyncQuota(
    db: DatabaseInstance,
    userId: string,
    syncQuotaBytes: number | null
  ): Promise<void> {
    await db.update(users).set({ syncQuotaBytes }).where(eq(users.id, userId));
  }

  /**
   * Update user profile (name and/or email)
   */
  async updateProfile(
    db: DatabaseInstance,
    userId: string,
    data: {
      name?: string;
      email?: string;
      bio?: string;
      profileVisibility?: ProfileVisibility;
      activityVisibility?: ProfileVisibility;
      projectsVisibility?: ProfileVisibility;
    }
  ): Promise<User> {
    const updates: Partial<{
      name: string | null;
      email: string;
      bio: string | null;
      profileVisibility: ProfileVisibility;
      activityVisibility: ProfileVisibility;
      projectsVisibility: ProfileVisibility;
    }> = {};
    if (data.name !== undefined) {
      updates.name = data.name || null;
    }
    if (data.email !== undefined) {
      updates.email = data.email;
    }
    if (data.bio !== undefined) {
      updates.bio = data.bio.trim() || null;
    }
    if (data.profileVisibility !== undefined) {
      updates.profileVisibility = data.profileVisibility;
    }
    if (data.activityVisibility !== undefined) {
      updates.activityVisibility = data.activityVisibility;
    }
    if (data.projectsVisibility !== undefined) {
      updates.projectsVisibility = data.projectsVisibility;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, userId));
    }

    const updated = await this.findById(db, userId);
    if (!updated) {
      throw new Error('User not found after update');
    }
    return updated;
  }

  /**
   * Set user hasAvatar flag
   */
  async setHasAvatar(db: DatabaseInstance, userId: string, hasAvatar: boolean): Promise<void> {
    await db.update(users).set({ hasAvatar }).where(eq(users.id, userId));
  }

  /**
   * Set user hasBackground flag (mirrors setHasAvatar)
   */
  async setHasBackground(
    db: DatabaseInstance,
    userId: string,
    hasBackground: boolean
  ): Promise<void> {
    await db.update(users).set({ hasBackground }).where(eq(users.id, userId));
  }

  /**
   * Set user hasBanner flag (mirrors setHasAvatar)
   */
  async setHasBanner(db: DatabaseInstance, userId: string, hasBanner: boolean): Promise<void> {
    await db.update(users).set({ hasBanner }).where(eq(users.id, userId));
  }

  /**
   * Delete the user row. Callers should go through accountDeletionService,
   * which removes project content stored outside the database first.
   */
  async deleteUser(db: DatabaseInstance, userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  /**
   * List users with pagination and search
   * If activeOnly is true, only returns approved+enabled users (for non-admins)
   */
  async listAll(db: DatabaseInstance, options?: ListUsersOptions): Promise<PaginatedUsersResult> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const search = options?.search?.trim().toLowerCase();
    const activeOnly = options?.activeOnly ?? false;
    const searchEmail = options?.searchEmail ?? false;

    // Build base conditions
    const conditions: ReturnType<typeof eq>[] = [];

    // If activeOnly, filter to only approved and enabled users
    if (activeOnly) {
      conditions.push(eq(users.approved, true), eq(users.enabled, true));
    }

    // Build query with optional search
    let query = db.select().from(users).$dynamic();

    // Build where clause
    let whereClause: ReturnType<typeof and> | ReturnType<typeof or> | undefined;

    if (search) {
      const searchPattern = `%${search}%`;
      const searchCondition = searchEmail
        ? or(like(users.username, searchPattern), like(users.email, searchPattern))
        : like(users.username, searchPattern);

      if (conditions.length > 0) {
        // Combine activeOnly conditions with search
        const activeCondition = and(...conditions);
        whereClause = and(activeCondition, searchCondition);
      } else {
        whereClause = searchCondition;
      }
    } else if (conditions.length > 0) {
      whereClause = and(...conditions);
    }

    if (whereClause) {
      query = query.where(whereClause);
    }

    // Get paginated results
    const result = await query.orderBy(asc(users.username)).limit(limit).offset(offset);

    // Get total count with same filters using Drizzle's $count method
    const total = await db.$count(users, whereClause);

    return {
      users: result,
      total,
      hasMore: offset + result.length < total,
    };
  }

  /**
   * List pending users awaiting approval (admin only). Rejected accounts are
   * also unapproved but are not waiting for a decision, so they are left out.
   */
  listPending(db: DatabaseInstance): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(and(eq(users.approved, false), isNull(users.rejectedAt)))
      .orderBy(users.username);
  }

  /**
   * Count total users in the database
   * Used to determine if this is the first user (for first-user-is-admin feature)
   */
  countUsers(db: DatabaseInstance): Promise<number> {
    return db.$count(users);
  }

  /**
   * First step of deleting an account: give up admin rights, unless that
   * would leave the instance without an active administrator. Returns false
   * (and changes nothing) when the account is the last enabled, approved
   * admin; a non-admin always succeeds and is left unchanged.
   *
   * One conditional UPDATE, so the check and the write are atomic: SQLite
   * and D1 serialise writes, and two admins deleting themselves at once
   * cannot both see the other as the remaining admin. The account stays
   * enabled, because the owner's own token must still be accepted while its
   * project Durable Objects are wiped.
   */
  reserveForDeletion(db: DatabaseInstance, userId: string): Promise<boolean> {
    return this.revokeAdminUnlessLast(db, userId);
  }

  /**
   * Drop a user's admin flag unless they are the last enabled, approved
   * admin. Returns false (and changes nothing) in that case; a non-admin
   * always succeeds and is left unchanged. See {@link reserveForDeletion}.
   */
  async revokeAdminUnlessLast(db: DatabaseInstance, userId: string): Promise<boolean> {
    const otherActiveAdmins = sql`(
      select count(*) from ${users} as other
      where other."isAdmin" = 1 and other."enabled" = 1 and other."approved" = 1
        and other."id" <> ${userId}
    )`;
    const reserved = await db
      .update(users)
      .set({ isAdmin: false })
      .where(and(eq(users.id, userId), or(eq(users.isAdmin, false), sql`${otherActiveAdmins} > 0`)))
      .returning();
    return reserved.length > 0;
  }

  /** Undo {@link reserveForDeletion} when the deletion could not finish. */
  async releaseDeletionReservation(
    db: DatabaseInstance,
    userId: string,
    wasAdmin: boolean
  ): Promise<void> {
    await db.update(users).set({ isAdmin: wasAdmin }).where(eq(users.id, userId));
  }

  /**
   * Check if user is approved and enabled
   */
  canLogin(user: User): boolean {
    return user.enabled && user.approved;
  }

  /** Why {@link canLogin} refuses this user, or null when it does not. */
  loginRefusal(user: User): LoginRefusal | null {
    if (!user.enabled) return { error: 'Account is disabled', code: 'ACCOUNT_DISABLED' };
    if (user.approved) return null;
    if (user.rejectedAt !== null) {
      return { error: 'Account registration was not approved', code: 'ACCOUNT_REJECTED' };
    }
    return { error: 'Account pending approval', code: 'ACCOUNT_PENDING' };
  }
}

export const userService = new UserService();
