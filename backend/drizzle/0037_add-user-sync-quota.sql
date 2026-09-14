-- Per-user sync-capacity model.
--
-- `syncQuotaBytes` is a nullable per-user override: NULL means "use the
-- instance-wide default" (the SYNC_QUOTA_DEFAULT_BYTES config key, 100 MB when
-- unset), so granting an individual more room does not require copying the
-- default into every existing row. 0 is an explicit zero allowance.
--
-- `storageUsedBytes` is the fast-path usage counter in bytes, maintained
-- incrementally on the write path and reconciled against the authoritative
-- per-project storage-size computation (getProjectStorageSize). It defaults to
-- 0 so existing rows are safe: the first reconcile recomputes real usage.
--
-- SQLite ALTER TABLE ADD COLUMN is non-destructive and requires no rebuild.

ALTER TABLE `users` ADD `syncQuotaBytes` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `storageUsedBytes` integer DEFAULT 0 NOT NULL;
