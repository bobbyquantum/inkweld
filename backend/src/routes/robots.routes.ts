/**
 * Robots.txt route
 *
 * Serves a robots.txt that allows search engines but blocks AI training crawlers.
 * Note: This is for direct backend access. The frontend serves its own robots.txt.
 */

import { Hono } from 'hono';

const robotsRoutes = new Hono();

const ROBOTS_TXT = `# Inkweld robots.txt
# Allow search engines, block AI training crawlers

# Allow all legitimate web crawlers
User-agent: *
Allow: /

# Block AI training/scraping bots
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: FacebookBot
Disallow: /

User-agent: Omgilibot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: cohere-ai
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

# Note: Legitimate AI assistants use authenticated MCP endpoints,
# not web crawling.
`;

robotsRoutes.get('/', (c) => {
  return c.text(ROBOTS_TXT, 200, {
    'Content-Type': 'text/plain',
    'Cache-Control': 'public, max-age=86400',
  });
});

export default robotsRoutes;
