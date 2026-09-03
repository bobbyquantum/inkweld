-- Add per-user appearance state to the users table.
--
-- `hasBackground` mirrors the existing `hasAvatar` flag: the image bytes live
-- in storage (backgrounds/{username}), and this column records whether there
-- is anything there so rendering a user does not need a storage round-trip.
--
-- `preferences` is a JSON object holding device-independent UI preferences —
-- currently just the chosen background. One column rather than a table per
-- preference so later additions need no migration.
--
-- SQLite ALTER TABLE ADD COLUMN is non-destructive and requires no rebuild.

ALTER TABLE `users` ADD `hasBackground` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `preferences` text;
