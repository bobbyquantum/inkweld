import { Hono } from 'hono';

const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

healthRoutes.get('/ready', (c) => {
  // Check if database is connected
  // Could add more health checks here
  return c.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});

export default healthRoutes;
