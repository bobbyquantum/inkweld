import { Hono } from 'hono';
import { generateCSRFToken } from '../middleware/csrf';

const csrfRoutes = new Hono();

// Get CSRF token
csrfRoutes.get('/token', (c) => {
  const req = c.req.raw as any;
  const session = req.session;

  if (!session) {
    return c.json({ error: 'No session' }, 401);
  }

  // Generate and store token in session
  if (!session.csrfToken) {
    session.csrfToken = generateCSRFToken();
  }

  return c.json({ token: session.csrfToken });
});

export default csrfRoutes;
