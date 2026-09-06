import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Who may see a profile (or one section of it).
 *
 * - `public`  — anyone, including anonymous visitors
 * - `members` — any signed-in user
 * - `private` — only the owner (and admins)
 */
export const PROFILE_VISIBILITY_LEVELS = ['public', 'members', 'private'] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITY_LEVELS)[number];

export const users = sqliteTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text('username').unique(),
  name: text('name'),
  email: text('email'),
  password: text('password'),
  githubId: text('githubId').unique(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  approved: integer('approved', { mode: 'boolean' }).notNull().default(false),
  isAdmin: integer('isAdmin', { mode: 'boolean' }).notNull().default(false),
  hasAvatar: integer('hasAvatar', { mode: 'boolean' }).notNull().default(false),
  // Whether the user has uploaded a personal background image (mirrors
  // hasAvatar: the bytes live in storage, this flag saves a storage round-trip
  // when rendering).
  hasBackground: integer('hasBackground', { mode: 'boolean' }).notNull().default(false),
  // Free-form per-user UI preferences as a JSON object. Kept as one column
  // rather than a table per preference so device-independent settings can be
  // added without a migration each time. See UserPreferences in
  // services/user-preferences.service.ts for the shape.
  preferences: text('preferences'),
  /** Short free-form profile blurb shown on the public profile page. */
  bio: text('bio'),
  /** Gates the whole profile page. */
  profileVisibility: text('profileVisibility')
    .notNull()
    .default('private')
    .$type<ProfileVisibility>(),
  /**
   * Per-section levels. The effective level of a section is the stricter of
   * the profile level and the section level, so these can only narrow access.
   */
  activityVisibility: text('activityVisibility')
    .notNull()
    .default('public')
    .$type<ProfileVisibility>(),
  projectsVisibility: text('projectsVisibility')
    .notNull()
    .default('private')
    .$type<ProfileVisibility>(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
