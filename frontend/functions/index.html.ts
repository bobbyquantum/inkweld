/**
 * Cloudflare Pages Function: Serve /index.html without 308 redirect
 *
 * Cloudflare Pages automatically canonicalizes /index.html → / with a 308
 * redirect. Angular's service worker (ngsw) needs /index.html to respond
 * with a normal 200 so it can cache the app shell for offline use.
 *
 * This function intercepts /index.html requests and serves the root content
 * directly, preventing the 308 redirect that breaks offline caching.
 */

interface Env {
  ASSETS: Fetcher;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  // Fetch the root path from ASSETS — serves index.html content without
  // the built-in 308 canonicalization redirect.
  const url = new URL(context.request.url);
  url.pathname = '/';
  url.search = ''; // Strip ngsw cache-bust params

  const response = await context.env.ASSETS.fetch(new Request(url));

  // Return the response with explicit 200 and correct content type
  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, must-revalidate',
    },
  });
};
