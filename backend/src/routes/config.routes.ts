import { Hono } from 'hono';
import { config } from '../config/env';

const configRoutes = new Hono();

configRoutes.get('/', (c) => {
  return c.json({
    version: config.version,
    githubEnabled: config.github.enabled,
    userApprovalRequired: config.userApprovalRequired,
  });
});

export default configRoutes;
