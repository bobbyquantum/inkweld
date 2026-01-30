import { eq, and, or, desc, inArray } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import { projects, Project, InsertProject } from '../db/schema/projects';
import { users } from '../db/schema/users';
import { projectSlugAliases, ProjectSlugAlias } from '../db/schema/project-slug-aliases';
import { projectTombstones, ProjectTombstone } from '../db/schema/project-tombstones';

class ProjectService {
  /**
   * Find project by ID
   */
  async findById(db: DatabaseInstance, id: string): Promise<Project | undefined> {
    const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return result[0];
  }

  /**
   * Find project by username and slug
   */
  async findByUsernameAndSlug(
    db: DatabaseInstance,
    username: string,
    slug: string
  ): Promise<(Project & { username: string }) | undefined> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (db as any)
      .select({
        id: projects.id,
        version: projects.version,
        slug: projects.slug,
        title: projects.title,
        description: projects.description,
        userId: projects.userId,
        createdDate: projects.createdDate,
        updatedDate: projects.updatedDate,
        username: users.username,
      })
      .from(projects)
      .leftJoin(users, eq(projects.userId, users.id))
      .where(and(eq(users.username, username), eq(projects.slug, slug)))
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle join result type is complex
    return result[0] as any;
  }

  /**
   * Find all projects for a user
   */
  async findByUserId(
    db: DatabaseInstance,
    userId: string
  ): Promise<Array<Project & { username: string }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await (db as any)
      .select({
        id: projects.id,
        version: projects.version,
        slug: projects.slug,
        title: projects.title,
        description: projects.description,
        userId: projects.userId,
        createdDate: projects.createdDate,
        updatedDate: projects.updatedDate,
        username: users.username,
      })
      .from(projects)
      .leftJoin(users, eq(projects.userId, users.id))
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedDate));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle join result type is complex
    return results as any;
  }

  /**
   * Create a new project
   */
  async create(
    db: DatabaseInstance,
    data: {
      slug: string;
      title: string;
      description?: string;
      userId: string;
    }
  ): Promise<Project> {
    const id = crypto.randomUUID();
    const newProject: InsertProject = {
      id,
      slug: data.slug,
      title: data.title,
      description: data.description || null,
      userId: data.userId,
      version: 1,
      createdDate: Date.now(),
      updatedDate: Date.now(),
    };

    await db.insert(projects).values(newProject);

    const created = await this.findById(db, id);
    if (created === undefined) {
      throw new Error('Failed to create project');
    }
    return created;
  }

  /**
   * Update a project
   */
  async update(
    db: DatabaseInstance,
    id: string,
    data: {
      title?: string;
      description?: string;
      slug?: string;
      coverImage?: string | null;
    }
  ): Promise<void> {
    await db
      .update(projects)
      .set({
        ...data,
        updatedDate: Date.now(),
      })
      .where(eq(projects.id, id));
  }

  /**
   * Delete a project and create a tombstone record
   */
  async delete(db: DatabaseInstance, id: string, userId: string, slug: string): Promise<void> {
    // Create tombstone before deleting
    await this.createTombstone(db, userId, slug);

    // Delete any slug aliases for this project
    await this.deleteAliases(db, userId, slug);

    // Delete the project
    await db.delete(projects).where(eq(projects.id, id));
  }

  /**
   * Check if user owns project
   */
  async isOwner(db: DatabaseInstance, projectId: string, userId: string): Promise<boolean> {
    const project = await this.findById(db, projectId);
    return project?.userId === userId;
  }

  /**
   * Find a slug alias (for redirect when old slug is accessed)
   */
  async findSlugAlias(
    db: DatabaseInstance,
    username: string,
    oldSlug: string
  ): Promise<ProjectSlugAlias | undefined> {
    // First find the user by username
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userResult = await (db as any)
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (userResult.length === 0) {
      return undefined;
    }

    const userId = userResult[0].id;

    const result = await db
      .select()
      .from(projectSlugAliases)
      .where(and(eq(projectSlugAliases.oldSlug, oldSlug), eq(projectSlugAliases.userId, userId)))
      .limit(1);

    return result[0];
  }

  /**
   * Create a slug alias when a project is renamed
   */
  async createSlugAlias(
    db: DatabaseInstance,
    userId: string,
    oldSlug: string,
    newSlug: string
  ): Promise<void> {
    // Delete any existing alias for this old slug
    await db
      .delete(projectSlugAliases)
      .where(and(eq(projectSlugAliases.oldSlug, oldSlug), eq(projectSlugAliases.userId, userId)));

    // Insert new alias
    await db.insert(projectSlugAliases).values({
      oldSlug,
      userId,
      newSlug,
      renamedAt: Date.now(),
    });
  }

  /**
   * Update aliases when a project is renamed again
   * (update any existing aliases pointing to oldSlug to point to newSlug)
   */
  async updateAliasChain(
    db: DatabaseInstance,
    userId: string,
    oldSlug: string,
    newSlug: string
  ): Promise<void> {
    // Find any aliases pointing to the old slug
    await db
      .update(projectSlugAliases)
      .set({ newSlug, renamedAt: Date.now() })
      .where(and(eq(projectSlugAliases.newSlug, oldSlug), eq(projectSlugAliases.userId, userId)));
  }

  /**
   * Delete all aliases for a project (when project is deleted)
   */
  async deleteAliases(db: DatabaseInstance, userId: string, slug: string): Promise<void> {
    // Delete aliases that either point FROM this slug or TO this slug
    await db
      .delete(projectSlugAliases)
      .where(
        and(
          eq(projectSlugAliases.userId, userId),
          or(eq(projectSlugAliases.oldSlug, slug), eq(projectSlugAliases.newSlug, slug))
        )
      );
  }

  /**
   * Create a tombstone record for a deleted project
   */
  async createTombstone(db: DatabaseInstance, userId: string, slug: string): Promise<void> {
    // Use upsert pattern - replace if exists
    await db
      .delete(projectTombstones)
      .where(and(eq(projectTombstones.slug, slug), eq(projectTombstones.userId, userId)));

    await db.insert(projectTombstones).values({
      slug,
      userId,
      deletedAt: Date.now(),
    });
  }

  /**
   * Find a tombstone for a project (to check if it was deleted)
   */
  async findTombstone(
    db: DatabaseInstance,
    username: string,
    slug: string
  ): Promise<ProjectTombstone | undefined> {
    // First find the user by username
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userResult = await (db as any)
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (userResult.length === 0) {
      return undefined;
    }

    const userId = userResult[0].id;

    const result = await db
      .select()
      .from(projectTombstones)
      .where(and(eq(projectTombstones.slug, slug), eq(projectTombstones.userId, userId)))
      .limit(1);

    return result[0];
  }

  /**
   * Check multiple projects for tombstones at once (for sync efficiency).
   * Accepts project keys in "username/slug" format and looks up by owner username.
   * Returns array of tombstones with username included.
   */
  async findTombstonesByProjectKeys(
    db: DatabaseInstance,
    projectKeys: string[]
  ): Promise<Array<{ username: string; slug: string; deletedAt: number }>> {
    if (projectKeys.length === 0) {
      return [];
    }

    const results: Array<{ username: string; slug: string; deletedAt: number }> = [];

    // Parse project keys and group by username for efficient lookup
    const parsedKeys: Array<{ username: string; slug: string }> = [];
    for (const key of projectKeys) {
      const parts = key.split('/');
      if (parts.length === 2 && parts[0] && parts[1]) {
        parsedKeys.push({ username: parts[0], slug: parts[1] });
      }
    }

    if (parsedKeys.length === 0) {
      return [];
    }

    // Get unique usernames
    const usernames = [...new Set(parsedKeys.map((k) => k.username))];

    // Look up user IDs for all usernames
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userResults = await (db as any)
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.username, usernames));

    const usernameToId = new Map<string, string>();
    for (const user of userResults) {
      usernameToId.set(user.username, user.id);
    }

    // For each parsed key, check if there's a tombstone
    for (const { username, slug } of parsedKeys) {
      const userId = usernameToId.get(username);
      if (!userId) {
        continue; // User doesn't exist, no tombstone possible
      }

      const tombstoneResult = await db
        .select()
        .from(projectTombstones)
        .where(and(eq(projectTombstones.userId, userId), eq(projectTombstones.slug, slug)))
        .limit(1);

      if (tombstoneResult.length > 0) {
        results.push({
          username,
          slug,
          deletedAt: tombstoneResult[0].deletedAt,
        });
      }
    }

    return results;
  }

  /**
   * @deprecated Use findTombstonesByProjectKeys instead for proper username-scoped lookups
   */
  async findTombstones(
    db: DatabaseInstance,
    userId: string,
    slugs: string[]
  ): Promise<ProjectTombstone[]> {
    if (slugs.length === 0) {
      return [];
    }

    const result = await db
      .select()
      .from(projectTombstones)
      .where(and(eq(projectTombstones.userId, userId), inArray(projectTombstones.slug, slugs)));

    return result;
  }

  /**
   * Remove a tombstone (e.g., if user recreates a project with same slug)
   */
  async removeTombstone(db: DatabaseInstance, userId: string, slug: string): Promise<void> {
    await db
      .delete(projectTombstones)
      .where(and(eq(projectTombstones.slug, slug), eq(projectTombstones.userId, userId)));
  }
}

export const projectService = new ProjectService();
