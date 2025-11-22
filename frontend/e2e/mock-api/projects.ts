import { Route } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import { mockApi } from './index';

/**
 * Mock Project DTO
 */
export interface MockProjectDto {
  id: string;
  title: string;
  slug: string;
  description?: string;
  username: string;
  coverImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Manages mock project data
 */
class MockProjects {
  private projects: MockProjectDto[] = [
    {
      id: '1',
      title: 'Test Project',
      slug: 'test-project',
      description: 'A test project for e2e tests',
      username: 'testuser',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  public getProjects(): MockProjectDto[] {
    return this.projects;
  }

  public getProjectsByUsername(username: string): MockProjectDto[] {
    return this.projects.filter(p => p.username === username);
  }

  public findBySlugAndUsername(
    username: string,
    slug: string
  ): MockProjectDto | undefined {
    return this.projects.find(p => p.username === username && p.slug === slug);
  }

  public findById(id: string): MockProjectDto | undefined {
    return this.projects.find(p => p.id === id);
  }

  public addProject(project: MockProjectDto): void {
    // Check for duplicate slug for the same user
    const existing = this.findBySlugAndUsername(project.username, project.slug);
    if (existing) {
      throw new Error(`Project slug ${project.slug} already exists`);
    }
    this.projects.push(project);
  }

  public updateProject(id: string, updates: Partial<MockProjectDto>): void {
    const index = this.projects.findIndex(p => p.id === id);
    if (index !== -1) {
      this.projects[index] = {
        ...this.projects[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  public deleteProject(id: string): void {
    const index = this.projects.findIndex(p => p.id === id);
    if (index !== -1) {
      this.projects.splice(index, 1);
    }
  }

  public resetProjects(): void {
    this.projects = [];
  }
}

export const mockProjects = new MockProjects();

/**
 * Set up mock handlers for project-related API endpoints
 */
export function setupProjectHandlers(): void {
  // GET /api/v1/projects - List all projects for current user
  // Use $ to ensure exact match (not matching /projects/...)
  mockApi.addHandler('**/api/v1/projects$', async (route: Route) => {
    const method = route.request().method();
    console.log(`Handling /api/v1/projects request - method: ${method}`);

    // Handle GET requests
    if (method === 'GET') {
      const request = route.request();
      const authHeader = request.headers()['authorization'];
      let username = '';

      // Extract username from auth token
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        console.log('Auth token:', token);
        const parts = token.split('-');
        if (parts.length >= 3 && parts[0] === 'mock' && parts[1] === 'token') {
          username = parts[2];
          console.log('Extracted username:', username);
        }
      } else {
        console.log('No auth header found');
      }

      if (!username) {
        console.log('No username - returning 401');
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Unauthorized',
            error: 'Unauthorized',
            statusCode: 401,
          }),
        });
        return;
      }

      const userProjects = mockProjects.getProjectsByUsername(username);
      console.log(
        `Found ${userProjects.length} projects for user ${username}:`,
        userProjects.map(p => p.title)
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(userProjects),
      });
      return;
    }

    // Handle POST requests
    if (method === 'POST') {
      const request = route.request();
      const authHeader = request.headers()['authorization'];
      let username = '';

      // Extract username from auth token
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const parts = token.split('-');
        if (parts.length >= 3 && parts[0] === 'mock' && parts[1] === 'token') {
          username = parts[2];
        }
      }

      if (!username) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Unauthorized',
            error: 'Unauthorized',
            statusCode: 401,
          }),
        });
        return;
      }

      const body = (await request.postDataJSON()) as {
        title: string;
        slug: string;
        description?: string;
      };

      // Validate required fields
      if (!body.title || !body.slug) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Title and slug are required',
            error: 'Bad Request',
            statusCode: 400,
          }),
        });
        return;
      }

      // Check for duplicate slug
      const existing = mockProjects.findBySlugAndUsername(username, body.slug);
      if (existing) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'A project with this slug already exists',
            error: 'Conflict',
            statusCode: 409,
          }),
        });
        return;
      }

      // Create new project
      const newProject: MockProjectDto = {
        id: Date.now().toString(),
        title: body.title,
        slug: body.slug,
        description: body.description,
        username,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockProjects.addProject(newProject);
      console.log(`Created project: ${newProject.title} (${newProject.slug})`);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newProject),
      });
      return;
    }
  });

  // GET /api/v1/projects/:username/:slug - Get specific project
  mockApi.addHandler('**/api/v1/projects/*/*', async (route: Route) => {
    const url = route.request().url();

    // Check if it's a cover image request
    if (url.endsWith('/cover')) {
      if (route.request().method() !== 'GET') {
        return;
      }

      const parts = url.split('/');
      parts.pop(); // Remove 'cover'
      const slug = parts.pop() || '';
      const username = parts.pop() || '';

      const project = mockProjects.findBySlugAndUsername(username, slug);

      // Return 404 immediately if project not found or no cover image
      // This prevents spamming FS checks
      if (!project || !project.coverImageUrl) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Cover image not found',
            error: 'Not Found',
            statusCode: 404,
          }),
        });
        return;
      }

      // Serve the actual image file
      // Convert the URL path to a file system path
      const imagePath = path.join(process.cwd(), '..', project.coverImageUrl);

      try {
        const imageBuffer = fs.readFileSync(imagePath);
        await route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: imageBuffer,
        });
      } catch (error) {
        console.error(`Failed to read cover image: ${imagePath}`, error);
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Cover image file not found',
            error: 'Not Found',
            statusCode: 404,
          }),
        });
      }
      return;
    }

    // Regular project GET request
    if (route.request().method() !== 'GET') {
      return;
    }

    const parts = url.split('/');
    const slug = parts.pop() || '';
    const username = parts.pop() || '';

    const project = mockProjects.findBySlugAndUsername(username, slug);
    if (!project) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Project not found',
          error: 'Not Found',
          statusCode: 404,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(project),
    });
  });

  // PATCH /api/v1/projects/:id - Update project
  mockApi.addHandler('**/api/v1/projects/*', async (route: Route) => {
    if (route.request().method() !== 'PATCH') {
      return;
    }

    const url = route.request().url();
    const projectId = url.split('/').pop() || '';

    const project = mockProjects.findById(projectId);
    if (!project) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Project not found',
          error: 'Not Found',
          statusCode: 404,
        }),
      });
      return;
    }

    const body = (await route
      .request()
      .postDataJSON()) as Partial<MockProjectDto>;
    mockProjects.updateProject(projectId, body);

    const updatedProject = mockProjects.findById(projectId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(updatedProject),
    });
  });

  // DELETE /api/v1/projects/:id - Delete project
  mockApi.addHandler('**/api/v1/projects/*', async (route: Route) => {
    if (route.request().method() !== 'DELETE') {
      return;
    }

    const url = route.request().url();
    const projectId = url.split('/').pop() || '';

    const project = mockProjects.findById(projectId);
    if (!project) {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Project not found',
          error: 'Not Found',
          statusCode: 404,
        }),
      });
      return;
    }

    mockProjects.deleteProject(projectId);
    console.log(`Deleted project: ${projectId}`);

    await route.fulfill({
      status: 204,
      contentType: 'application/json',
      body: '',
    });
  });
}
