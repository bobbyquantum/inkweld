import { ToolError } from './tool';

/**
 * Resolve once `ready()` is true, checking every `intervalMs`. Used to wait
 * for UI state that follows a navigation (a project loading, an editor
 * connecting); resolves false on timeout and throws if the agent cancels.
 */
export function waitUntil(
  ready: () => boolean,
  signal: AbortSignal,
  timeoutMs = 20000,
  intervalMs = 100
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = (): void => {
      if (signal.aborted) {
        reject(new ToolError('Cancelled.'));
        return;
      }
      if (ready()) {
        resolve(true);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}
