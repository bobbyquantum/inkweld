/**
 * Profile visibility rules.
 *
 * A profile has one overall level plus one level per section. The effective
 * level of a section is the *stricter* of the two, so section settings can
 * only narrow what the profile level already allows.
 *
 *   public  -> anyone, including anonymous visitors
 *   members -> any signed-in (approved + enabled) user
 *   private -> only the owner, plus admins for moderation
 *
 * Kept free of Hono/DB concerns so the matrix is trivially unit-testable.
 */
import {
  PROFILE_VISIBILITY_LEVELS,
  type ProfileVisibility,
  type User as DbUser,
} from '../db/schema/users';

/** Minimal viewer shape — `null`/`undefined` means anonymous. */
export interface ProfileViewer {
  id: string;
  isAdmin?: boolean;
}

/** Order matters: index = strictness. */
const STRICTNESS: Record<ProfileVisibility, number> = {
  public: 0,
  members: 1,
  private: 2,
};

export function isProfileVisibility(value: unknown): value is ProfileVisibility {
  return (
    typeof value === 'string' && (PROFILE_VISIBILITY_LEVELS as readonly string[]).includes(value)
  );
}

/** The stricter of two levels. */
export function stricterOf(a: ProfileVisibility, b: ProfileVisibility): ProfileVisibility {
  return STRICTNESS[a] >= STRICTNESS[b] ? a : b;
}

/** Can `viewer` see something at `level` owned by `ownerId`? */
export function canView(
  level: ProfileVisibility,
  ownerId: string,
  viewer: ProfileViewer | null | undefined
): boolean {
  if (viewer && (viewer.id === ownerId || viewer.isAdmin)) return true;
  switch (level) {
    case 'public':
      return true;
    case 'members':
      return !!viewer;
    case 'private':
      return false;
  }
}

export type ProfileSection = 'activity' | 'projects';

export interface ProfileAccess {
  /** Whether the profile page itself may be shown. */
  profile: boolean;
  /** Per-section access, already combined with the profile level. */
  sections: Record<ProfileSection, boolean>;
  /** Whether the viewer is the owner (drives edit affordances). */
  isOwner: boolean;
}

type VisibilityColumns = Pick<
  DbUser,
  'id' | 'profileVisibility' | 'activityVisibility' | 'projectsVisibility'
>;

/** Resolve the full access matrix for a viewer looking at `owner`. */
export function resolveProfileAccess(
  owner: VisibilityColumns,
  viewer: ProfileViewer | null | undefined
): ProfileAccess {
  const isOwner = !!viewer && viewer.id === owner.id;
  const profile = canView(owner.profileVisibility, owner.id, viewer);
  const section = (level: ProfileVisibility): boolean =>
    profile && canView(stricterOf(owner.profileVisibility, level), owner.id, viewer);
  return {
    profile,
    isOwner,
    sections: {
      activity: section(owner.activityVisibility),
      projects: section(owner.projectsVisibility),
    },
  };
}
