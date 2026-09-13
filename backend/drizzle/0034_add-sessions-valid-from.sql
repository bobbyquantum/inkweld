-- Session revocation watermark.
--
-- Sessions are stateless JWTs with a 30-day expiry and no server-side record,
-- so until now nothing could invalidate one early: a password reset, a
-- passkey recovery or an admin disabling the account left every outstanding
-- token usable until it expired. `sessionsValidFrom` (unix seconds) is
-- compared against the token's `iat`; tokens issued before it are rejected.
--
-- SQLite ALTER TABLE ADD COLUMN is non-destructive and requires no rebuild.

ALTER TABLE `users` ADD `sessionsValidFrom` integer DEFAULT 0 NOT NULL;
