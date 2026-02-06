/**
 * Cloudflare Pages Function: Dynamic MCP redirect
 *
 * Provides a friendly URL for the MCP endpoint:
 * - preview.inkweld.app/mcp → api.preview.inkweld.app/api/v1/ai/mcp
 * - inkweld.app/mcp → api.inkweld.app/api/v1/ai/mcp
 *
 * This allows users to configure their AI assistants with a simple URL
 * instead of remembering the full API path.
 */

interface Env {
  // Add any environment bindings here if needed
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const hostname = url.hostname;

  // Determine the API backend URL based on the frontend hostname
  let apiHost: string;

  if (hostname.includes('preview.inkweld.app') || hostname.includes('pages.dev')) {
    // Preview/staging environment
    apiHost = 'api.preview.inkweld.app';
  } else if (hostname.includes('inkweld.app')) {
    // Production environment
    apiHost = 'api.inkweld.app';
  } else {
    // Local development or unknown - assume same host with port 8333
    apiHost = hostname.includes('localhost') ? 'localhost:8333' : `api.${hostname}`;
  }

  // Build the redirect URL preserving any query parameters
  const protocol = hostname.includes('localhost') ? 'http' : 'https';
  const redirectUrl = new URL(`${protocol}://${apiHost}/api/v1/ai/mcp`);
  redirectUrl.search = url.search; // Preserve query params

  return Response.redirect(redirectUrl.toString(), 302);
};
