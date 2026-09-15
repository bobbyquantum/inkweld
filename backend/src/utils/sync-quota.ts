/**
 * Sync-capacity (storage quota) constants and parsing.
 *
 * The per-user allowance is stored on `users.syncQuotaBytes` as nullable
 * bytes; `NULL` means "use the instance default". The default itself lives in
 * the `SYNC_QUOTA_DEFAULT_BYTES` config key (admin-adjustable, env-overridable)
 * and falls back to {@link DEFAULT_SYNC_QUOTA_BYTES}.
 *
 * Keeping the parsing here — rather than inline in the config service — means
 * the future quota service and any admin UI share one definition of "valid
 * quota value", and a malformed value can never silently disable enforcement.
 */

/** 100 MB. */
export const DEFAULT_SYNC_QUOTA_BYTES = 100 * 1024 * 1024;

/** Largest supported allowance (1 TiB) — guards against accidental overflow. */
export const MAX_SYNC_QUOTA_BYTES = 1024 * 1024 * 1024 * 1024;

/**
 * Parse a configured/overridden quota into a non-negative byte count.
 *
 * Returns `undefined` when the input is absent or unusable (empty, not a
 * number, negative, `NaN`, `Infinity`, or above {@link MAX_SYNC_QUOTA_BYTES}),
 * letting callers fall back to the default rather than treating a bad value as
 * "no quota" or as zero. `0` is a deliberately valid value (zero allowance).
 *
 * Accepts numbers and numeric strings; a fractional value is floored.
 */
export function parseSyncQuotaBytes(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return undefined;

  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed < 0) return undefined;
  if (parsed > MAX_SYNC_QUOTA_BYTES) return undefined;

  return Math.floor(parsed);
}

/**
 * Resolve the allowance that applies to a user: their individual override when
 * present and valid, otherwise the instance default.
 *
 * A per-user `0` is an explicit zero allowance and is preserved; an invalid
 * override falls back to the default rather than blocking the account.
 *
 * Both values are taken as `unknown` because they arrive from a database row
 * and a text config column, where a driver may hand back a numeric string.
 */
export function resolveSyncQuotaBytes(userOverride: unknown, instanceDefault: unknown): number {
  const override = parseSyncQuotaBytes(userOverride);
  if (override !== undefined) return override;
  return parseSyncQuotaBytes(instanceDefault) ?? DEFAULT_SYNC_QUOTA_BYTES;
}
