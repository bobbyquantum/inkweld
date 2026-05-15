/**
 * Cloudflare Pages Function: Dynamic MCP redirect
 *
 * Provides a friendly URL for the MCP endpoint:
 *   /mcp → <api-backend-host>/api/v1/ai/mcp
 *
 * The API host is determined from the frontend hostname:
 *   - preview.<domain> → api.preview.<domain>
 *   - <domain>         → api.<domain>
 *   - localhost        → localhost:8333
 *   - *.pages.dev      → corresponding *.workers.dev (fallback: api.<hostname>)
 *
 * Custom BACKEND_API_HOST env var can override auto-detection.
 */
interface Env {
  BACKEND_API_HOST?: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const hostname = url.hostname;

  let apiHost: string;

  if (context.env.BACKEND_API_HOST) {
    apiHost = context.env.BACKEND_API_HOST;
  } else if (hostname.includes('localhost')) {
    apiHost = 'localhost:8333';
  } else if (hostname.startsWith('preview.')) {
    apiHost = `api.preview.${hostname.replace('preview.', '')}`;
  } else if (hostname.includes('pages.dev')) {
    apiHost = `api.${hostname}`;
  } else {
    apiHost = `api.${hostname}`;
  }

  const protocol = hostname.includes('localhost') ? 'http' : 'https';
  const redirectUrl = new URL(`${protocol}://${apiHost}/api/v1/ai/mcp`);
  redirectUrl.search = url.search;

  return Response.redirect(redirectUrl.toString(), 302);
};
