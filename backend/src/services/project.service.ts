import { eq, and, desc } from 'drizzle-orm';
import type { DatabaseInstance } from '../types/context';
import { projects, Project, InsertProject } from '../db/schema/projects';
import { users } from '../db/schema/users';

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
   * Delete a project
   */
  async delete(db: DatabaseInstance, id: string): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  /**
   * Check if user owns project
   */
  async isOwner(db: DatabaseInstance, projectId: string, userId: string): Promise<boolean> {
    const project = await this.findById(db, projectId);
    return project?.userId === userId;
  }
}

export const projectService = new ProjectService();
