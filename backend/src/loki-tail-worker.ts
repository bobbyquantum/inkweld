/**
 * Cloudflare Workers Tail Worker — Grafana Loki integration
 *
 * Receives tail events from the main inkweld Worker and forwards them to
 * Grafana Loki via the HTTP push API.
 *
 * Deploy separately with wrangler.loki-tail.toml.example.
 * Configure in the main wrangler.toml via [[tail_consumers]].
 *
 * Required secrets (set with `wrangler secret put --config wrangler.loki-tail.toml`):
 *   LOKI_URL      - Loki push API base URL
 *                   Grafana Cloud example: https://logs-prod-us-central1.grafana.net
 *                   Self-hosted example:   http://loki.internal:3100
 *   LOKI_USERNAME - Grafana Cloud tenant/user ID, or "admin" for self-hosted
 *   LOKI_API_KEY  - Grafana Cloud API key, or Loki password for self-hosted
 *
 * Optional vars (set in wrangler.loki-tail.toml [vars]):
 *   LOKI_ENVIRONMENT - Label value for the "environment" stream label
 *                      (e.g. "preview", "production"). Defaults to "unknown".
 */

export interface LokiTailEnv {
  LOKI_URL: string;
  LOKI_USERNAME: string;
  LOKI_API_KEY: string;
  LOKI_ENVIRONMENT?: string;
}

// ---------------------------------------------------------------------------
// Cloudflare Tail Worker types
// (subset of @cloudflare/workers-types TraceItem / TraceLog / TraceException)
// ---------------------------------------------------------------------------

interface TraceLog {
  timestamp: number;
  level: string;
  message: unknown[];
}

interface TraceException {
  timestamp: number;
  name: string;
  message: string;
}

interface TraceItem {
  scriptName: string | null;
  outcome: string;
  eventTimestamp: number | null;
  logs: TraceLog[];
  exceptions: TraceException[];
}

// ---------------------------------------------------------------------------
// Loki push API types
// ---------------------------------------------------------------------------

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiPushPayload {
  streams: LokiStream[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a millisecond timestamp to the nanosecond string Loki expects. */
function msToNs(ms: number): string {
  return String(BigInt(Math.floor(ms)) * 1_000_000n);
}

/**
 * Push a batch of streams to Loki.
 * Failures are logged to the tail worker's own console but do NOT throw —
 * Cloudflare won't retry tail events, so we fail silently to avoid noise.
 */
async function pushToLoki(payload: LokiPushPayload, env: LokiTailEnv): Promise<void> {
  const url = `${env.LOKI_URL.replace(/\/$/, '')}/loki/api/v1/push`;
  const credentials = btoa(`${env.LOKI_USERNAME}:${env.LOKI_API_KEY}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[LokiTail] Push failed: HTTP ${res.status} — ${body}`);
    }
  } catch (err) {
    console.error('[LokiTail] Push error:', err);
  }
}

// ---------------------------------------------------------------------------
// Tail handler
// ---------------------------------------------------------------------------

export default {
  async tail(events: TraceItem[], env: LokiTailEnv): Promise<void> {
    if (!env.LOKI_URL || !env.LOKI_USERNAME || !env.LOKI_API_KEY) {
      // Loki not configured — skip silently so misconfiguration doesn't break the worker.
      return;
    }

    const environment = env.LOKI_ENVIRONMENT ?? 'unknown';

    // Accumulate log lines per stream key to minimise the number of streams in
    // the push payload (Loki performs better with fewer, larger streams).
    const streamMap = new Map<string, LokiStream>();

    function getStream(scriptName: string, level: string): LokiStream {
      const key = `${scriptName}|${level}`;
      if (!streamMap.has(key)) {
        streamMap.set(key, {
          stream: {
            job: scriptName,
            environment,
            level,
            source: 'cloudflare-workers',
          },
          values: [],
        });
      }
      return streamMap.get(key)!;
    }

    for (const event of events) {
      const script = event.scriptName ?? 'inkweld-backend';
      const baseTs = event.eventTimestamp ?? Date.now();

      // --- Application log lines -------------------------------------------
      for (const log of event.logs ?? []) {
        const ts = log.timestamp ?? baseTs;
        const level = log.level ?? 'info';

        for (const msg of log.message) {
          const line = typeof msg === 'string' ? msg : JSON.stringify(msg);
          getStream(script, level).values.push([msToNs(ts), line]);
        }
      }

      // --- Unhandled exceptions ---------------------------------------------
      for (const exc of event.exceptions ?? []) {
        const ts = exc.timestamp ?? baseTs;
        const line = JSON.stringify({
          level: 'error',
          context: 'Worker',
          message: exc.message,
          error: { name: exc.name, message: exc.message },
          environment,
          outcome: event.outcome,
        });
        getStream(script, 'error').values.push([msToNs(ts), line]);
      }
    }

    const payload: LokiPushPayload = {
      streams: Array.from(streamMap.values()).filter((s) => s.values.length > 0),
    };

    if (payload.streams.length === 0) return;

    await pushToLoki(payload, env);
  },
};
