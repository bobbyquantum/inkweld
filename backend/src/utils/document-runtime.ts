import type { Context } from 'hono';
import type { AppContext } from '../types/context';
import type { DocumentRuntime } from '../services/yjs-document-access';

/**
 * Where this request's Yjs documents live: on Workers the Durable Object
 * namespace plus the caller's bearer token (the DO verifies it itself); on
 * Bun no binding, so documents are read from the local `yjsService`.
 */
export function documentRuntime(c: Context<AppContext>): DocumentRuntime {
  const authHeader = c.req.header('Authorization') ?? '';
  return {
    env: c.env as DocumentRuntime['env'],
    authToken: authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '',
  };
}
