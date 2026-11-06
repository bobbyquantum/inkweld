import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { getDatabase } from '../src/db/index';
import { users } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import {
  enablePasswordLoginForTests,
  startTestServer,
  stopTestServer,
  TestClient,
} from './server-test-helper';
import { GithubEmailInUseError, userService } from '../src/services/user.service';
import { TEST_PASSWORDS } from './test-credentials';

describe('User Service', () => {
  const db = getDatabase();

  beforeEach(async () => {
    // Clean up test users before each test
    await db.delete(users).where(eq(users.username, 'serviceuser'));
    await db.delete(users).where(eq(users.username, 'githubuser'));
    await db.delete(users).where(eq(users.username, 'passworduser'));
    await db.delete(users).where(eq(users.username, 'zuser'));
    await db.delete(users).where(eq(users.username, 'auser'));
    await db.delete(users).where(eq(users.username, 'localuser'));
    await db.delete(users).where(eq(users.username, 'otherghuser'));
    await db.delete(users).where(eq(users.username, 'newghuser'));
    await db.delete(users).where(eq(users.username, 'legacyghuser'));
    await db.delete(users).where(eq(users.email, 'service@example.com'));
    await db.delete(users).where(eq(users.email, 'github@example.com'));
    await db.delete(users).where(eq(users.email, 'shared@example.com'));
    await db.delete(users).where(eq(users.email, 'taken@example.com'));
    await db.delete(users).where(eq(users.email, 'updated@example.com'));
    await db.delete(users).where(eq(users.email, 'password@example.com'));
    await db.delete(users).where(eq(users.email, 'real@example.com'));
    await db.delete(users).where(eq(users.email, 'Mixed.Case@Example.com'));
  });

  describe('findById', () => {
    it('should find user by ID', async () => {
      const userId = crypto.randomUUID();
      await db.insert(users).values({
        id: userId,
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'hashedpass',
        approved: true,
        enabled: true,
      });

      const found = await userService.findById(db, userId);
      expect(found).toBeDefined();
      expect(found?.username).toBe('serviceuser');
    });

    it('should return undefined for non-existent ID', async () => {
      const found = await userService.findById(db, 'non-existent-id');
      expect(found).toBeUndefined();
    });
  });

  describe('findByUsername', () => {
    it('should find user by username', async () => {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'hashedpass',
        approved: true,
        enabled: true,
      });

      const found = await userService.findByUsername(db, 'serviceuser');
      expect(found).toBeDefined();
      expect(found?.email).toBe('service@example.com');
    });

    it('should return undefined for non-existent username', async () => {
      const found = await userService.findByUsername(db, 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'serviceuser',
        email: 'service@example.com',
        password: 'hashedpass',
        approved: true,
        enabled: true,
      });

      const found = await userService.findByEmail(db, 'service@example.com');
      expect(found).toBeDefined();
      expect(found?.username).toBe('serviceuser');
    });

    it('should return undefined for non-existent email', async () => {
      const found = await userService.findByEmail(db, 'nonexistent@example.com');
      expect(found).toBeUndefined();
    });
  });

  describe('findByGithubId', () => {
    it('should find user by GitHub ID', async () => {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'githubuser',
        email: 'github@example.com',
        githubId: 'gh123456',
        approved: true,
        enabled: true,
      });

      const found = await userService.findByGithubId(db, 'gh123456');
      expect(found).toBeDefined();
      expect(found?.username).toBe('githubuser');
    });

    it('should return undefined for non-existent GitHub ID', async () => {
      const found = await userService.findByGithubId(db, 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('create', () => {
    it.each(['public', 'Public', 'PUBLIC'])(
      'rejects the reserved username %s',
      async (username) => {
        await expect(userService.create(db, { username })).rejects.toThrow(
          'This username is reserved and cannot be used'
        );
        expect(await userService.findByUsername(db, username)).toBeUndefined();
      }
    );

    it('rejects a reserved username when creating an OIDC account', async () => {
      await expect(
        userService.createOrUpdateOidcUser(db, {
          issuer: 'https://reserved.example.com',
          subject: 'reserved-public',
          username: 'public',
          emailVerified: false,
          name: 'Reserved Name',
        })
      ).rejects.toThrow('This username is reserved and cannot be used');
      expect(await userService.findByUsername(db, 'public')).toBeUndefined();
    });

    it('should create a new user with hashed password', async () => {
      const user = await userService.create(db, {
        username: 'serviceuser',
        email: 'service@example.com',
        password: TEST_PASSWORDS.DEFAULT,
        name: 'Service User',
      });

      expect(user).toBeDefined();
      expect(user.username).toBe('serviceuser');
      expect(user.email).toBe('service@example.com');
      expect(user.name).toBe('Service User');
      expect(user.enabled).toBe(true);
      // Password should be hashed, not plain text
      expect(user.password).not.toBe(TEST_PASSWORDS.DEFAULT);
      expect(user.password?.startsWith('$2')).toBe(true); // bcrypt hash prefix
    });

    it('should create user without name', async () => {
      const user = await userService.create(db, {
        username: 'serviceuser',
        email: 'service@example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });

      expect(user.name).toBeNull();
    });
  });

  describe('createOrUpdateGithubUser', () => {
    it('does not reuse another account when a short GitHub fallback is taken', async () => {
      const existing = await userService.create(db, {
        username: 'github-xy',
        email: 'existing-short@example.com',
        password: 'hashedpass',
      });
      const created = await userService.createOrUpdateGithubUser(db, {
        githubId: 'short-collision',
        username: 'xy',
        email: 'new-short@example.com',
        name: 'Short Login',
      });
      try {
        expect(created.id).not.toBe(existing.id);
        expect(created.username).toMatch(/^github-xy-[a-f0-9]{8}$/);
        expect(created.githubId).toBe('short-collision');
      } finally {
        await db.delete(users).where(eq(users.id, created.id));
        await db.delete(users).where(eq(users.id, existing.id));
      }
    });
    it.each(['a', 'ab'])(
      'supports GitHub login %s without relaxing registration validation',
      async (username) => {
        const githubId = `short-${username}`;
        const created = await userService.createOrUpdateGithubUser(db, {
          githubId,
          username,
          email: 'github@example.com',
          name: 'GitHub User',
        });
        try {
          expect(created.username).toBe(`github-${username}`);
          const returning = await userService.createOrUpdateGithubUser(db, {
            githubId,
            username,
            email: 'github@example.com',
            name: 'GitHub User',
          });
          expect(returning.id).toBe(created.id);
        } finally {
          await db.delete(users).where(eq(users.id, created.id));
        }
      }
    );
    it.each(['public', 'Public', 'PUBLIC'])(
      'rejects a new GitHub user named %s',
      async (username) => {
        const githubId = `reserved-${username}`;
        await expect(
          userService.createOrUpdateGithubUser(db, {
            githubId,
            username,
            email: 'github@example.com',
            name: 'Reserved Name',
          })
        ).rejects.toThrow('This username is reserved and cannot be used');
        expect(await userService.findByGithubId(db, githubId)).toBeUndefined();
      }
    );

    it('should create a new GitHub user', async () => {
      const user = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh789',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'GitHub User',
      });

      expect(user).toBeDefined();
      expect(user.githubId).toBe('gh789');
      expect(user.username).toBe('githubuser');
      expect(user.approved).toBe(false); // GitHub users need approval
    });

    it('should update existing GitHub user (preserving username)', async () => {
      // First create a GitHub user
      await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh789',
        username: 'githubuser',
        email: 'github@example.com',
        emailVerified: true,
        name: 'GitHub User',
      });

      // Then update with new info — username should NOT change
      const updated = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh789',
        username: 'updatedgithub',
        email: 'updated@example.com',
        emailVerified: true,
        name: 'Updated Name',
      });

      expect(updated.username).toBe('githubuser'); // preserved
      expect(updated.email).toBe('updated@example.com');
      expect(updated.name).toBe('Updated Name');
    });

    it('does not attach a new GitHub identity to a local account with the same verified email', async () => {
      const localUser = await userService.create(db, {
        username: 'localuser',
        email: 'shared@example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });

      await expect(
        userService.createOrUpdateGithubUser(db, {
          githubId: 'gh-link-1',
          username: 'gh-localuser',
          email: 'shared@example.com',
          emailVerified: true,
          name: 'GitHub Name',
        })
      ).rejects.toThrow(GithubEmailInUseError);

      // The local account is unchanged, and no second account has the address.
      const local = await userService.findById(db, localUser.id);
      expect(local?.githubId).toBeNull();
      expect(local?.name).toBe(localUser.name);
      expect(local?.password).toBe(localUser.password);
      expect(await userService.findByGithubId(db, 'gh-link-1')).toBeUndefined();
      expect(await userService.findByUsername(db, 'gh-localuser')).toBeUndefined();
      const withEmail = await db.select().from(users).where(eq(users.email, 'shared@example.com'));
      expect(withEmail).toHaveLength(1);
    });

    it('still signs in a local account that was linked to the GitHub id earlier', async () => {
      // Accounts linked before keep their githubId and are found by it.
      const localUser = await userService.create(db, {
        username: 'localuser',
        email: 'shared@example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });
      await db.update(users).set({ githubId: 'gh-linked' }).where(eq(users.id, localUser.id));

      const signedIn = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-linked',
        username: 'gh-localuser',
        email: 'shared@example.com',
        emailVerified: true,
        name: 'GitHub Name',
      });

      expect(signedIn.id).toBe(localUser.id);
      expect(signedIn.username).toBe('localuser');
      expect(signedIn.githubId).toBe('gh-linked');
      expect(signedIn.email).toBe('shared@example.com');
      expect(signedIn.password).toBe(localUser.password);
    });

    it('still signs in a GitHub-linked account whose email another account also uses', async () => {
      // Earlier versions could create a GitHub account with an address that a
      // local account already had. The GitHub id is looked up first, so that
      // account keeps signing in.
      const local = await userService.create(db, {
        username: 'localuser',
        email: 'shared@example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });
      const legacyId = crypto.randomUUID();
      await db.insert(users).values({
        id: legacyId,
        username: 'legacyghuser',
        email: 'shared@example.com',
        githubId: 'gh-legacy',
        enabled: true,
        approved: true,
      });

      const signedIn = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-legacy',
        username: 'legacyghuser',
        email: 'shared@example.com',
        emailVerified: true,
        name: 'Legacy User',
      });

      expect(signedIn.id).toBe(legacyId);
      expect(signedIn.email).toBe('shared@example.com');
      expect(signedIn.name).toBe('Legacy User');
      expect((await userService.findById(db, local.id))?.githubId).toBeNull();
    });

    it("keeps a linked account's email when its new verified address belongs to another account", async () => {
      const local = await userService.create(db, {
        username: 'localuser',
        email: 'Mixed.Case@Example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });
      const linked = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-changes-email',
        username: 'githubuser',
        email: 'github@example.com',
        emailVerified: true,
        name: 'GitHub User',
      });

      // The GitHub account's verified primary address is now the local
      // account's address, in different letter case.
      const signedIn = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-changes-email',
        username: 'githubuser',
        email: 'mixed.case@example.com',
        emailVerified: true,
        name: 'Renamed User',
      });

      expect(signedIn.id).toBe(linked.id);
      expect(signedIn.email).toBe('github@example.com');
      expect(signedIn.name).toBe('Renamed User');
      expect((await userService.findById(db, local.id))?.email).toBe('Mixed.Case@Example.com');
    });

    it("keeps a linked account's email when GitHub reports an unverified address", async () => {
      const linked = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-unverified-update',
        username: 'githubuser',
        email: 'github@example.com',
        emailVerified: true,
        name: 'GitHub User',
      });

      const signedIn = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-unverified-update',
        username: 'githubuser',
        email: 'updated@example.com',
        emailVerified: false,
        name: 'GitHub User',
      });

      expect(signedIn.id).toBe(linked.id);
      expect(signedIn.email).toBe('github@example.com');
    });

    it('creates an account for a new GitHub identity whose verified email is unused', async () => {
      const user = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-fresh',
        username: 'githubuser',
        email: 'github@example.com',
        emailVerified: true,
        name: 'GitHub User',
      });

      expect(user.githubId).toBe('gh-fresh');
      expect(user.username).toBe('githubuser');
      expect(user.email).toBe('github@example.com');
      expect(user.password).toBeNull();
      expect(user.approved).toBe(false);
    });

    it('neither stores nor compares an address GitHub has not verified', async () => {
      const localUser = await userService.create(db, {
        username: 'localuser',
        email: 'shared@example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });

      // GitHub lets an account list addresses it has not confirmed.
      const ghUser = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-unverified',
        username: 'newghuser',
        email: 'shared@example.com',
        emailVerified: false,
        name: 'New GH User',
      });

      expect(ghUser.id).not.toBe(localUser.id);
      expect(ghUser.username).toBe('newghuser');
      expect(ghUser.email || null).toBeNull();
      const local = await userService.findById(db, localUser.id);
      expect(local?.githubId).toBeNull();
    });

    it('treats a missing emailVerified flag as unverified', async () => {
      const localUser = await userService.create(db, {
        username: 'localuser',
        email: 'shared@example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });
      const other = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-link-2',
        username: 'newghuser',
        email: 'shared@example.com',
        name: 'GitHub Name',
      });
      expect(other.id).not.toBe(localUser.id);
      expect(other.email || null).toBeNull();
    });

    it('does not compare an unverified address with that of an account linked to another GitHub identity', async () => {
      const other = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-other',
        username: 'otherghuser',
        email: 'taken@example.com',
        emailVerified: true,
        name: 'Other User',
      });

      const newUser = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-new',
        username: 'newghuser',
        email: 'taken@example.com',
        emailVerified: false,
        name: 'New User',
      });

      expect(newUser.id).not.toBe(other.id);
      expect(newUser.githubId).toBe('gh-new');
      expect(newUser.email || null).toBeNull();
      expect((await userService.findById(db, other.id))?.githubId).toBe('gh-other');
    });

    it('refuses a verified email that an account linked to another GitHub identity uses', async () => {
      const other = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-other-verified',
        username: 'otherghuser',
        email: 'taken@example.com',
        emailVerified: true,
        name: 'Other User',
      });

      await expect(
        userService.createOrUpdateGithubUser(db, {
          githubId: 'gh-new-verified',
          username: 'newghuser',
          email: 'taken@example.com',
          emailVerified: true,
          name: 'New User',
        })
      ).rejects.toThrow(GithubEmailInUseError);

      expect(await userService.findByGithubId(db, 'gh-new-verified')).toBeUndefined();
      expect((await userService.findById(db, other.id))?.githubId).toBe('gh-other-verified');
    });

    it('refuses a verified email that differs from an existing address only in letter case', async () => {
      const local = await userService.create(db, {
        username: 'localuser',
        email: 'Mixed.Case@Example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });

      await expect(
        userService.createOrUpdateGithubUser(db, {
          githubId: 'gh-case',
          username: 'newghuser',
          email: 'mixed.case@example.com',
          emailVerified: true,
          name: 'New GH User',
        })
      ).rejects.toThrow(GithubEmailInUseError);

      expect(await userService.findByGithubId(db, 'gh-case')).toBeUndefined();
      expect((await userService.findById(db, local.id))?.githubId).toBeNull();
    });

    it('should preserve existing email when GitHub returns empty email', async () => {
      // Create a GitHub user with a real email
      await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-email-test',
        username: 'githubuser',
        email: 'real@example.com',
        emailVerified: true,
        name: 'Email User',
      });

      // Update with empty email (GitHub sometimes hides emails)
      const updated = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-email-test',
        username: 'githubuser',
        email: '',
        name: 'Email User',
      });

      expect(updated.email).toBe('real@example.com'); // preserved
    });

    it('creates an account without an unverified address that several accounts use', async () => {
      // Create two local users with the same email (edge case)
      await userService.create(db, {
        username: 'localuser',
        email: 'shared@example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });

      // Manually insert another user with the same email
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'auser',
        email: 'shared@example.com',
        password: 'hashedpass',
        enabled: true,
        approved: true,
      });

      // The unverified address is not compared, so sign-in creates an account
      // without it.
      const ghUser = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh-multi-email',
        username: 'newghuser',
        email: 'shared@example.com',
        emailVerified: false,
        name: 'New GH User',
      });

      expect(ghUser.username).toBe('newghuser');
      expect(ghUser.githubId).toBe('gh-multi-email');
      expect(ghUser.email || null).toBeNull();
      const withEmail = await db.select().from(users).where(eq(users.email, 'shared@example.com'));
      expect(withEmail.map((user) => user.githubId)).toEqual([null, null]);
    });

    it('refuses a verified email that several accounts share', async () => {
      await userService.create(db, {
        username: 'localuser',
        email: 'shared@example.com',
        password: TEST_PASSWORDS.DEFAULT,
      });
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'auser',
        email: 'shared@example.com',
        password: 'hashedpass',
        enabled: true,
        approved: true,
      });

      await expect(
        userService.createOrUpdateGithubUser(db, {
          githubId: 'gh-multi-verified',
          username: 'newghuser',
          email: 'shared@example.com',
          emailVerified: true,
          name: 'New GH User',
        })
      ).rejects.toThrow(GithubEmailInUseError);

      const withEmail = await db.select().from(users).where(eq(users.email, 'shared@example.com'));
      expect(withEmail.map((user) => user.githubId)).toEqual([null, null]);
    });
  });

  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const user = await userService.create(db, {
        username: 'passworduser',
        email: 'password@example.com',
        password: TEST_PASSWORDS.CORRECT,
      });

      const isValid = await userService.validatePassword(user, TEST_PASSWORDS.CORRECT);
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const user = await userService.create(db, {
        username: 'passworduser',
        email: 'password@example.com',
        password: TEST_PASSWORDS.CORRECT,
      });

      const isValid = await userService.validatePassword(user, TEST_PASSWORDS.WRONG);
      expect(isValid).toBe(false);
    });

    it('should return false for user without password', async () => {
      // Create a GitHub user (no password)
      const user = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh999',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'No Password User',
      });

      const isValid = await userService.validatePassword(user, TEST_PASSWORDS.DEFAULT);
      expect(isValid).toBe(false);
    });
  });

  describe('updatePassword', () => {
    it('should update user password', async () => {
      const user = await userService.create(db, {
        username: 'passworduser',
        email: 'password@example.com',
        password: TEST_PASSWORDS.OLD,
      });

      await userService.updatePassword(db, user.id, TEST_PASSWORDS.NEW);

      const updated = await userService.findById(db, user.id);
      expect(updated).toBeDefined();
      if (!updated) throw new Error('User not found after update');

      // Old password should no longer work
      const oldValid = await userService.validatePassword(updated, TEST_PASSWORDS.OLD);
      expect(oldValid).toBe(false);

      // New password should work
      const newValid = await userService.validatePassword(updated, TEST_PASSWORDS.NEW);
      expect(newValid).toBe(true);
    });
  });

  describe('approveUser', () => {
    it('should approve a user', async () => {
      const user = await userService.createOrUpdateGithubUser(db, {
        githubId: 'gh111',
        username: 'githubuser',
        email: 'github@example.com',
        name: 'Unapproved User',
      });

      expect(user.approved).toBe(false);

      await userService.approveUser(db, user.id);

      const updated = await userService.findById(db, user.id);
      expect(updated?.approved).toBe(true);
    });
  });

  describe('setUserEnabled', () => {
    it('should disable a user', async () => {
      const user = await userService.create(db, {
        username: 'serviceuser',
        email: 'service@example.com',
        password: TEST_PASSWORDS.ALT,
      });

      expect(user.enabled).toBe(true);

      await userService.setUserEnabled(db, user.id, false);

      const updated = await userService.findById(db, user.id);
      expect(updated?.enabled).toBe(false);
    });

    it('should enable a disabled user', async () => {
      const user = await userService.create(db, {
        username: 'serviceuser',
        email: 'service@example.com',
        password: TEST_PASSWORDS.ALT,
      });

      await userService.setUserEnabled(db, user.id, false);
      await userService.setUserEnabled(db, user.id, true);

      const updated = await userService.findById(db, user.id);
      expect(updated?.enabled).toBe(true);
    });
  });

  describe('listAll', () => {
    it('should list all users ordered by username', async () => {
      // Create multiple users
      await db.insert(users).values([
        {
          id: crypto.randomUUID(),
          username: 'zuser',
          email: 'z@example.com',
          approved: true,
          enabled: true,
        },
        {
          id: crypto.randomUUID(),
          username: 'auser',
          email: 'a@example.com',
          approved: true,
          enabled: true,
        },
      ]);

      const result = await userService.listAll(db);
      expect(result.users.length).toBeGreaterThanOrEqual(2);
      expect(result.total).toBeGreaterThanOrEqual(2);

      // Find our test users in the result
      const zIndex = result.users.findIndex((u) => u.username === 'zuser');
      const aIndex = result.users.findIndex((u) => u.username === 'auser');

      // 'auser' should come before 'zuser'
      expect(aIndex).toBeLessThan(zIndex);
    });
  });

  describe('countUsers', () => {
    it('should count total users in database', async () => {
      // Clean up first
      await db.delete(users).where(eq(users.username, 'counttest'));

      // Get initial count
      const initialCount = await userService.countUsers(db);

      // Add a user
      await db.insert(users).values({
        id: crypto.randomUUID(),
        username: 'counttest',
        email: 'counttest@example.com',
        password: 'hashedpass',
        approved: true,
        enabled: true,
      });

      // Count should have increased by 1
      const newCount = await userService.countUsers(db);
      expect(newCount).toBe(initialCount + 1);

      // Clean up
      await db.delete(users).where(eq(users.username, 'counttest'));
    });
  });

  describe('canLogin', () => {
    it('should return true for enabled and approved user', () => {
      const user = {
        id: 'test',
        username: 'test',
        email: 'test@example.com',
        enabled: true,
        approved: true,
        password: null,
        githubId: null,
        name: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(userService.canLogin(user)).toBe(true);
    });

    it('should return false for disabled user', () => {
      const user = {
        id: 'test',
        username: 'test',
        email: 'test@example.com',
        enabled: false,
        approved: true,
        password: null,
        githubId: null,
        name: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(userService.canLogin(user)).toBe(false);
    });

    it('should return false for unapproved user', () => {
      const user = {
        id: 'test',
        username: 'test',
        email: 'test@example.com',
        enabled: true,
        approved: false,
        password: null,
        githubId: null,
        name: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(userService.canLogin(user)).toBe(false);
    });
  });
});

describe('User Routes', () => {
  let client: TestClient;
  let adminClient: TestClient;
  let anonClient: TestClient;
  let testServer: { port: number; baseUrl: string };
  const db = getDatabase();

  beforeAll(async () => {
    testServer = await startTestServer();
    client = new TestClient(testServer.baseUrl);

    // Clean up and create test users
    await db.delete(users).where(eq(users.username, 'routeuser'));
    await db.delete(users).where(eq(users.username, 'searchuser1'));
    await db.delete(users).where(eq(users.username, 'searchuser2'));
    await db.delete(users).where(eq(users.username, 'testadmin'));

    const hashedPassword = await bcrypt.hash(TEST_PASSWORDS.DEFAULT, 10);
    await db.insert(users).values([
      {
        id: crypto.randomUUID(),
        username: 'routeuser',
        email: 'route@example.com',
        password: hashedPassword,
        name: 'Route User',
        approved: true,
        enabled: true,
      },
      {
        id: crypto.randomUUID(),
        username: 'testadmin',
        email: 'testadmin@example.com',
        password: hashedPassword,
        name: 'Test Admin',
        approved: true,
        enabled: true,
        isAdmin: true,
      },
    ]);

    // The directory endpoints require a signed-in user.
    await enablePasswordLoginForTests();
    expect(await client.login('routeuser', TEST_PASSWORDS.DEFAULT)).toBe(true);
    adminClient = new TestClient(testServer.baseUrl);
    expect(await adminClient.login('testadmin', TEST_PASSWORDS.DEFAULT)).toBe(true);
    anonClient = new TestClient(testServer.baseUrl);
  });

  afterAll(async () => {
    // Clean up test users
    await db.delete(users).where(eq(users.username, 'routeuser'));
    await db.delete(users).where(eq(users.username, 'testadmin'));
    await stopTestServer();
  });

  describe('GET /api/v1/users', () => {
    it('requires authentication', async () => {
      const { response } = await anonClient.request('/api/v1/users');
      expect(response.status).toBe(401);
    });

    it('should return paginated list of users', async () => {
      const { response, json } = await client.request('/api/v1/users');

      expect(response.status).toBe(200);
      const data = (await json()) as {
        users: Array<{ id: string; username: string }>;
        total: number;
        hasMore: boolean;
      };
      expect(data.users).toBeDefined();
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(1);
      expect(typeof data.hasMore).toBe('boolean');
    });

    it('should support pagination with limit and offset', async () => {
      const { response, json } = await client.request('/api/v1/users?limit=5&offset=0');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ id: string }>; hasMore: boolean };
      expect(data.users.length).toBeLessThanOrEqual(5);
      expect(typeof data.hasMore).toBe('boolean');
    });

    it('should support search parameter', async () => {
      const { response, json } = await client.request('/api/v1/users?search=admin');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ username: string }> };
      // Should find admin user since we seeded it
      expect(data.users.some((u) => u.username.includes('admin'))).toBe(true);
    });

    it('should clamp negative limit to 1 and negative offset to 0', async () => {
      const { response, json } = await client.request('/api/v1/users?limit=-5&offset=-10');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ id: string }>; total: number };
      // limit clamped to 1, so at most 1 user returned
      expect(data.users.length).toBeLessThanOrEqual(1);
    });

    it('should cap limit at 100', async () => {
      const { response, json } = await client.request('/api/v1/users?limit=500');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ id: string }> };
      expect(data.users.length).toBeLessThanOrEqual(100);
    });

    it('should handle non-numeric limit and offset gracefully', async () => {
      const { response, json } = await client.request('/api/v1/users?limit=abc&offset=xyz');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ id: string }>; total: number };
      // Falls back to default limit=20, offset=0
      expect(data.users).toBeDefined();
      expect(Array.isArray(data.users)).toBe(true);
    });
  });

  describe('GET /api/v1/users/search', () => {
    beforeAll(async () => {
      await db.insert(users).values([
        {
          id: crypto.randomUUID(),
          username: 'searchuser1',
          email: 'search1@example.com',
          name: 'First User',
          approved: true,
          enabled: true,
        },
        {
          id: crypto.randomUUID(),
          username: 'searchuser2',
          email: 'search2@example.com',
          name: 'Second User',
          approved: true,
          enabled: true,
        },
      ]);
    });

    it('should search users by username', async () => {
      const { response, json } = await client.request('/api/v1/users/search?term=searchuser');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ username: string }> };
      expect(data.users.length).toBeGreaterThanOrEqual(2);
    });

    it('requires authentication', async () => {
      const { response } = await anonClient.request('/api/v1/users/search?term=searchuser');
      expect(response.status).toBe(401);
    });

    it('lets admins search users by email', async () => {
      const { response, json } = await adminClient.request('/api/v1/users/search?term=search1@');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ username: string; email?: string }> };
      expect(data.users.map((u) => u.username)).toContain('searchuser1');
    });

    it('does not let regular users match on email', async () => {
      // Otherwise the endpoint is an existence oracle for any email address.
      const { response, json } = await client.request('/api/v1/users/search?term=search1@');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ username: string }>; total: number };
      expect(data.users).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it('never exposes email to regular users', async () => {
      const { json } = await client.request('/api/v1/users/search?term=searchuser1');
      const data = (await json()) as { users: Array<Record<string, unknown>> };
      expect(data.users[0]).toBeDefined();
      expect(data.users[0]).not.toHaveProperty('email');
    });

    it('should return empty results for non-matching search', async () => {
      const { response, json } = await client.request('/api/v1/users/search?term=nonexistent12345');

      expect(response.status).toBe(200);
      const data = (await json()) as { users: Array<{ username: string }>; total: number };
      expect(data.users).toHaveLength(0);
      expect(data.total).toBe(0);
    });
  });

  describe('GET /api/v1/users/check-username', () => {
    it('should return available for non-existing username', async () => {
      const { response, json } = await client.request(
        '/api/v1/users/check-username?username=availableuser123'
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { available: boolean; suggestions: string[] };
      expect(data.available).toBe(true);
      expect(data.suggestions).toEqual([]);
    });

    it('should return unavailable for existing username', async () => {
      const { response, json } = await client.request(
        '/api/v1/users/check-username?username=routeuser'
      );

      expect(response.status).toBe(200);
      const data = (await json()) as { available: boolean; suggestions: string[] };
      expect(data.available).toBe(false);
      expect(data.suggestions.length).toBeGreaterThan(0);
    });

    it('should reject username shorter than 3 characters', async () => {
      const { response } = await client.request('/api/v1/users/check-username?username=ab');

      expect(response.status).toBe(400);
    });
  });
});
