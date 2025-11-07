import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { getDataSource } from '../config/database';
import { Project } from '../entities/project.entity';

const projectRoutes = new Hono();

// Get all projects for current user
projectRoutes.get('/', requireAuth, async (c) => {
  const userId = c.get('user').id;
  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);

  const projects = await projectRepo.find({
    where: { user: { id: userId } },
    order: { updatedDate: 'DESC' },
  });

  return c.json(projects);
});

// Get single project
projectRoutes.get('/:id', requireAuth, async (c) => {
  const projectId = c.req.param('id');
  const userId = c.get('user').id;
  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);

  const project = await projectRepo.findOne({
    where: { id: projectId, user: { id: userId } },
  });

  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }

  return c.json(project);
});

// Create project (placeholder)
projectRoutes.post('/', requireAuth, async (c) => {
  // TODO: Implement project creation
  return c.json({ message: 'Project creation not yet implemented' });
});

// Update project (placeholder)
projectRoutes.put('/:id', requireAuth, async (c) => {
  // TODO: Implement project update
  return c.json({ message: 'Project update not yet implemented' });
});

// Delete project (placeholder)
projectRoutes.delete('/:id', requireAuth, async (c) => {
  // TODO: Implement project deletion
  return c.json({ message: 'Project deletion not yet implemented' });
});

export default projectRoutes;
