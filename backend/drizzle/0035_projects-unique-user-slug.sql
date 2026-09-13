-- Enforce one slug per user at the database level.
--
-- Slug uniqueness was only a check-then-insert in the create and rename
-- routes; two concurrent requests both pass the check and leave duplicate
-- (user_id, slug) rows that share a single Yjs / storage namespace, one of
-- which becomes unreachable. The non-unique (user_id, slug) index from 0033
-- is superseded by this unique one and dropped.

CREATE UNIQUE INDEX IF NOT EXISTS `projects_user_slug_unique` ON `projects` (`user_id`,`slug`);--> statement-breakpoint
DROP INDEX IF EXISTS `projects_user_id_slug_idx`;
