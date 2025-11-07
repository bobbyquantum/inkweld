import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { imageService } from '../services/image.service';
import { fileStorageService } from '../services/file-storage.service';
import { getDataSource } from '../config/database';
import { Project } from '../entities/project.entity';
import { HTTPException } from 'hono/http-exception';

const imageRoutes = new Hono();

// Upload project cover image
imageRoutes.post('/:username/:slug/cover', requireAuth, async (c) => {
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user').id;

  // Get the uploaded file
  const body = await c.req.parseBody();
  const file = body['cover'] as File;

  if (!file) {
    throw new HTTPException(400, { message: 'No file uploaded' });
  }

  // Verify project ownership
  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);
  const project = await projectRepo.findOne({
    where: { slug, user: { username } },
    relations: ['user'],
  });

  if (!project) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  if (project.user.id !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  // Read file buffer
  const buffer = Buffer.from(await file.arrayBuffer());

  // Validate image
  const validation = await imageService.validateImage(buffer);
  if (!validation.valid) {
    throw new HTTPException(400, { message: validation.error || 'Invalid image' });
  }

  // Process image
  const processedImage = await imageService.processCoverImage(buffer);

  // Save image
  await fileStorageService.saveProjectFile(username, slug, 'cover.jpg', processedImage);

  return c.json({ message: 'Cover image uploaded successfully' });
});

// Get project cover image
imageRoutes.get('/:username/:slug/cover', async (c) => {
  const username = c.req.param('username');
  const slug = c.req.param('slug');

  const exists = await fileStorageService.projectFileExists(username, slug, 'cover.jpg');

  if (!exists) {
    throw new HTTPException(404, { message: 'Cover image not found' });
  }

  const buffer = await fileStorageService.readProjectFile(username, slug, 'cover.jpg');

  return c.body(buffer, 200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': buffer.length.toString(),
  });
});

// Delete project cover image
imageRoutes.delete('/:username/:slug/cover', requireAuth, async (c) => {
  const username = c.req.param('username');
  const slug = c.req.param('slug');
  const userId = c.get('user').id;

  // Verify project ownership
  const dataSource = getDataSource();
  const projectRepo = dataSource.getRepository(Project);
  const project = await projectRepo.findOne({
    where: { slug, user: { username } },
    relations: ['user'],
  });

  if (!project) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  if (project.user.id !== userId) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const exists = await fileStorageService.projectFileExists(username, slug, 'cover.jpg');

  if (!exists) {
    throw new HTTPException(404, { message: 'Cover image not found' });
  }

  await fileStorageService.deleteProjectFile(username, slug, 'cover.jpg');

  return c.json({ message: 'Cover image deleted successfully' });
});

export default imageRoutes;
