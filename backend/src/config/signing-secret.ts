/**
 * The key that signs and verifies session tokens, MCP OAuth tokens, the MCP
 * layer's own tokens and the Durable Object's session check. One rule for all
 * of them, so a token one of them signs always verifies in the others.
 */
import { logger } from '../services/logger.service';
import { chooseSigningKey, processSigningKeys, type SigningKeySources } from './env';
import { runtimeEnv } from './runtime-env';

/**
 * No usable signing key. The error handler answers it with a generic 500 and
 * logs the message, which names the variable to set and never the key.
 */
export class SigningSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SigningSecretError';
  }
}

/**
 * DATABASE_KEY and SESSION_SECRET from the request's bindings, or undefined
 * when they carry neither (an empty value counts as unset).
 */
function keysFromBindings(bindings: unknown): SigningKeySources | undefined {
  if (bindings === null || typeof bindings !== 'object') return undefined;
  const { DATABASE_KEY, SESSION_SECRET } = bindings as SigningKeySources;
  const isSet = (value: unknown) => typeof value === 'string' && value !== '';
  return isSet(DATABASE_KEY) || isSet(SESSION_SECRET)
    ? { DATABASE_KEY, SESSION_SECRET }
    : undefined;
}

/** Warnings already logged by this process or isolate, so each is logged once. */
const loggedWarnings = new Set<string>();

/**
 * The signing key for a request: DATABASE_KEY, else SESSION_SECRET, from the
 * request's bindings (`c.env`, where Cloudflare Workers keep secrets), else
 * from the process environment (checked at start-up on Bun and Node). The rule
 * is `chooseSigningKey()` in env.ts, applied with the request's environment.
 *
 * Throws {@link SigningSecretError} when there is no usable key: nothing set,
 * or a key published in this repository, outside development and test; or a
 * key shorter than 32 characters.
 */
export function signingSecret(bindings?: unknown): string {
  const sources = keysFromBindings(bindings) ?? processSigningKeys;
  const choice = chooseSigningKey(sources, runtimeEnv(bindings));
  if ('problem' in choice) {
    throw new SigningSecretError(choice.problem);
  }
  if (choice.warning && !loggedWarnings.has(choice.warning)) {
    loggedWarnings.add(choice.warning);
    logger.warn('Config', choice.warning);
  }
  return choice.key;
}
