/**
 * AI kill switch
 *
 * `AI_KILL_SWITCH` is the master switch for every AI feature (default ON =
 * AI disabled). When the `AI_KILL_SWITCH` environment variable is set it
 * locks the value and the admin toggle cannot change it; otherwise the
 * stored config value (database, then default) applies.
 *
 * Every route that sends content to an AI provider must be gated on this,
 * not only on the frontend hiding the feature.
 */
import type { Context, Next } from 'hono';
import { config } from '../config/env';
import { configService } from '../services/config.service';
import type { AppContext, DatabaseInstance } from '../types/context';

/** Error code returned (with HTTP 403) by AI endpoints while the switch is on. */
export const AI_DISABLED_CODE = 'AI_DISABLED';

export const AI_DISABLED_MESSAGE =
  'AI features are disabled on this server (the AI kill switch is on). An administrator can turn it off in Admin → AI settings.';

/**
 * Effective kill-switch state for a config value that was already loaded
 * (e.g. through `configService.getMany`). The environment lock wins.
 */
export function resolveAiKillSwitch(storedValue: string): boolean {
  if (config.aiKillSwitch.lockedByEnv) {
    return config.aiKillSwitch.enabled;
  }
  return storedValue === 'true' || storedValue === '1';
}

/** True when the AI kill switch is on, i.e. all AI features are disabled. */
export async function isAiKillSwitchOn(db: DatabaseInstance): Promise<boolean> {
  if (config.aiKillSwitch.lockedByEnv) {
    return config.aiKillSwitch.enabled;
  }
  const stored = await configService.get(db, 'AI_KILL_SWITCH');
  return resolveAiKillSwitch(stored.value);
}

/** Middleware: answer 403 `AI_DISABLED` while the AI kill switch is on. */
export const requireAiEnabled = async (c: Context<AppContext>, next: Next) => {
  if (await isAiKillSwitchOn(c.get('db'))) {
    return c.json({ error: AI_DISABLED_MESSAGE, code: AI_DISABLED_CODE }, 403);
  }
  return next();
};
