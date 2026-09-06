import { describe, it, expect } from 'bun:test';
import {
  canView,
  stricterOf,
  resolveProfileAccess,
  isProfileVisibility,
} from '../src/services/profile-visibility.service';

const OWNER = 'owner-id';
const owner = (overrides: Partial<Parameters<typeof resolveProfileAccess>[0]> = {}) => ({
  id: OWNER,
  profileVisibility: 'public' as const,
  activityVisibility: 'public' as const,
  projectsVisibility: 'public' as const,
  ...overrides,
});

describe('profile visibility service', () => {
  describe('isProfileVisibility', () => {
    it('accepts the three known levels only', () => {
      expect(isProfileVisibility('public')).toBe(true);
      expect(isProfileVisibility('members')).toBe(true);
      expect(isProfileVisibility('private')).toBe(true);
      expect(isProfileVisibility('friends')).toBe(false);
      expect(isProfileVisibility(undefined)).toBe(false);
    });
  });

  describe('stricterOf', () => {
    it('returns the more restrictive level', () => {
      expect(stricterOf('public', 'members')).toBe('members');
      expect(stricterOf('members', 'public')).toBe('members');
      expect(stricterOf('members', 'private')).toBe('private');
      expect(stricterOf('public', 'public')).toBe('public');
    });
  });

  describe('canView', () => {
    const other = { id: 'someone-else' };
    const admin = { id: 'admin', isAdmin: true };
    const self = { id: OWNER };

    it('public is visible to everyone', () => {
      expect(canView('public', OWNER, null)).toBe(true);
      expect(canView('public', OWNER, other)).toBe(true);
    });

    it('members is hidden from anonymous only', () => {
      expect(canView('members', OWNER, null)).toBe(false);
      expect(canView('members', OWNER, undefined)).toBe(false);
      expect(canView('members', OWNER, other)).toBe(true);
    });

    it('private is visible to the owner and admins only', () => {
      expect(canView('private', OWNER, null)).toBe(false);
      expect(canView('private', OWNER, other)).toBe(false);
      expect(canView('private', OWNER, self)).toBe(true);
      expect(canView('private', OWNER, admin)).toBe(true);
    });
  });

  describe('resolveProfileAccess', () => {
    it('grants everything to the owner regardless of settings', () => {
      const access = resolveProfileAccess(
        owner({
          profileVisibility: 'private',
          activityVisibility: 'private',
          projectsVisibility: 'private',
        }),
        { id: OWNER }
      );
      expect(access).toEqual({
        profile: true,
        isOwner: true,
        sections: { activity: true, projects: true },
      });
    });

    it('hides every section when the profile itself is hidden', () => {
      const access = resolveProfileAccess(owner({ profileVisibility: 'members' }), null);
      expect(access.profile).toBe(false);
      expect(access.sections).toEqual({ activity: false, projects: false });
      expect(access.isOwner).toBe(false);
    });

    it('lets section levels narrow but never widen the profile level', () => {
      // Profile is members-only; projects "public" still means members-only.
      const anon = resolveProfileAccess(
        owner({ profileVisibility: 'members', projectsVisibility: 'public' }),
        null
      );
      expect(anon.profile).toBe(false);

      const member = resolveProfileAccess(
        owner({
          profileVisibility: 'public',
          activityVisibility: 'members',
          projectsVisibility: 'private',
        }),
        { id: 'viewer' }
      );
      expect(member.profile).toBe(true);
      expect(member.sections).toEqual({ activity: true, projects: false });

      const anonOnPublic = resolveProfileAccess(
        owner({ profileVisibility: 'public', activityVisibility: 'members' }),
        null
      );
      expect(anonOnPublic.profile).toBe(true);
      expect(anonOnPublic.sections).toEqual({ activity: false, projects: true });
    });
  });
});
