/**
 * Sign-in for requests arriving through Home Assistant ingress.
 *
 * Home Assistant has already authenticated the person, so an ingress request
 * carrying `X-Remote-User-*` headers (see utils/ingress.ts for when those are
 * trusted) is mapped to an Inkweld account and given an ordinary session JWT.
 *
 * - Accounts are linked by the HA user id, which survives HA username
 *   changes. The first visit creates the account: approved (HA decided who is
 *   in the household), with no password or passkey.
 * - Admin rights follow `INGRESS_ADMINS`, a list of HA usernames set in the
 *   app's options. Only HA admins can edit those options, so the list comes
 *   from a trusted place without asking the Supervisor for more API access.
 *   It is applied on every sign-in, both ways, but never removes the last
 *   active admin.
 * - With no list configured, the first account on the instance becomes admin,
 *   as with ordinary registration.
 */
import { firstResultSequential } from '@inkweld/async';
import type { User } from '../db/schema';
import type { DatabaseInstance } from '../types/context';
import { RESERVED_USERNAMES } from '../schemas/auth.schemas';
import { ingressAdmins, type IngressUser } from '../utils/ingress';
import { logger } from './logger.service';
import { userService } from './user.service';

const FALLBACK_USERNAME = 'ha-user';
const MAX_USERNAME_ATTEMPTS = 100;

export type IngressSignInResult =
  { ok: true; user: User } | { ok: false; status: 403; error: string };

/**
 * Turn an HA login name into an Inkweld username: lower-case letters, digits,
 * `-` and `_`, at least three characters, and not a reserved route.
 */
export function baseUsernameFor(haUser: IngressUser): string {
  const source = haUser.username ?? haUser.displayName ?? '';
  const cleaned = source
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, '-')
    .replaceAll(/-{2,}/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 32);
  if (cleaned.length < 3) return FALLBACK_USERNAME;
  const reserved = (RESERVED_USERNAMES as readonly string[]).includes(cleaned);
  return reserved ? `${cleaned}-ha` : cleaned;
}

class IngressAuthService {
  async signIn(db: DatabaseInstance, haUser: IngressUser): Promise<IngressSignInResult> {
    let user = await userService.findByHomeAssistantUserId(db, haUser.id);
    let created = false;
    if (!user) {
      user = await this.createAccount(db, haUser);
      created = true;
    }

    user = await this.applyAdminPolicy(db, user, haUser, created);

    if (!user.enabled) {
      return { ok: false, status: 403, error: 'Account is disabled' };
    }
    if (!user.approved) {
      return { ok: false, status: 403, error: 'Account pending approval' };
    }
    return { ok: true, user };
  }

  private async createAccount(db: DatabaseInstance, haUser: IngressUser): Promise<User> {
    const username = await this.availableUsername(db, baseUsernameFor(haUser));
    try {
      const user = await userService.create(
        db,
        {
          username,
          name: haUser.displayName ?? haUser.username ?? username,
          homeAssistantUserId: haUser.id,
        },
        { autoApprove: true }
      );
      logger.info('IngressAuth', `Created account "${username}" for a Home Assistant user`);
      return user;
    } catch (error) {
      // Two first requests for the same HA user (e.g. two tabs) race on the
      // unique HA id; the loser picks up the winner's account.
      const existing = await userService.findByHomeAssistantUserId(db, haUser.id);
      if (existing) return existing;
      throw error;
    }
  }

  private async availableUsername(db: DatabaseInstance, base: string): Promise<string> {
    const candidates = Array.from({ length: MAX_USERNAME_ATTEMPTS }, (_, i) =>
      i === 0 ? base : `${base}-${i + 1}`
    );
    // Sequential so the lowest free suffix wins and probing stops there.
    const free = await firstResultSequential(candidates, async (candidate) =>
      (await userService.findByUsername(db, candidate)) ? undefined : candidate
    );
    return free ?? `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }

  private async applyAdminPolicy(
    db: DatabaseInstance,
    user: User,
    haUser: IngressUser,
    created: boolean
  ): Promise<User> {
    const admins = ingressAdmins();
    let changed = false;

    if (admins.length === 0) {
      // No list: the first account on the instance bootstraps as admin.
      if (created && !user.isAdmin && (await userService.countUsers(db)) === 1) {
        await userService.setUserAdmin(db, user.id, true);
        changed = true;
      }
    } else {
      const listed = !!haUser.username && admins.includes(haUser.username.toLowerCase());
      if (listed && !user.isAdmin) {
        await userService.setUserAdmin(db, user.id, true);
        changed = true;
      } else if (!listed && user.isAdmin) {
        changed = await userService.revokeAdminUnlessLast(db, user.id);
        if (!changed) {
          logger.warn(
            'IngressAuth',
            `Kept admin rights for "${user.username}": they are the last active admin`
          );
        }
      }
    }

    if (!changed) return user;
    return (await userService.findById(db, user.id)) ?? user;
  }
}

export const ingressAuthService = new IngressAuthService();
