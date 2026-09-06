-- Profile banner flag.
--
-- `hasBanner` mirrors `hasAvatar` / `hasBackground`: the image bytes live in
-- storage (banners/{username}), and this column records whether there is
-- anything there so rendering a profile does not need a storage round-trip.
--
-- The owner's chosen profile *background* (a built-in preset, or plain) needs
-- no column: it lives in the existing `preferences` JSON blob.
--
-- SQLite ALTER TABLE ADD COLUMN is non-destructive and requires no rebuild.

ALTER TABLE `users` ADD `hasBanner` integer DEFAULT false NOT NULL;
