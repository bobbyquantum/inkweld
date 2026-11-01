/**
 * Whether MCP may be used at all on this server. The JSON-RPC endpoint and the
 * upload route both ask, so turning MCP off leaves no way in.
 */
import { configService } from '../services/config.service';
import type { DatabaseInstance } from '../types/context';
import { isAiKillSwitchOn } from '../utils/ai-kill-switch';

/** Why MCP cannot be used right now, or null when it can. */
export async function mcpUnavailableReason(db: DatabaseInstance): Promise<string | null> {
  if (await isAiKillSwitchOn(db)) {
    return 'MCP access is disabled by the AI kill switch';
  }
  if (!(await configService.getBoolean(db, 'MCP_ENABLED'))) {
    return 'MCP access is disabled by the administrator';
  }
  return null;
}
