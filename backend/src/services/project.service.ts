import { eq, and, desc } from 'drizzle-orm';
import { getDatabase } from '../db';
import { projects, Project, InsertProject } from '../db/schema/projects';
import { users } from '../db/schema/users';

class ProjectService {
  /**
   * Find project by ID
   */
  async findById(id: string): Promise<Project | undefined> {
    const db = getDatabase();
    const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return result[0];
  }

  /**
   * Find project by username and slug
   */
  async findByUsernameAndSlug(username: string, slug: string): Promise<(Project & { username: string }) | undefined> {
    const db = getDatabase();
    const result = await db
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
    
    return result[0] as any;
  }

  /**
   * Find all projects for a user
   */
  async findByUserId(userId: string): Promise<Array<Project & { username: string }>> {
    const db = getDatabase();
    const results = await db
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
    
    return results as any;
  }

  /**
   * Create a new project
   */
  async create(data: {
    slug: string;
    title: string;
    description?: string;
    userId: string;
  }): Promise<Project> {
    const db = getDatabase();
    const newProject: InsertProject = {
      id: crypto.randomUUID(),
      slug: data.slug,
      title: data.title,
      description: data.description || null,
      userId: data.userId,
      version: 1,
      createdDate: Date.now(),
      updatedDate: Date.now(),
    };

    await db.insert(projects).values(newProject);
    
    const created = await this.findById(newProject.id);
    if (!created) {
      throw new Error('Failed to create project');
    }
    return created;
  }

  /**
   * Update a project
   */
  async update(
    id: string,
    data: {
      title?: string;
      description?: string;
      slug?: string;
    }
  ): Promise<void> {
    const db = getDatabase();
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
  async delete(id: string): Promise<void> {
    const db = getDatabase();
    await db.delete(projects).where(eq(projects.id, id));
  }

  /**
   * Check if user owns project
   */
  async isOwner(projectId: string, userId: string): Promise<boolean> {
    const project = await this.findById(projectId);
    return project?.userId === userId;
  }
}

export const projectService = new ProjectService();
