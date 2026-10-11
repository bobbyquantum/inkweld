/**
 * Public landing page for shared published files: `GET /share/:shareToken`.
 *
 * This is the URL people copy from the publish dialog. It lives on the API
 * server (not in the Angular app) so it works on split deployments too; see
 * utils/share-page.ts. The file itself downloads from `/api/v1/share/:token`.
 */

import { Hono } from 'hono';

import { getAppName } from '../services/ai-provider-definitions';
import { findSharedFile } from '../services/share.service';
import type { AppContext } from '../types/context';
import {
  SHARE_PAGE_CSP,
  isWellFormedShareToken,
  renderShareNotFoundPage,
  renderSharePage,
  robotsTagFor,
} from '../utils/share-page';

const sharePageRoutes = new Hono<AppContext>();

sharePageRoutes.get('/:shareToken', async (c) => {
  const { shareToken } = c.req.param();
  const appName = getAppName(c);

  // The share state can change at any moment, so nothing may cache the page.
  c.header('Cache-Control', 'no-store');
  c.header('Content-Security-Policy', SHARE_PAGE_CSP);
  c.header('Referrer-Policy', 'no-referrer');

  const file = isWellFormedShareToken(shareToken)
    ? await findSharedFile(c.get('db'), shareToken)
    : null;

  if (!file) {
    c.header('X-Robots-Tag', 'noindex, nofollow');
    return c.html(renderShareNotFoundPage(appName), 404);
  }

  c.header('X-Robots-Tag', robotsTagFor(file.sharePermission));
  return c.html(
    renderSharePage(
      {
        filename: file.filename,
        format: file.format,
        size: file.size,
        title: file.metaTitle,
        author: file.metaAuthor,
        subtitle: file.metaSubtitle,
        createdAt: file.createdAt,
        sharePermission: file.sharePermission,
      },
      shareToken,
      appName
    )
  );
});

export default sharePageRoutes;
